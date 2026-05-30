import { mkdir, writeFile, access, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { projectsDir } from './paths.js'
import { listProjectRows, getProjectRow, insertProjectRow, deleteProjectRow } from './db.js'
import { initRepo } from './git.js'
import { appState, stopApp } from './apprunner.js'

/**
 * Gestiona MÚLTIPLES proyectos. Cada proyecto es una app Vite COMPLETA e
 * INDEPENDIENTE persistida bajo PROJECTS_DIR; el registro vive en SQLite (db.ts).
 * El dev server NO se arranca aquí: lo controla el usuario con Run/Stop (apprunner).
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

// Dev server propio del proyecto. El puerto lo asigna el runner por CLI.
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

// 👋 Proyecto "${name}". Pulsa Run en la terminal "App" para instalar y arrancar.
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

/** Lista los proyectos del registro (SQLite) + estado del app runner. */
export function listProjects(): ProjectInfo[] {
  return listProjectRows().map((r) => {
    const app = appState(r.slug)
    return {
      name: r.name,
      slug: r.slug,
      createdAt: r.created_at,
      running: app.status === 'running',
      url: app.url,
    }
  })
}

/** Crea un proyecto: scaffold + git init + commit. NO instala (lo hace Run). */
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
  await initRepo(s, name) // git init + commit (node_modules ignorado, aún no existe)

  const row = insertProjectRow(name, s)
  return { name: row.name, slug: row.slug, createdAt: row.created_at, running: false, url: null }
}

/** Borra un proyecto: detiene su app, lo quita de SQLite y del disco. */
export async function deleteProject(s: string): Promise<void> {
  if (!getProjectRow(s)) throw new Error('Proyecto no encontrado')
  stopApp(s)
  deleteProjectRow(s)
  await rm(projectPath(s), { recursive: true, force: true })
}

// `exists` se reexporta para otros módulos si lo necesitan.
export { exists }
