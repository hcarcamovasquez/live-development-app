import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

/**
 * Dock de terminales con sesiones PERSISTENTES en el servidor: cada pestaña tiene
 * un id estable (guardado por proyecto). Al recargar, se reconecta a la misma PTY
 * y el servidor reenvía el scrollback. Las inactivas se ocultan pero siguen vivas.
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
  // Ids cuya PTY debe matarse al desmontar (cierre explícito de pestaña).
  const killSet = useRef<Set<number>>(new Set())

  useEffect(() => saveTerms(project, state), [project, state])

  const setActive = (id: number) => setState((s) => ({ ...s, active: id }))

  const addTerm = () =>
    setState((s) => {
      const id = s.counter + 1
      return { ids: [...s.ids, id], active: id, counter: id }
    })

  const closeTerm = (id: number) => {
    killSet.current.add(id) // al desmontar, esta sí mata la PTY
    setState((s) => {
      const idx = s.ids.indexOf(id)
      const ids = s.ids.filter((t) => t !== id)
      if (ids.length === 0) {
        onClose()
        return s
      }
      const nextActive = id === s.active ? (ids[idx - 1] ?? ids[0]) : s.active
      return { ...s, ids, active: nextActive }
    })
  }

  return (
    <div className="ws-terminal">
      <div className="ws-term-head">
        <div className="ws-term-tabs">
          {terms.map((id, i) => (
            <button
              key={id}
              className={`ws-term-tab ${id === active ? 'active' : ''}`}
              onClick={() => setActive(id)}
            >
              <span className="ws-term-icon">›_</span>
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
        <span className="ws-term-cwd">~/.live-development-app/projects/{project}</span>
        <span className="ws-spacer" />
        <button className="ws-icon-btn" title="Ocultar panel" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="ws-term-bodies">
        {terms.map((id) => (
          <Term
            key={id}
            id={id}
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

/** Una sesión de terminal (xterm + WebSocket a una PTY persistente). */
function Term({
  id,
  project,
  terminalPort,
  hidden,
  killSet,
}: {
  id: number
  project: string
  terminalPort: number
  hidden: boolean
  killSet: Set<number>
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!hostRef.current) return
    let disposed = false

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      theme: {
        background: '#2b2b2b',
        foreground: '#cfd2d6',
        cursor: '#bbbbbb',
        selectionBackground: '#214283',
        black: '#2b2b2b',
        red: '#ff6b68',
        green: '#a8c023',
        yellow: '#d6bf55',
        blue: '#5394ec',
        magenta: '#ae8abe',
        cyan: '#299999',
        white: '#cfd2d6',
        brightBlack: '#5c6370',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(
      `${proto}://${location.hostname}:${terminalPort}/?project=${encodeURIComponent(project)}&id=${id}`,
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
      term.focus()
      sendResize()
    }
    ws.onmessage = (e) => term.write(typeof e.data === 'string' ? e.data : '')
    ws.onclose = () => {
      if (!disposed) term.write('\r\n\x1b[2m[sesión terminada]\x1b[0m\r\n')
    }

    const dataSub = term.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: d }))
      }
    })

    const ro = new ResizeObserver(() => sendResize())
    ro.observe(hostRef.current)

    return () => {
      disposed = true
      ro.disconnect()
      dataSub.dispose()
      // Cierre explícito de la pestaña -> mata la PTY en el servidor.
      // Desmontaje normal (toggle/navegar) -> solo desconecta; la PTY persiste.
      if (killSet.has(id) && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'kill' }))
      }
      ws.close()
      term.dispose()
      fitRef.current = null
    }
  }, [id, project, terminalPort, killSet])

  useEffect(() => {
    if (!hidden) fitRef.current?.()
  }, [hidden])

  return (
    <div className="ws-term-host" style={{ display: hidden ? 'none' : 'block' }} ref={hostRef} />
  )
}
