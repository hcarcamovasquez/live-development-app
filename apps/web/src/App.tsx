import { useCallback, useEffect, useRef, useState } from 'react'
import { Editor } from './components/Editor'
import { Preview } from './components/Preview'
import './App.css'

// Archivo del PROYECTO independiente que editamos (relativo a su raíz).
const FILE = 'src/UserApp.tsx'

type Status = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

function App() {
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>('loading')
  const [previewUrl, setPreviewUrl] = useState('')
  const dirty = useRef(false)

  // Ref con el código más reciente, para callbacks estables.
  const codeRef = useRef(code)
  codeRef.current = code

  // Carga inicial: contenido del archivo + URL del dev server del proyecto.
  useEffect(() => {
    fetch('/api/project')
      .then((r) => r.json())
      .then((d) => setPreviewUrl(d.url ?? ''))
      .catch(() => {})

    fetch(`/api/file?path=${encodeURIComponent(FILE)}`)
      .then((r) => r.json())
      .then((d) => {
        setCode(d.content ?? '')
        setStatus('idle')
      })
      .catch(() => setStatus('error'))
  }, [])

  const save = useCallback(async () => {
    setStatus('saving')
    try {
      const res = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: FILE, content: codeRef.current }),
      })
      if (!res.ok) throw new Error(await res.text())
      dirty.current = false
      setStatus('saved')
      setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1200)
    } catch {
      setStatus('error')
    }
  }, [])

  const onChange = (v: string) => {
    setCode(v)
    dirty.current = true
  }

  return (
    <div className="ide">
      <header className="topbar">
        <span className="brand">⚡ live-development-app</span>
        <span className="file">{FILE}</span>
        <span className="spacer" />
        <span className={`status status-${status}`}>
          {status === 'loading' && 'Cargando…'}
          {status === 'saving' && 'Guardando…'}
          {status === 'saved' && '✓ Guardado · hot reload →'}
          {status === 'error' && '✕ Error'}
          {status === 'idle' && (dirty.current ? 'Sin guardar' : 'Listo')}
        </span>
        <button className="save-btn" onClick={save}>
          Guardar (⌘/Ctrl+S)
        </button>
      </header>

      <main className="panes">
        <section className="pane editor-pane">
          <Editor value={code} onChange={onChange} onSave={save} />
        </section>
        <section className="pane preview-pane">
          <div className="preview-label">
            Proyecto independiente · {previewUrl || '…'}
          </div>
          <div className="preview-frame">
            <Preview url={previewUrl} />
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
