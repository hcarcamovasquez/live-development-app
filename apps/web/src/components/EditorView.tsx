import { useCallback, useEffect, useRef, useState } from 'react'
import { Editor } from './Editor'
import { Preview } from './Preview'
import { FileExplorer } from './FileExplorer'
import { GitPanel } from './GitPanel'
import { DiffView } from './DiffView'
import { ConfirmModal } from './ConfirmModal'
import { TerminalDock, AppTerminal } from './TerminalPanel'
import { AIChat } from './AIChat'
import { fileMeta, langOf } from './fileMeta'
import '../ide.css'

type Diff = { path: string; original: string; modified: string }

type FileState = { content: string; dirty: boolean }
const DEFAULT_FILE = 'src/UserApp.tsx'

function FullscreenIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={
          active
            ? 'M6 2v4H2 M14 6h-4V2 M10 14v-4h4 M2 10h4v4'
            : 'M2 6V2h4 M10 2h4v4 M14 10v4h-4 M6 14H2v-4'
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
const loadSize = (key: string, fallback: number) => {
  const v = Number(localStorage.getItem(`ide.${key}`))
  return Number.isFinite(v) && v > 0 ? v : fallback
}
const saveSize = (key: string, v: number) => localStorage.setItem(`ide.${key}`, String(v))

// Sesión por proyecto: pestañas abiertas y archivo activo.
type Session = { tabs: string[]; active: string }
const loadSession = (project: string): Session | null => {
  try {
    return JSON.parse(localStorage.getItem(`ide.session.${project}`) ?? 'null')
  } catch {
    return null
  }
}
const saveSession = (project: string, s: Session) =>
  localStorage.setItem(`ide.session.${project}`, JSON.stringify(s))

export function EditorView({ project, onBack }: { project: string; onBack: () => void }) {
  const [active, setActive] = useState('')
  const [tabs, setTabs] = useState<string[]>([])
  const [files, setFiles] = useState<Record<string, FileState>>({})
  const [treeReload, setTreeReload] = useState(0) // bump para refrescar el explorador
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewNonce, setPreviewNonce] = useState(0)
  const [appStatus, setAppStatus] = useState<string>('idle')
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [saveFlash, setSaveFlash] = useState(false)
  const [delFile, setDelFile] = useState<string | null>(null)
  // Panel inferior: 'app' | 'terminal' (shells) | 'ai' (OpenCode) | 'none'.
  const [dock, setDock] = useState<'none' | 'terminal' | 'app' | 'ai'>('app')
  const toggleDock = (which: 'terminal' | 'app' | 'ai') =>
    setDock((d) => (d === which ? 'none' : which))
  const [leftView, setLeftView] = useState<'files' | 'git'>('files')
  const [leftOpen, setLeftOpen] = useState(() => localStorage.getItem('ide.leftOpen') !== '0')
  const [diff, setDiff] = useState<Diff | null>(null)

  useEffect(() => {
    localStorage.setItem('ide.leftOpen', leftOpen ? '1' : '0')
  }, [leftOpen])

  // Clic en un icono: abre esa vista; clic de nuevo en la activa la cierra.
  const toggleLeft = (view: 'files' | 'git') => {
    if (leftOpen && leftView === view) setLeftOpen(false)
    else {
      setLeftView(view)
      setLeftOpen(true)
    }
  }
  const [showPreview, setShowPreview] = useState(() => localStorage.getItem('ide.showPreview') !== '0')
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    localStorage.setItem('ide.showPreview', showPreview ? '1' : '0')
  }, [showPreview])

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen?.()
  }

  const openDiff = (path: string) => {
    fetch(`/api/git/diff${q}&path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => setDiff({ path, original: d.original ?? '', modified: d.modified ?? '' }))
      .catch(() => {})
  }

  // Tras descartar cambios, refresca el buffer del archivo si está abierto.
  const reloadFile = (path: string) => {
    fetch(`/api/file${q}&path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.content === 'string') {
          setFiles((f) => (f[path] ? { ...f, [path]: { content: d.content, dirty: false } } : f))
        }
      })
      .catch(() => {})
      .finally(() => setTreeReload((k) => k + 1))
  }

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
  // Evita guardar la sesión antes de haberla restaurado (no pisar con vacío).
  const restoredRef = useRef(false)

  const q = `?project=${encodeURIComponent(project)}`

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
    restoredRef.current = false
    // Restaura la sesión (pestañas). Archivos inexistentes se ignoran al abrir.
    const session = loadSession(project)
    const saved = session?.tabs ?? []
    if (saved.length) {
      setTabs(saved)
      openFile(session?.active && saved.includes(session.active) ? session.active : saved[0])
    } else {
      openFile(DEFAULT_FILE)
    }
    restoredRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  // Estado de la app (dev server): polling. Define previewUrl cuando está corriendo.
  useEffect(() => {
    let alive = true
    const tick = () =>
      fetch(`/api/app/${encodeURIComponent(project)}`)
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return
          setAppStatus(d.status ?? 'idle')
          setPreviewUrl(d.url ?? '')
        })
        .catch(() => {})
    tick()
    const iv = setInterval(tick, 2000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [project])

  // Al cerrar la pestaña del workspace se detiene la app (el contenedor además
  // baja todo en SIGTERM). No se detiene al navegar dentro del propio workspace.
  useEffect(() => {
    const stop = () => navigator.sendBeacon(`/api/app/${encodeURIComponent(project)}/stop`)
    window.addEventListener('beforeunload', stop)
    return () => window.removeEventListener('beforeunload', stop)
  }, [project])

  const runApp = () => {
    fetch(`/api/app/${encodeURIComponent(project)}/run`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => setAppStatus(d.status ?? 'idle'))
      .catch(() => {})
  }
  const stopApp = () => {
    fetch(`/api/app/${encodeURIComponent(project)}/stop`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        setAppStatus(d.status ?? 'idle')
        setPreviewUrl('')
      })
      .catch(() => {})
  }

  // Persiste la sesión (pestañas/activo/terminal) cuando cambia, ya restaurada.
  useEffect(() => {
    if (!restoredRef.current) return
    saveSession(project, { tabs, active })
  }, [project, tabs, active])

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
    setFiles((f) => ({ ...f, [path]: { content: '', dirty: false } }))
    setTabs((t) => (t.includes(path) ? t : [...t, path]))
    setActive(path)
    setTreeReload((k) => k + 1)
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
    setTreeReload((k) => k + 1)
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
        <button
          className={`ws-toolbtn ${showPreview ? 'on' : ''}`}
          onClick={() => setShowPreview((v) => !v)}
          title={showPreview ? 'Ocultar preview' : 'Mostrar preview'}
        >
          <span className="ws-eye" />
        </button>
        <button
          className="ws-toolbtn"
          onClick={toggleFullscreen}
          title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          <FullscreenIcon active={fullscreen} />
        </button>
      </div>

      {/* Cuerpo: Project | Editor | Preview (con divisores redimensionables) */}
      <div
        className="ws-body"
        style={{
          gridTemplateColumns: [
            '46px',
            ...(leftOpen ? [`${explorerW}px`, '5px'] : []),
            'minmax(0, 1fr)',
            ...(showPreview ? ['5px', `${previewW}px`] : []),
          ].join(' '),
        }}
      >
        <div className="ws-rail">
          <button
            className={`ws-rail-btn ${leftOpen && leftView === 'files' ? 'on' : ''}`}
            title="Project"
            onClick={() => toggleLeft('files')}
          >
            ▤
          </button>
          <button
            className={`ws-rail-btn ${leftOpen && leftView === 'git' ? 'on' : ''}`}
            title="Source Control"
            onClick={() => toggleLeft('git')}
          >
            ⎇
          </button>
        </div>

        {leftOpen && (
          <>
            {leftView === 'files' ? (
              <FileExplorer
                project={project}
                reloadKey={treeReload}
                active={active}
                dirtyPaths={dirtyPaths}
                onOpen={openFile}
                onNewFile={newFile}
                onDeleteFile={setDelFile}
              />
            ) : (
              <GitPanel
                project={project}
                activePath={diff?.path ?? ''}
                onOpenDiff={openDiff}
                onReloadFile={reloadFile}
              />
            )}
            <div className="ws-split-v" onPointerDown={startDrag('explorer')} />
          </>
        )}

        <div className="ws-editor-area">
          {diff ? (
            <DiffView
              path={diff.path}
              original={diff.original}
              modified={diff.modified}
              onClose={() => setDiff(null)}
            />
          ) : (
            <>
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
            </>
          )}
        </div>

        {showPreview && (
          <>
            <div className="ws-split-v" onPointerDown={startDrag('preview')} />
            <Preview
              url={previewUrl}
              nonce={previewNonce}
              onReload={() => setPreviewNonce((n) => n + 1)}
            />
          </>
        )}
      </div>

      {/* Panel inferior (App / Terminal), redimensionable en alto */}
      {dock !== 'none' && (
        <div className="ws-terminal-wrap" style={{ height: termH }}>
          <div className="ws-split-h" onPointerDown={startDrag('term')} />
          {dock === 'app' ? (
            <AppTerminal
              project={project}
              appStatus={appStatus}
              onRun={runApp}
              onStop={stopApp}
              onClose={() => setDock('none')}
            />
          ) : dock === 'ai' ? (
            <AIChat project={project} onClose={() => setDock('none')} />
          ) : (
            <TerminalDock project={project} onClose={() => setDock('none')} />
          )}
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
          className={`ws-tool-toggle ${dock === 'terminal' ? 'on' : ''}`}
          onClick={() => toggleDock('terminal')}
          title="Terminal (shells)"
        >
          <span className="ws-term-icon">›_</span> Terminal
        </button>
        <span className="ws-status-divider" />
        <button
          className={`ws-tool-toggle ${dock === 'app' ? 'on' : ''}`}
          onClick={() => toggleDock('app')}
          title="App (iniciar/detener el dev server)"
        >
          <span className={`ws-app-dot ${appStatus}`} /> App
        </button>
        <span className="ws-status-divider" />
        <button
          className={`ws-tool-toggle ${dock === 'ai' ? 'on' : ''}`}
          onClick={() => toggleDock('ai')}
          title="AI (asistente de código)"
        >
          ✦ AI
        </button>
        {showPreview && (
          <>
            <span className="ws-status-divider" />
            <span className={`ws-status-conn ${previewUrl ? 'up' : ''}`}>
              <span className="ws-conn-dot" />
              {previewUrl
                ? `preview ${previewUrl.replace('http://', '')}`
                : appStatus === 'installing'
                  ? 'instalando…'
                  : appStatus === 'starting'
                    ? 'arrancando…'
                    : appStatus === 'error'
                      ? 'error'
                      : 'app detenida'}
            </span>
          </>
        )}
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
