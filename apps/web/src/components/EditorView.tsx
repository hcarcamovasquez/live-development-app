import { useCallback, useEffect, useRef, useState } from 'react'
import { Editor } from './Editor'
import { Preview } from './Preview'
import { FileExplorer, type TreeNode } from './FileExplorer'
import { ConfirmModal } from './ConfirmModal'

type Status = 'idle' | 'loading' | 'saving' | 'saved' | 'error'
type FileState = { content: string; dirty: boolean }

const DEFAULT_FILE = 'src/UserApp.tsx'

export function EditorView({ project, onBack }: { project: string; onBack: () => void }) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [active, setActive] = useState('')
  const [files, setFiles] = useState<Record<string, FileState>>({})
  const [status, setStatus] = useState<Status>('loading')
  const [previewUrl, setPreviewUrl] = useState('')
  const [delFile, setDelFile] = useState<string | null>(null)
  const [, force] = useState(0)

  const filesRef = useRef(files)
  filesRef.current = files
  const activeRef = useRef(active)
  activeRef.current = active

  const api = `?project=${encodeURIComponent(project)}`

  const loadTree = useCallback(() => {
    return fetch(`/api/tree${api}`)
      .then((r) => r.json())
      .then((d) => setTree(d.tree ?? []))
  }, [api])

  const openFile = useCallback(
    async (path: string) => {
      setActive(path)
      if (filesRef.current[path]) {
        setStatus('idle')
        return
      }
      setStatus('loading')
      try {
        const d = await (
          await fetch(`/api/file${api}&path=${encodeURIComponent(path)}`)
        ).json()
        setFiles((f) => ({ ...f, [path]: { content: d.content ?? '', dirty: false } }))
        setStatus('idle')
      } catch {
        setStatus('error')
      }
    },
    [api],
  )

  // Arranca el dev server + carga el árbol y el archivo por defecto.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${encodeURIComponent(project)}/open`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => !cancelled && setPreviewUrl(d.url ?? ''))
      .catch(() => {})

    loadTree().then(() => {
      if (cancelled) return
      openFile(DEFAULT_FILE)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  const save = useCallback(async () => {
    const path = activeRef.current
    const file = filesRef.current[path]
    if (!path || !file) return
    setStatus('saving')
    try {
      const res = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, path, content: file.content }),
      })
      if (!res.ok) throw new Error(await res.text())
      setFiles((f) => ({ ...f, [path]: { ...f[path], dirty: false } }))
      setStatus('saved')
      setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1200)
    } catch {
      setStatus('error')
    }
  }, [project])

  const onChange = (v: string) => {
    setFiles((f) => ({ ...f, [active]: { content: v, dirty: true } }))
  }

  const newFile = async (path: string) => {
    await fetch('/api/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, path, content: '' }),
    })
    await loadTree()
    setFiles((f) => ({ ...f, [path]: { content: '', dirty: false } }))
    setActive(path)
    force((n) => n + 1)
  }

  const confirmDeleteFile = async () => {
    if (!delFile) return
    await fetch(`/api/file${api}&path=${encodeURIComponent(delFile)}`, { method: 'DELETE' })
    setFiles((f) => {
      const next = { ...f }
      delete next[delFile]
      return next
    })
    if (active === delFile) setActive('')
    setDelFile(null)
    await loadTree()
  }

  const current = files[active]
  const dirtyPaths = new Set(Object.entries(files).filter(([, v]) => v.dirty).map(([k]) => k))

  return (
    <div className="ide">
      <header className="ide-bar">
        <button className="back" onClick={onBack} title="Volver al listado">
          ←
        </button>
        <span className="bolt small">⚡</span>
        <span className="ide-project">{project}</span>
        <span className="ide-file">{active || 'sin archivo'}</span>
        <span className="spacer" />
        <span className={`status ${statusClass(status, current?.dirty)}`}>
          <span className="status-dot" />
          {statusLabel(status, current?.dirty)}
        </span>
        <button className="btn-go sm" onClick={save} disabled={!current}>
          Guardar <kbd>⌘S</kbd>
        </button>
      </header>

      <main className="panes panes-3">
        <FileExplorer
          project={project}
          tree={tree}
          active={active}
          dirtyPaths={dirtyPaths}
          onOpen={openFile}
          onNewFile={newFile}
          onDeleteFile={setDelFile}
        />

        <section className="pane editor-pane">
          {current ? (
            <Editor
              path={`${project}/${active}`}
              language={langOf(active)}
              value={current.content}
              onChange={onChange}
              onSave={save}
            />
          ) : (
            <div className="no-file">Selecciona un archivo en el explorador.</div>
          )}
        </section>

        <section className="pane preview-pane">
          <div className="preview-label">
            <span className={`status ${previewUrl ? 'on' : 'off'}`}>
              <span className="status-dot" />
            </span>
            preview · {previewUrl || 'arrancando dev server…'}
          </div>
          <div className="preview-frame">
            <Preview url={previewUrl} />
          </div>
        </section>
      </main>

      {delFile && (
        <ConfirmModal
          title="delete_file"
          message={
            <>
              ¿Borrar <code>{delFile}</code>? Esta acción no se puede deshacer.
            </>
          }
          onConfirm={confirmDeleteFile}
          onClose={() => setDelFile(null)}
        />
      )}
    </div>
  )
}

function langOf(path: string): string {
  if (/\.tsx?$/.test(path)) return 'typescript'
  if (/\.jsx?$/.test(path)) return 'javascript'
  if (/\.css$/.test(path)) return 'css'
  if (/\.html?$/.test(path)) return 'html'
  if (/\.json$/.test(path)) return 'json'
  if (/\.md$/.test(path)) return 'markdown'
  return 'plaintext'
}

function statusClass(s: Status, dirtyNow?: boolean): string {
  if (s === 'saved') return 'on'
  if (s === 'error') return 'err'
  if (s === 'saving') return 'busy'
  return dirtyNow ? 'busy' : 'off'
}

function statusLabel(s: Status, dirtyNow?: boolean): string {
  if (s === 'loading') return 'cargando'
  if (s === 'saving') return 'guardando'
  if (s === 'saved') return 'guardado · hot reload'
  if (s === 'error') return 'error'
  return dirtyNow ? 'sin guardar' : 'listo'
}
