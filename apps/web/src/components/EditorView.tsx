import { useCallback, useEffect, useRef, useState } from 'react'
import { Editor } from './Editor'
import { Preview } from './Preview'

const FILE = 'src/UserApp.tsx'

type Status = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

export function EditorView({
  project,
  onBack,
}: {
  project: string
  onBack: () => void
}) {
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>('loading')
  const [previewUrl, setPreviewUrl] = useState('')
  const dirty = useRef(false)
  const codeRef = useRef(code)
  codeRef.current = code

  // Arranca el dev server del proyecto y carga el archivo a editar.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${encodeURIComponent(project)}/open`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => !cancelled && setPreviewUrl(d.url ?? ''))
      .catch(() => {})

    fetch(`/api/file?project=${encodeURIComponent(project)}&path=${encodeURIComponent(FILE)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setCode(d.content ?? '')
        setStatus('idle')
      })
      .catch(() => !cancelled && setStatus('error'))
    return () => {
      cancelled = true
    }
  }, [project])

  const save = useCallback(async () => {
    setStatus('saving')
    try {
      const res = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, path: FILE, content: codeRef.current }),
      })
      if (!res.ok) throw new Error(await res.text())
      dirty.current = false
      setStatus('saved')
      setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1200)
    } catch {
      setStatus('error')
    }
  }, [project])

  const onChange = (v: string) => {
    setCode(v)
    dirty.current = true
  }

  return (
    <div className="ide">
      <header className="ide-bar">
        <button className="back" onClick={onBack} title="Volver al listado">
          ←
        </button>
        <span className="bolt small">⚡</span>
        <span className="ide-project">{project}</span>
        <span className="ide-file">{FILE}</span>
        <span className="spacer" />
        <span className={`status ${statusClass(status, dirty.current)}`}>
          <span className="status-dot" />
          {statusLabel(status, dirty.current)}
        </span>
        <button className="btn-go sm" onClick={save}>
          Guardar <kbd>⌘S</kbd>
        </button>
      </header>

      <main className="panes">
        <section className="pane editor-pane">
          <Editor value={code} onChange={onChange} onSave={save} />
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
    </div>
  )
}

function statusClass(s: Status, dirtyNow: boolean): string {
  if (s === 'saved') return 'on'
  if (s === 'error') return 'err'
  if (s === 'saving') return 'busy'
  return dirtyNow ? 'busy' : 'off'
}

function statusLabel(s: Status, dirtyNow: boolean): string {
  if (s === 'loading') return 'cargando'
  if (s === 'saving') return 'guardando'
  if (s === 'saved') return 'guardado · hot reload'
  if (s === 'error') return 'error'
  return dirtyNow ? 'sin guardar' : 'listo'
}
