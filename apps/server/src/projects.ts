import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile, access, rm } from 'node:fs/promises'
import { createServer as netCreateServer } from 'node:net'
import { join, dirname } from 'node:path'
import { projectsDir, previewPortBase } from './paths.js'
import { listProjectRows, getProjectRow, insertProjectRow, deleteProjectRow } from './db.js'
import { initRepo } from './git.js'

/**
 * Gestiona MÚLTIPLES proyectos. Cada proyecto es una app Vite COMPLETA e
 * INDEPENDIENTE (sus archivos, su node_modules, su dev server propio), persistida
 * bajo PROJECTS_DIR. El registro (metadata) vive en SQLite (db.ts).
 */

/** Normaliza un nombre a un slug seguro para usar como carpeta. */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

export function projectPath(s: string): string {
  return join(projectsDir, s)
}

// ── Plantilla de un proyecto nuevo ────────────────────────────────────────────
function template(name: string): Record<string, string> {
  return {
    'package.json': JSON.stringify(
      {
        name: slug(name) || 'sandbox',
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^19.2.6', 'react-dom': '^19.2.6' },
        devDependencies: {
          '@vitejs/plugin-react': '^6.0.1',
          'simple-git': '^3.27.0',
          vite: '^8.0.12',
        },
      },
      null,
      2,
    ),
    '.gitignore': `node_modules
dist
*.local
.DS_Store
`,
    'vite.config.js': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server propio del proyecto. El puerto lo asigna el editor por CLI.
export default defineConfig({ plugins: [react()] })
`,
    'index.html': `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    'src/main.tsx': `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import UserApp from './UserApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UserApp />
  </StrictMode>,
)
`,
    'src/UserApp.tsx': `import { useState } from 'react'

// 👋 Proyecto "${name}". App Vite INDEPENDIENTE con su propio dev server.
// Edítala desde el editor; su Vite hace hot reload sin recargar la página.
export default function UserApp() {
  const [count, setCount] = useState(0)

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1 style={{ color: '#646cff' }}>${name} 🚀</h1>
      <p>Edita este componente y mira el hot reload en vivo.</p>
      <button
        onClick={() => setCount((c) => c + 1)}
        style={{
          padding: '8px 16px',
          fontSize: 16,
          borderRadius: 8,
          border: '1px solid #646cff',
          background: '#646cff',
          color: 'white',
          cursor: 'pointer',
        }}
      >
        Contador: {count}
      </button>
    </div>
  )
}
`,
  }
}

// ── Dev servers en ejecución (uno por proyecto, bajo demanda) ─────────────────
type Running = { port: number; child: ChildProcess; url: string }
const running = new Map<string, Running>()
// Opens en curso, para deduplicar llamadas concurrentes (p. ej. React StrictMode).
const opening = new Map<string, Promise<{ url: string; port: number }>>()

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

export type ProjectInfo = {
  name: string
  slug: string
  createdAt: string
  running: boolean
  url: string | null
}

/** Lista los proyectos del registro (SQLite) + su estado de ejecución. */
export function listProjects(): ProjectInfo[] {
  return listProjectRows().map((r) => {
    const live = running.get(r.slug)
    return {
      name: r.name,
      slug: r.slug,
      createdAt: r.created_at,
      running: !!live,
      url: live?.url ?? null,
    }
  })
}

/** Crea un proyecto: scaffold en disco + install + registro en SQLite. */
export async function createProject(name: string): Promise<ProjectInfo> {
  const s = slug(name)
  if (!s) throw new Error('Nombre inválido')
  if (getProjectRow(s)) throw new Error('Ya existe un proyecto con ese nombre')

  const dir = projectPath(s)
  for (const [rel, content] of Object.entries(template(name))) {
    const abs = join(dir, rel)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf8')
  }
  await run('pnpm', ['install', '--ignore-workspace'], dir)
  await initRepo(s, name) // git init + commit inicial (node_modules ya ignorado)

  const row = insertProjectRow(name, s)
  return { name: row.name, slug: row.slug, createdAt: row.created_at, running: false, url: null }
}

/** Arranca (o reutiliza) el dev server propio del proyecto y devuelve su URL. */
export function openProject(s: string): Promise<{ url: string; port: number }> {
  const row = getProjectRow(s)
  if (!row) return Promise.reject(new Error('Proyecto no encontrado'))

  const live = running.get(s)
  if (live && !live.child.killed) {
    return Promise.resolve({ url: live.url, port: live.port })
  }
  // Si ya hay un arranque en curso para este proyecto, reutilízalo.
  const inflight = opening.get(s)
  if (inflight) return inflight

  const promise = spawnDevServer(s).finally(() => opening.delete(s))
  opening.set(s, promise)
  return promise
}

async function spawnDevServer(s: string): Promise<{ url: string; port: number }> {
  const dir = projectPath(s)
  if (!(await exists(join(dir, 'node_modules')))) {
    await run('pnpm', ['install', '--ignore-workspace'], dir)
  }

  const port = await getFreePort(previewPortBase)
  const bin = join(dir, 'node_modules', '.bin', 'vite')
  // --host 127.0.0.1 fuerza IPv4, consistente con el chequeo de puerto libre.
  const child = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: dir,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.on('data', (d) => process.stdout.write(`  [${s}] ${d}`))
  child.stderr?.on('data', (d) => process.stderr.write(`  [${s}] ${d}`))

  await waitForReady(child)
  const url = `http://127.0.0.1:${port}`
  running.set(s, { port, child, url })
  child.on('exit', () => running.delete(s))
  return { url, port }
}

/** Detiene el dev server de un proyecto (si está corriendo). */
export function stopProject(s: string): void {
  const live = running.get(s)
  if (live) {
    live.child.kill()
    running.delete(s)
  }
}

/** Borra un proyecto: detiene su dev server, lo quita de SQLite y del disco. */
export async function deleteProject(s: string): Promise<void> {
  if (!getProjectRow(s)) throw new Error('Proyecto no encontrado')
  stopProject(s)
  deleteProjectRow(s)
  await rm(projectPath(s), { recursive: true, force: true })
}

/** Baja todos los dev servers (al cerrar el editor). */
export function stopAll(): void {
  for (const { child } of running.values()) child.kill()
  running.clear()
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function waitForReady(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('El dev server del proyecto no arrancó a tiempo')),
      60_000,
    )
    const onData = (buf: Buffer) => {
      if (/ready in|Local:\s+http/i.test(buf.toString())) {
        clearTimeout(timer)
        child.stdout?.off('data', onData)
        resolve()
      }
    }
    child.stdout?.on('data', onData)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`El dev server del proyecto terminó (código ${code})`))
    })
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
  const used = new Set([...running.values()].map((r) => r.port))
  let port = start
  while (used.has(port) || !(await isPortFree(port))) port++
  return port
}

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: 'inherit' })
    p.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} salió con código ${code}`)),
    )
    p.on('error', reject)
  })
}
