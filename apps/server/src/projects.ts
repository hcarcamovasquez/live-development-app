import { mkdir, writeFile, access, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { projectsDir } from './paths.js'
import { listProjectRows, getProjectRow, insertProjectRow, deleteProjectRow } from './db.js'
import { initRepo } from './git.js'
import { appState, stopApp } from './apprunner.js'
import { renderTokensCss, DEFAULT_STYLE } from './presets.js'

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

// Dev server propio del proyecto. El runner pasa --port y --base por CLI.
// allowedHosts: el editor lo sirve por proxy (mismo origen).
// hmr.clientPort/protocol: el navegador llega por el dominio del editor (p. ej.
// https/443), no por el puerto interno de Vite; el runner los inyecta por env.
const hmrClientPort = Number(process.env.PREVIEW_HMR_CLIENT_PORT) || undefined
const hmrProtocol = process.env.PREVIEW_HMR_PROTOCOL || undefined
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    allowedHosts: true,
    hmr: hmrClientPort ? { clientPort: hmrClientPort, protocol: hmrProtocol } : true,
  },
})
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
import './styles/tokens.css' // design system de la librería (variables CSS globales)
import UserApp from './UserApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UserApp />
  </StrictMode>,
)
`,
    // Galería viva de la librería. Auto-descubre cada sección de src/components/*.tsx
    // (export default) con import.meta.glob; el agente ✦ AI crea/edita esos archivos.
    'src/UserApp.tsx': `import { useState, type ComponentType } from 'react'

// Orden canónico de una landing (lo demás va alfabético al final).
const ORDER = [
  'Navbar', 'Header', 'Hero', 'Logos', 'Features', 'Stats', 'About',
  'Pricing', 'Testimonials', 'Testimonios', 'Gallery', 'FAQ', 'CTA',
  'Newsletter', 'Footer',
]

const modules = import.meta.glob('./components/*.tsx', { eager: true })

type Section = { name: string; Component: ComponentType }

function sections(): Section[] {
  const list: Section[] = []
  for (const path in modules) {
    const mod = modules[path]
    const Component = (mod && (mod as { default?: ComponentType }).default)
    if (!Component) continue
    const name = (path.split('/').pop() || '').replace(/\\.tsx$/, '')
    list.push({ name, Component })
  }
  const rank = (n: string) => (ORDER.indexOf(n) === -1 ? 999 : ORDER.indexOf(n))
  list.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
  return list
}

export default function UserApp() {
  const [showLabels, setShowLabels] = useState(true)
  const list = sections()

  if (list.length === 0) {
    return (
      <div style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        padding: '2rem', textAlign: 'center',
      }}>
        <div style={{ maxWidth: 460 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: '1.8rem',
            color: 'var(--color-text)', marginBottom: '0.6rem',
          }}>Librería vacía</div>
          <p style={{ color: 'var(--color-muted)', lineHeight: 1.6 }}>
            Abre <strong>✦ AI</strong>, elige un <strong>estilo</strong> y pulsa una
            sección del catálogo (Hero, Pricing, Footer…) para generar tu primer
            componente. Aparecerá aquí automáticamente.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setShowLabels((v) => !v)}
        style={{
          position: 'fixed', top: 12, right: 12, zIndex: 9999,
          font: '600 12px var(--font-text)', padding: '6px 12px',
          color: 'var(--color-accent-ink)', background: 'var(--color-accent)',
          border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
          opacity: 0.85,
        }}
      >
        {showLabels ? 'Ocultar etiquetas' : 'Ver etiquetas'}
      </button>

      {list.map(({ name, Component }) => (
        <section key={name} style={{ position: 'relative' }}>
          {showLabels && (
            <span style={{
              position: 'absolute', top: 8, left: 8, zIndex: 50,
              font: '600 10px/1 var(--font-text)', letterSpacing: '0.08em',
              textTransform: 'uppercase', padding: '4px 8px',
              color: 'var(--color-accent-ink)', background: 'var(--color-accent)',
              borderRadius: 'var(--radius)', opacity: 0.9,
            }}>{name}</span>
          )}
          <Component />
        </section>
      ))}
    </div>
  )
}
`,
    'src/components/.gitkeep': '',
    'src/styles/tokens.css': renderTokensCss(DEFAULT_STYLE),
    'style.json': JSON.stringify(DEFAULT_STYLE, null, 2) + '\n',
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
