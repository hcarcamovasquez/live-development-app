import { createServer, type Server } from 'node:http'
import { WebSocketServer } from 'ws'
import * as pty from 'node-pty'
import { getProjectRow } from './db.js'
import { projectPath, slug } from './projects.js'
import { terminalPort } from './paths.js'

/**
 * Servidor de TERMINALES: un WebSocket que, por cada conexión, lanza una PTY
 * real (shell interactiva) anclada al directorio del proyecto. El navegador
 * (xterm.js) envía la entrada y recibe la salida en streaming, igual que la
 * terminal integrada de un IDE.
 *
 * Corre en su propio puerto para no chocar con el WebSocket de HMR de Vite.
 */
const SHELL = process.env.SHELL || 'bash'
const terminals = new Set<pty.IPty>()

export function startTerminalServer(): Server {
  const server = createServer()
  const wss = new WebSocketServer({ server })

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const s = slug(url.searchParams.get('project') ?? '')
    if (!s || !getProjectRow(s)) {
      ws.close(1008, 'Proyecto no encontrado')
      return
    }

    const term = pty.spawn(SHELL, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: projectPath(s),
      env: { ...process.env, TERM: 'xterm-256color' },
    })
    terminals.add(term)

    term.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(data)
    })
    term.onExit(() => {
      terminals.delete(term)
      if (ws.readyState === ws.OPEN) ws.close()
    })

    ws.on('message', (raw) => {
      let msg: { type?: string; data?: string; cols?: number; rows?: number }
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (msg.type === 'input' && typeof msg.data === 'string') {
        term.write(msg.data)
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        try {
          term.resize(msg.cols, msg.rows)
        } catch {
          /* noop */
        }
      }
    })

    ws.on('close', () => {
      terminals.delete(term)
      term.kill()
    })
  })

  server.listen(terminalPort, () => {
    console.log(`  ⌨  Terminal WS → ws://localhost:${terminalPort}`)
  })
  return server
}

/** Mata todas las PTYs (al cerrar el editor). */
export function stopTerminals(): void {
  for (const t of terminals) t.kill()
  terminals.clear()
}
