import { useCallback, useEffect, useRef, useState } from 'react'
import { Editor } from './Editor'
import { Preview } from './Preview'
import { FileExplorer, type TreeNode } from './FileExplorer'
import { ConfirmModal } from './ConfirmModal'
import { TerminalDock } from './TerminalPanel'
import { fileMeta, langOf } from './fileMeta'
import '../ide.css'

type FileState = { content: string; dirty: boolean }
const DEFAULT_FILE = 'src/UserApp.tsx'

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
const loadSize = (key: string, fallback: number) => {
  const v = Number(localStorage.getItem(`ide.${key}`))
  return Number.isFinite(v) && v > 0 ? v : fallback
}
const saveSize = (key: string, v: number) => localStorage.setItem(`ide.${key}`, String(v))

export function EditorView({ project, onBack }: { project: string; onBack: () => void }) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [active, setActive] = useState('')
  const [tabs, setTabs] = useState<string[]>([])
  const [files, setFiles] = useState<Record<string, FileState>>({})
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewNonce, setPreviewNonce] = useState(0)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [saveFlash, setSaveFlash] = useState(false)
  const [delFile, setDelFile] = useState<string | null>(null)
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalPort, setTerminalPort] = useState(0)

  // Tamaños de paneles (redimensionables, persistidos en localStorage).
  const [explorerW, setExplorerW] = useState(() => loadSize('explorerW', 250))
  const [previewW, setPreviewW] = useState(() =>
    loadSize('previewW', Math.round(window.innerWidth * 0.4)),
  )
  const [termH, setTermH] = useState(() => loadSize('termH', 260))
  const [dragKind, setDragKind] = useState<'col' | 'row' | null>(null)

  useEffect(() => saveSize('explorerW', explorerW), [explorerW])
  useEffect(() => saveSize('previewW', previewW), [previewW])
  useEffect(() => saveSize('termH', termH), [termH])

  // Inicia el arrastre de un divisor. El "shield" evita que el iframe del
  // preview capture los eventos mientras se arrastra.
  const startDrag = (kind: 'explorer' | 'preview' | 'term') => (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startExplorer = explorerW
    const startPreview = previewW
    const startTerm = termH
    setDragKind(kind === 'term' ? 'row' : 'col')

    const onMove = (ev: PointerEvent) => {
      if (kind === 'explorer') {
        setExplorerW(clamp(startExplorer + (ev.clientX - startX), 160, 520))
      } else if (kind === 'preview') {
        setPreviewW(clamp(startPreview - (ev.clientX - startX), 260, window.innerWidth - 460))
      } else {
        setTermH(clamp(startTerm - (ev.clientY - startY), 120, window.innerHeight - 220))
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragKind(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const filesRef = useRef(files)
  filesRef.current = files
  const activeRef = useRef(active)
  activeRef.current = active

  const q = `?project=${encodeURIComponent(project)}`

  const loadTree = useCallback(
    () =>
      fetch(`/api/tree${q}`)
        .then((r) => r.json())
        .then((d) => setTree(d.tree ?? [])),
    [q],
  )

  const openFile = useCallback(
    async (path: string) => {
      setActive(path)
      setTabs((t) => (t.includes(path) ? t : [...t, path]))
      if (filesRef.current[path]) return
      try {
        const d = await (await fetch(`/api/file${q}&path=${encodeURIComponent(path)}`)).json()
        setFiles((f) => ({ ...f, [path]: { content: d.content ?? '', dirty: false } }))
      } catch {
        /* noop */
      }
    },
    [q],
  )

  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${encodeURIComponent(project)}/open`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => !cancelled && setPreviewUrl(d.url ?? ''))
      .catch(() => {})
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => !cancelled && setTerminalPort(d.terminalPort ?? 0))
      .catch(() => {})
    loadTree().then(() => {
      if (!cancelled) openFile(DEFAULT_FILE)
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
    try {
      const res = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, path, content: file.content }),
      })
      if (!res.ok) throw new Error(await res.text())
      setFiles((f) => ({ ...f, [path]: { ...f[path], dirty: false } }))
      setSaveFlash(true)
      setTimeout(() => setSaveFlash(false), 1200)
    } catch {
      /* noop */
    }
  }, [project])

  const onChange = (v: string) =>
    setFiles((f) => ({ ...f, [active]: { content: v, dirty: true } }))

  const closeTab = (path: string) => {
    setTabs((t) => {
      const idx = t.indexOf(path)
      const next = t.filter((p) => p !== path)
      if (path === activeRef.current) {
        const fallback = next[idx - 1] ?? next[0] ?? ''
        setActive(fallback)
      }
      return next
    })
  }

  const newFile = async (path: string) => {
    await fetch('/api/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, path, content: '' }),
    })
    await loadTree()
    setFiles((f) => ({ ...f, [path]: { content: '', dirty: false } }))
    setTabs((t) => (t.includes(path) ? t : [...t, path]))
    setActive(path)
  }

  const confirmDeleteFile = async () => {
    if (!delFile) return
    await fetch(`/api/file${q}&path=${encodeURIComponent(delFile)}`, { method: 'DELETE' })
    setFiles((f) => {
      const n = { ...f }
      delete n[delFile]
      return n
    })
    closeTab(delFile)
    setDelFile(null)
    await loadTree()
  }

  const current = files[active]
  const dirtyPaths = new Set(Object.entries(files).filter(([, v]) => v.dirty).map(([k]) => k))
  const segments = active ? active.split('/') : []

  return (
    <div className="ws-ide">
      {/* Toolbar superior */}
      <div className="ws-toolbar">
        <button className="ws-back" onClick={onBack} title="Volver a proyectos">
          ←
        </button>
        <span className="ws-module-icon" />
        <span className="ws-project">{project}</span>
        <span className="ws-sep">›</span>
        <span className="ws-dim">live·dev</span>
        <span className="ws-spacer" />
        <button className="ws-run" onClick={() => setPreviewNonce((n) => n + 1)} title="Recargar preview">
          <span className="ws-play" /> Preview
        </button>
      </div>

      {/* Cuerpo: Project | Editor | Preview (con divisores redimensionables) */}
      <div
        className="ws-body"
        style={{ gridTemplateColumns: `${explorerW}px 5px minmax(0, 1fr) 5px ${previewW}px` }}
      >
        <FileExplorer
          project={project}
          tree={tree}
          active={active}
          dirtyPaths={dirtyPaths}
          onOpen={openFile}
          onNewFile={newFile}
          onDeleteFile={setDelFile}
        />

        <div className="ws-split-v" onPointerDown={startDrag('explorer')} />

        <div className="ws-editor-area">
          <div className="ws-tabs">
            {tabs.map((path) => {
              const meta = fileMeta(path)
              return (
                <div
                  key={path}
                  className={`ws-tab ${path === active ? 'active' : ''}`}
                  onClick={() => openFile(path)}
                >
                  <span
                    className="ws-badge sm"
                    style={{ background: meta.color, color: meta.dark ? '#1c1c1c' : '#fff' }}
                  >
                    {meta.badge}
                  </span>
                  <span className="ws-tab-name">{path.split('/').pop()}</span>
                  {files[path]?.dirty && <span className="ws-dirty" />}
                  <button
                    className="ws-tab-close"
                    title="Cerrar"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(path)
                    }}
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>

          {active && (
            <div className="ws-breadcrumb">
              {segments.map((seg, i) => (
                <span key={i} className="ws-crumb">
                  {i === segments.length - 1 && (
                    <span
                      className="ws-badge xs"
                      style={{
                        background: fileMeta(active).color,
                        color: fileMeta(active).dark ? '#1c1c1c' : '#fff',
                      }}
                    >
                      {fileMeta(active).badge}
                    </span>
                  )}
                  {seg}
                  {i < segments.length - 1 && <span className="ws-crumb-sep">›</span>}
                </span>
              ))}
            </div>
          )}

          <div className="ws-monaco">
            {current ? (
              <Editor
                path={`${project}/${active}`}
                language={langOf(active)}
                value={current.content}
                onChange={onChange}
                onSave={save}
                onCursor={(line, col) => setCursor({ line, col })}
              />
            ) : (
              <div className="ws-no-file">Selecciona un archivo en el panel Project.</div>
            )}
          </div>
        </div>

        <div className="ws-split-v" onPointerDown={startDrag('preview')} />

        <Preview url={previewUrl} nonce={previewNonce} onReload={() => setPreviewNonce((n) => n + 1)} />
      </div>

      {/* Terminal integrada (PTY del proyecto), redimensionable en alto */}
      {showTerminal && terminalPort > 0 && (
        <div className="ws-terminal-wrap" style={{ height: termH }}>
          <div className="ws-split-h" onPointerDown={startDrag('term')} />
          <TerminalDock
            project={project}
            terminalPort={terminalPort}
            onClose={() => setShowTerminal(false)}
          />
        </div>
      )}

      {/* Shield: mantiene los eventos de arrastre fuera del iframe */}
      {dragKind && (
        <div
          className="ws-drag-shield"
          style={{ cursor: dragKind === 'row' ? 'row-resize' : 'col-resize' }}
        />
      )}

      {/* Status bar inferior (con el stripe de tool windows) */}
      <div className="ws-statusbar">
        <button
          className={`ws-tool-toggle ${showTerminal ? 'on' : ''}`}
          onClick={() => setShowTerminal((v) => !v)}
          title="Terminal (abajo)"
        >
          <span className="ws-term-icon">›_</span> Terminal
        </button>
        <span className="ws-status-divider" />
        <span className={`ws-status-conn ${previewUrl ? 'up' : ''}`}>
          <span className="ws-conn-dot" />
          {previewUrl ? `preview ${previewUrl.replace('http://', '')}` : 'iniciando…'}
        </span>
        {saveFlash && <span className="ws-saved">✓ guardado · hot reload</span>}
        <span className="ws-spacer" />
        {active && (
          <>
            <span>
              {cursor.line}:{cursor.col}
            </span>
            <span>2 espacios</span>
            <span>UTF-8</span>
            <span className="ws-filetype">{fileMeta(active).type}</span>
          </>
        )}
      </div>

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
