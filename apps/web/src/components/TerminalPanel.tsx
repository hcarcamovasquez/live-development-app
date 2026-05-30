import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

/**
 * Panel inferior con dos pestañas al estilo VS Code: "App" y "Terminal".
 *  - App: salida del dev server (install + vite), controlada con Run/Stop. No PTY.
 *  - Terminal: una o más shells (PTY) persistentes, con sub-pestañas y "+".
 */
type Panel = 'app' | 'terminal'
type DockState = { panel: Panel; ids: number[]; active: number; counter: number }

function loadDock(project: string): DockState {
  try {
    const s = JSON.parse(localStorage.getItem(`ide.dock.${project}`) ?? 'null')
    if (s && Array.isArray(s.ids)) {
      return { panel: s.panel ?? 'app', ids: s.ids, active: s.active ?? 0, counter: s.counter ?? 0 }
    }
  } catch {
    /* noop */
  }
  return { panel: 'app', ids: [], active: 0, counter: 0 }
}
function saveDock(project: string, s: DockState) {
  localStorage.setItem(`ide.dock.${project}`, JSON.stringify(s))
}

const STATUS_LABEL: Record<string, string> = {
  idle: 'detenida',
  installing: 'instalando…',
  starting: 'arrancando…',
  running: 'corriendo',
  error: 'error',
}

export function TerminalDock({
  project,
  terminalPort,
  appStatus,
  onRun,
  onStop,
  onClose,
}: {
  project: string
  terminalPort: number
  appStatus: string
  onRun: () => void
  onStop: () => void
  onClose: () => void
}) {
  const [st, setSt] = useState<DockState>(() => loadDock(project))
  const { panel, ids: terms, active } = st
  const killSet = useRef<Set<number>>(new Set())

  useEffect(() => saveDock(project, st), [project, st])

  const showApp = () => setSt((s) => ({ ...s, panel: 'app' }))
  const showTerminal = () =>
    setSt((s) =>
      s.ids.length === 0
        ? { ...s, panel: 'terminal', ids: [s.counter + 1], active: s.counter + 1, counter: s.counter + 1 }
        : { ...s, panel: 'terminal' },
    )
  const setActive = (id: number) => setSt((s) => ({ ...s, active: id }))
  const addTerm = () =>
    setSt((s) => {
      const id = s.counter + 1
      return { ...s, panel: 'terminal', ids: [...s.ids, id], active: id, counter: id }
    })
  const closeTerm = (id: number) => {
    killSet.current.add(id)
    setSt((s) => {
      const ids = s.ids.filter((t) => t !== id)
      return { ...s, ids, active: id === s.active ? (ids[ids.length - 1] ?? 0) : s.active }
    })
  }

  const busy = appStatus === 'running' || appStatus === 'starting' || appStatus === 'installing'

  return (
    <div className="ws-terminal">
      <div className="ws-term-head">
        {/* Pestañas del panel: App | Terminal */}
        <div className="ws-panel-tabs">
          <button className={`ws-panel-tab ${panel === 'app' ? 'active' : ''}`} onClick={showApp}>
            <span className={`ws-app-dot ${appStatus}`} /> App
          </button>
          <button
            className={`ws-panel-tab ${panel === 'terminal' ? 'active' : ''}`}
            onClick={showTerminal}
          >
            <span className="ws-term-icon">›_</span> Terminal
          </button>
        </div>

        <span className="ws-head-sep" />

        {panel === 'app' ? (
          <div className="ws-app-controls">
            {busy ? (
              <button className="ws-app-stop" onClick={onStop} title="Detener app">
                ■ Stop
              </button>
            ) : (
              <button className="ws-app-run" onClick={onRun} title="Instalar y arrancar app">
                ▶ Run
              </button>
            )}
            <span className="ws-app-status">{STATUS_LABEL[appStatus] ?? appStatus}</span>
          </div>
        ) : (
          <div className="ws-term-tabs">
            {terms.map((id, i) => (
              <button
                key={id}
                className={`ws-term-tab ${id === active ? 'active' : ''}`}
                onClick={() => setActive(id)}
              >
                Local{i > 0 ? ` (${i + 1})` : ''}
                <span
                  className="ws-term-tab-close"
                  title="Cerrar sesión"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTerm(id)
                  }}
                >
                  ✕
                </span>
              </button>
            ))}
            <button className="ws-term-add" title="Nueva terminal" onClick={addTerm}>
              +
            </button>
          </div>
        )}

        <span className="ws-spacer" />
        <button className="ws-icon-btn" title="Ocultar panel" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="ws-term-bodies">
        {/* App (output-only) */}
        <Term
          key="app"
          wsId="__app__"
          numId={-1}
          project={project}
          terminalPort={terminalPort}
          hidden={panel !== 'app'}
          readOnly
          killSet={killSet.current}
        />
        {/* Terminales (PTY) */}
        {terms.map((id) => (
          <Term
            key={id}
            wsId={String(id)}
            numId={id}
            project={project}
            terminalPort={terminalPort}
            hidden={panel !== 'terminal' || id !== active}
            killSet={killSet.current}
          />
        ))}
        {panel === 'terminal' && terms.length === 0 && (
          <div className="ws-term-empty">Sin terminales. Pulsa + para abrir una.</div>
        )}
      </div>
    </div>
  )
}

function Term({
  wsId,
  numId,
  project,
  terminalPort,
  hidden,
  readOnly = false,
  killSet,
}: {
  wsId: string
  numId: number
  project: string
  terminalPort: number
  hidden: boolean
  readOnly?: boolean
  killSet: Set<number>
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!hostRef.current) return

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: !readOnly,
      disableStdin: readOnly,
      theme: {
        background: '#2b2b2b',
        foreground: '#cfd2d6',
        cursor: readOnly ? '#2b2b2b' : '#bbbbbb',
        selectionBackground: '#214283',
        red: '#ff6b68',
        green: '#a8c023',
        yellow: '#d6bf55',
        blue: '#5394ec',
        magenta: '#ae8abe',
        cyan: '#299999',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(
      `${proto}://${location.hostname}:${terminalPort}/?project=${encodeURIComponent(project)}&id=${wsId}`,
    )

    const sendResize = () => {
      try {
        fit.fit()
      } catch {
        /* noop */
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    }
    fitRef.current = sendResize

    ws.onopen = () => {
      if (!readOnly) term.focus()
      sendResize()
    }
    ws.onmessage = (e) => term.write(typeof e.data === 'string' ? e.data : '')

    const dataSub = readOnly
      ? null
      : term.onData((d) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data: d }))
        })

    const ro = new ResizeObserver(() => sendResize())
    ro.observe(hostRef.current)

    return () => {
      ro.disconnect()
      dataSub?.dispose()
      if (!readOnly && killSet.has(numId) && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'kill' }))
      }
      ws.close()
      term.dispose()
      fitRef.current = null
    }
  }, [wsId, numId, project, terminalPort, readOnly, killSet])

  useEffect(() => {
    if (!hidden) fitRef.current?.()
  }, [hidden])

  return (
    <div className="ws-term-host" style={{ display: hidden ? 'none' : 'block' }} ref={hostRef} />
  )
}
