import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const STATUS_LABEL: Record<string, string> = {
  idle: 'detenida',
  installing: 'instalando…',
  starting: 'arrancando…',
  running: 'corriendo',
  error: 'error',
}

/**
 * Terminal AISLADA de la app: una sola sesión (output del dev server), con
 * controles Run/Stop. No permite abrir más pestañas: es solo para iniciar la app.
 */
export function AppTerminal({
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
  const busy = appStatus === 'running' || appStatus === 'starting' || appStatus === 'installing'
  return (
    <div className="ws-terminal">
      <div className="ws-term-head">
        <span className="ws-term-fixed">
          <span className={`ws-app-dot ${appStatus}`} /> App
        </span>
        <span className="ws-head-sep" />
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
        <span className="ws-spacer" />
        <button className="ws-icon-btn" title="Ocultar" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="ws-term-bodies">
        <Term wsId="__app__" numId={-1} project={project} terminalPort={terminalPort} readOnly />
      </div>
    </div>
  )
}

/**
 * Dock de terminales (shells PTY). Permite varias sesiones en pestañas y "+".
 */
type TermsState = { ids: number[]; active: number; counter: number }
function loadTerms(project: string): TermsState {
  try {
    const s = JSON.parse(localStorage.getItem(`ide.terms.${project}`) ?? 'null')
    if (s && Array.isArray(s.ids) && s.ids.length) return s
  } catch {
    /* noop */
  }
  return { ids: [1], active: 1, counter: 1 }
}
function saveTerms(project: string, s: TermsState) {
  localStorage.setItem(`ide.terms.${project}`, JSON.stringify(s))
}

export function TerminalDock({
  project,
  terminalPort,
  onClose,
}: {
  project: string
  terminalPort: number
  onClose: () => void
}) {
  const [state, setState] = useState<TermsState>(() => loadTerms(project))
  const { ids: terms, active } = state
  const killSet = useRef<Set<number>>(new Set())

  useEffect(() => saveTerms(project, state), [project, state])

  const setActive = (id: number) => setState((s) => ({ ...s, active: id }))
  const addTerm = () =>
    setState((s) => {
      const id = s.counter + 1
      return { ids: [...s.ids, id], active: id, counter: id }
    })
  const closeTerm = (id: number) => {
    killSet.current.add(id)
    setState((s) => {
      const ids = s.ids.filter((t) => t !== id)
      if (ids.length === 0) {
        onClose()
        return s
      }
      return { ...s, ids, active: id === s.active ? ids[ids.length - 1] : s.active }
    })
  }

  return (
    <div className="ws-terminal">
      <div className="ws-term-head">
        <span className="ws-term-fixed">
          <span className="ws-term-icon">›_</span> Terminal
        </span>
        <span className="ws-head-sep" />
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
        <span className="ws-spacer" />
        <button className="ws-icon-btn" title="Ocultar" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="ws-term-bodies">
        {terms.map((id) => (
          <Term
            key={id}
            wsId={String(id)}
            numId={id}
            project={project}
            terminalPort={terminalPort}
            hidden={id !== active}
            killSet={killSet.current}
          />
        ))}
      </div>
    </div>
  )
}

function Term({
  wsId,
  numId,
  project,
  terminalPort,
  hidden = false,
  readOnly = false,
  killSet,
}: {
  wsId: string
  numId: number
  project: string
  terminalPort: number
  hidden?: boolean
  readOnly?: boolean
  killSet?: Set<number>
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
      if (!readOnly && killSet?.has(numId) && ws.readyState === WebSocket.OPEN) {
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
