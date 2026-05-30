import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, WebSocket } from 'ws'
import * as pty from 'node-pty'
import { getProjectRow } from './db.js'
import { projectPath, slug } from './projects.js'
import { attachAppClient } from './apprunner.js'

/**
 * TERMINALES con sesiones PERSISTENTES, servidas por WebSocket en el MISMO
 * origen que el editor (ruta /ws/terminal). No abre un puerto propio: se adjunta
 * al http.Server del editor vía handleTerminalUpgrade().
 *
 * Cada PTY se identifica por `${proyecto}::${id}` y SOBREVIVE a la desconexión
 * (recargar el navegador): al reconectar con el mismo id se re-engancha la misma
 * shell y se reenvía el buffer (scrollback). El id `__app__` enruta a la salida
 * del dev server (apprunner), no a una PTY.
 */
const SHELL = process.env.SHELL || 'bash'
const MAX_BUFFER = 200_000 // ~200 KB de scrollback por sesión
const IDLE_MS = 30 * 60_000 // 30 min sin cliente -> se recicla

type Session = {
  term: pty.IPty
  buffer: string
  attached: WebSocket | null
  idle: ReturnType<typeof setTimeout> | null
}
const sessions = new Map<string, Session>()

const wss = new WebSocketServer({ noServer: true })

/** Adjunta un upgrade de /ws/terminal al http.Server del editor. */
export function handleTerminalUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
}

export function startTerminalServer(): void {
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const s = slug(url.searchParams.get('project') ?? '')
    const id = url.searchParams.get('id') || '1'
    if (!s || !getProjectRow(s)) {
      ws.close(1008, 'Proyecto no encontrado')
      return
    }

    // Terminal especial "App": salida del dev server (no es una PTY/shell).
    if (id === '__app__') {
      attachAppClient(s, ws)
      return
    }

    const key = `${s}::${id}`

    // Reutiliza la sesión existente o crea una nueva PTY.
    let session = sessions.get(key)
    if (!session) {
      const term = pty.spawn(SHELL, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: projectPath(s),
        env: { ...process.env, TERM: 'xterm-256color' },
      })
      const created: Session = { term, buffer: '', attached: null, idle: null }
      sessions.set(key, created)
      term.onData((data) => {
        created.buffer += data
        if (created.buffer.length > MAX_BUFFER) {
          created.buffer = created.buffer.slice(-MAX_BUFFER)
        }
        if (created.attached?.readyState === WebSocket.OPEN) created.attached.send(data)
      })
      term.onExit(() => {
        if (created.attached?.readyState === WebSocket.OPEN) created.attached.close()
        sessions.delete(key)
      })
      session = created
    }

    // (Re)engancha este WebSocket a la sesión.
    if (session.idle) {
      clearTimeout(session.idle)
      session.idle = null
    }
    if (session.attached && session.attached !== ws && session.attached.readyState === WebSocket.OPEN) {
      session.attached.close() // un único cliente activo por sesión
    }
    session.attached = ws

    // Reenvía el scrollback acumulado para reconstruir el estado visible.
    if (session.buffer && ws.readyState === WebSocket.OPEN) ws.send(session.buffer)

    const sess = session
    ws.on('message', (raw) => {
      let msg: { type?: string; data?: string; cols?: number; rows?: number }
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (msg.type === 'input' && typeof msg.data === 'string') {
        sess.term.write(msg.data)
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        try {
          sess.term.resize(msg.cols, msg.rows)
        } catch {
          /* noop */
        }
      } else if (msg.type === 'kill') {
        sess.term.kill() // onExit limpia el registro
      }
    })

    ws.on('close', () => {
      // No mata la PTY: queda viva para reconectar. GC por inactividad.
      if (sess.attached === ws) {
        sess.attached = null
        sess.idle = setTimeout(() => sess.term.kill(), IDLE_MS)
      }
    })
  })
}

/** Mata todas las PTYs (al apagar el editor). */
export function stopTerminals(): void {
  for (const s of sessions.values()) s.term.kill()
  sessions.clear()
}
