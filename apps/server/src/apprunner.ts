import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer as netCreateServer } from 'node:net'
import { join } from 'node:path'
import type { WebSocket } from 'ws'
import { projectPath } from './projects.js'
import { previewPortBase } from './paths.js'

/**
 * "App runner": gestiona el dev server de CADA proyecto bajo control explícito
 * (Run / Stop). NO arranca nada de forma automática. Instala dependencias y
 * levanta Vite, transmitiendo la salida a una terminal especial "App" (vía WS).
 */
export type AppStatus = 'idle' | 'installing' | 'starting' | 'running' | 'error'

type Runner = {
  proc: ChildProcess | null
  status: AppStatus
  url: string | null
  buffer: string
  clients: Set<WebSocket>
}

const MAX = 200_000
const runners = new Map<string, Runner>()

function get(slug: string): Runner {
  let r = runners.get(slug)
  if (!r) {
    r = { proc: null, status: 'idle', url: null, buffer: '', clients: new Set() }
    runners.set(slug, r)
  }
  return r
}

function emit(r: Runner, data: string) {
  r.buffer += data
  if (r.buffer.length > MAX) r.buffer = r.buffer.slice(-MAX)
  for (const ws of r.clients) if (ws.readyState === ws.OPEN) ws.send(data)
}

/** Engancha la terminal "App" (output-only) y reenvía el buffer acumulado. */
export function attachAppClient(slug: string, ws: WebSocket) {
  const r = get(slug)
  r.clients.add(ws)
  ws.send(`\x1b[2m[app: ${r.status}]\x1b[0m\r\n`)
  if (r.buffer) ws.send(r.buffer)
  ws.on('close', () => r.clients.delete(ws))
}

export function appState(slug: string): { status: AppStatus; url: string | null } {
  const r = get(slug)
  return { status: r.status, url: r.url }
}

/** Run: instala (si falta node_modules) y arranca el dev server. */
export function runApp(slug: string): { status: AppStatus; url: string | null } {
  const r = get(slug)
  if (r.status === 'installing' || r.status === 'starting' || r.status === 'running') {
    return appState(slug)
  }
  const dir = projectPath(slug)
  const needInstall = !existsSync(join(dir, 'node_modules'))
  r.status = needInstall ? 'installing' : 'starting'
  emit(r, `\r\n\x1b[36m$ ${needInstall ? 'pnpm install && ' : ''}vite\x1b[0m\r\n`)

  void (async () => {
    try {
      if (needInstall) {
        await runStreaming(r, 'pnpm', ['install', '--ignore-workspace'], dir)
      }
      await startVite(r, dir)
    } catch (e) {
      r.status = 'error'
      emit(r, `\r\n\x1b[31m$ error: ${String(e)}\x1b[0m\r\n`)
    }
  })()

  return appState(slug)
}

async function startVite(r: Runner, dir: string) {
  const port = await getFreePort(previewPortBase)
  const url = `http://127.0.0.1:${port}`
  const bin = join(dir, 'node_modules', '.bin', 'vite')
  r.status = 'starting'
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: dir,
    env: { ...process.env, FORCE_COLOR: '1' },
  })
  r.proc = proc

  const onOut = (d: Buffer) => {
    const s = d.toString()
    emit(r, s)
    if (r.status !== 'running' && /ready in|Local:\s+http/i.test(s)) {
      r.status = 'running'
      r.url = url
      emit(r, `\r\n\x1b[32m$ app lista en ${url}\x1b[0m\r\n`)
    }
  }
  proc.stdout?.on('data', onOut)
  proc.stderr?.on('data', onOut)
  proc.on('exit', (code) => {
    emit(r, `\r\n\x1b[33m$ app detenida (código ${code ?? 0})\x1b[0m\r\n`)
    r.proc = null
    r.status = 'idle'
    r.url = null
  })
}

/** Stop: detiene el dev server (y cualquier install en curso). */
export function stopApp(slug: string): { status: AppStatus; url: string | null } {
  const r = get(slug)
  if (r.proc) {
    emit(r, `\r\n\x1b[33m$ stop\x1b[0m\r\n`)
    r.proc.kill()
    r.proc = null
  }
  r.status = 'idle'
  r.url = null
  return appState(slug)
}

export function stopAllApps(): void {
  for (const slug of runners.keys()) stopApp(slug)
}

function runStreaming(r: Runner, cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: '1' } })
    r.proc = p
    p.stdout?.on('data', (d) => emit(r, d.toString()))
    p.stderr?.on('data', (d) => emit(r, d.toString()))
    p.on('exit', (code) => {
      r.proc = null
      code === 0 ? resolve() : reject(new Error(`${cmd} salió con código ${code}`))
    })
    p.on('error', reject)
  })
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = netCreateServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, '127.0.0.1')
  })
}
async function getFreePort(start: number): Promise<number> {
  let port = start
  while (!(await isPortFree(port))) port++
  return port
}
