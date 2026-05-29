import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { projectDir, previewPort } from './paths.js'

/**
 * Gestiona el PROYECTO editable: una app Vite COMPLETA e INDEPENDIENTE del editor.
 * Vive en un storage externo, tiene sus propios archivos y su propio node_modules,
 * y corre su propio dev server. El editor solo lo muestra en un iframe.
 */

// ── Plantilla del proyecto (se escribe en el storage la primera vez) ──────────
const TEMPLATE: Record<string, string> = {
  'package.json': JSON.stringify(
    {
      name: 'sandbox-project',
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      dependencies: {
        react: '^19.2.6',
        'react-dom': '^19.2.6',
      },
      devDependencies: {
        '@vitejs/plugin-react': '^6.0.1',
        vite: '^8.0.12',
      },
    },
    null,
    2,
  ),

  'vite.config.js': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server PROPIO del proyecto, independiente del editor.
export default defineConfig({
  plugins: [react()],
  server: {
    port: ${previewPort},
    strictPort: true,
  },
})
`,

  'index.html': `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>sandbox</title>
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

// 👋 Esta es la "app" que editas en vivo. Es un proyecto Vite INDEPENDIENTE,
// con su propio node_modules y su propio dev server. El editor la muestra en
// un iframe; al guardar, su Vite hace hot reload sin recargar la página.
export default function UserApp() {
  const [count, setCount] = useState(0)

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1 style={{ color: '#646cff' }}>Hola desde el proyecto 🚀</h1>
      <p>Proyecto autónomo. Edítalo y mira el hot reload en vivo.</p>
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

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

/** Escribe los archivos del proyecto si aún no existen. */
export async function ensureScaffold(): Promise<void> {
  if (await exists(join(projectDir, 'package.json'))) return
  console.log(`  📁 Creando proyecto independiente en ${projectDir}`)
  for (const [rel, content] of Object.entries(TEMPLATE)) {
    const abs = join(projectDir, rel)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf8')
  }
}

/** Instala el node_modules propio del proyecto si falta. */
export async function ensureInstalled(): Promise<void> {
  if (await exists(join(projectDir, 'node_modules'))) return
  console.log('  📦 Instalando dependencias del proyecto (su propio node_modules)…')
  await run('pnpm', ['install', '--ignore-workspace'], projectDir)
}

/** Libera el puerto del preview matando cualquier proceso huérfano que lo ocupe. */
async function freePreviewPort(): Promise<void> {
  if (process.platform === 'win32') return
  await new Promise<void>((resolve) => {
    const p = spawn('sh', ['-c', `lsof -ti:${previewPort} | xargs -r kill -9`], {
      stdio: 'ignore',
    })
    p.on('exit', () => resolve())
    p.on('error', () => resolve())
  })
}

/** Arranca el dev server PROPIO del proyecto y resuelve cuando está listo. */
export async function startDevServer(): Promise<ChildProcess> {
  await freePreviewPort()
  const bin = join(projectDir, 'node_modules', '.bin', 'vite')
  const child = spawn(bin, [], {
    cwd: projectDir,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout?.on('data', (d) => process.stdout.write(`  [project] ${d}`))
  child.stderr?.on('data', (d) => process.stderr.write(`  [project] ${d}`))

  await waitForReady(child)
  return child
}

/** Resuelve cuando Vite del proyecto imprime que está listo. */
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
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`El dev server del proyecto terminó (código ${code})`))
    })
  })
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
