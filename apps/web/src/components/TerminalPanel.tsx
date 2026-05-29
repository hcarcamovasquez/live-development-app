import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

/**
 * Dock de terminales (estilo VS Code/WebStorm): varias sesiones en pestañas,
 * cada una con su propia PTY real en el servidor. Las sesiones inactivas se
 * ocultan (display:none) pero se mantienen vivas para conservar su estado.
 */
export function TerminalDock({
  project,
  terminalPort,
  onClose,
}: {
  project: string
  terminalPort: number
  onClose: () => void
}) {
  const [terms, setTerms] = useState<number[]>([1])
  const [active, setActive] = useState(1)
  const counter = useRef(1)

  const addTerm = () => {
    counter.current += 1
    const id = counter.current
    setTerms((t) => [...t, id])
    setActive(id)
  }

  const closeTerm = (id: number) => {
    setTerms((prev) => {
      const idx = prev.indexOf(id)
      const next = prev.filter((t) => t !== id)
      if (next.length === 0) {
        onClose()
        return prev
      }
      if (id === active) setActive(next[idx - 1] ?? next[0])
      return next
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
        <button className="ws-icon-btn" title="Cerrar panel" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="ws-term-bodies">
        {terms.map((id) => (
          <Term
            key={id}
            project={project}
            terminalPort={terminalPort}
            hidden={id !== active}
          />
        ))}
      </div>
    </div>
  )
}

/** Una sesión de terminal (xterm + WebSocket a una PTY). */
function Term({
  project,
  terminalPort,
  hidden,
}: {
  project: string
  terminalPort: number
  hidden: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!hostRef.current) return

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
      `${proto}://${location.hostname}:${terminalPort}/?project=${encodeURIComponent(project)}`,
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
    ws.onclose = () => term.write('\r\n\x1b[2m[sesión terminada]\x1b[0m\r\n')

    const dataSub = term.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: d }))
      }
    })

    const ro = new ResizeObserver(() => sendResize())
    ro.observe(hostRef.current)

    return () => {
      ro.disconnect()
      dataSub.dispose()
      ws.close()
      term.dispose()
      fitRef.current = null
    }
  }, [project, terminalPort])

  // Al volverse visible, reajusta el tamaño y enfoca.
  useEffect(() => {
    if (!hidden) fitRef.current?.()
  }, [hidden])

  return (
    <div className="ws-term-host" style={{ display: hidden ? 'none' : 'block' }} ref={hostRef} />
  )
}
