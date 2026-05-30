import { Hono, type Context } from 'hono'
import { readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join, dirname } from 'node:path'
import { projectsDir, terminalPort } from './paths.js'
import { listProjects, createProject, deleteProject, slug, projectPath } from './projects.js'
import { getProjectRow } from './db.js'
import { statusOf, showHead, commit, stageFile, unstageFile, discardFile } from './git.js'
import { appState, runApp, stopApp } from './apprunner.js'

type TreeNode = { name: string; path: string; type: 'file' | 'dir' }
// Solo se ocultan los internos de git y metadatos de macOS; node_modules SÍ se muestra.
const IGNORE = new Set(['.git', '.DS_Store'])

// Lee UN nivel del árbol (carga perezosa: node_modules puede ser enorme).
async function readLevel(absDir: string, base: string): Promise<TreeNode[]> {
  const entries = await readdir(absDir, { withFileTypes: true })
  const nodes: TreeNode[] = []
  for (const e of entries) {
    if (IGNORE.has(e.name)) continue
    if (!e.isDirectory() && !e.isFile()) continue
    const rel = relative(base, join(absDir, e.name))
    nodes.push({ name: e.name, path: rel, type: e.isDirectory() ? 'dir' : 'file' })
  }
  nodes.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1,
  )
  return nodes
}

/**
 * API del editor. Gestiona el listado/creación de proyectos y la lectura/escritura
 * de archivos dentro de cada proyecto. Toda ruta de archivo se resuelve DENTRO del
 * directorio del proyecto; se rechaza el path traversal (../).
 */
export const api = new Hono()

function projectRoot(project: string): string {
  const s = slug(project)
  if (!s || !getProjectRow(s)) throw new Error('Proyecto no encontrado')
  return projectPath(s)
}

function safeResolve(project: string, rel: string): string {
  const base = projectRoot(project)
  const abs = resolve(base, rel)
  const r = relative(base, abs)
  if (r.startsWith('..') || isAbsolute(r)) {
    throw new Error(`Ruta fuera del proyecto: ${rel}`)
  }
  return abs
}

// Config del cliente (p. ej. puerto del WebSocket de terminales).
api.get('/config', (c) => c.json({ terminalPort }))

// ── Proyectos ─────────────────────────────────────────────────────────────────
api.get('/projects', (c) => c.json({ projects: listProjects() }))

api.post('/projects', async (c) => {
  const { name } = await c.req.json<{ name?: string }>()
  if (!name?.trim()) return c.json({ error: 'Falta el nombre' }, 400)
  try {
    const project = await createProject(name)
    return c.json({ project }, 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})

// ── App runner (Run / Stop / estado del dev server) ──────────────────────────
function appGuard(c: Context): string {
  const s = slug(c.req.param('slug') ?? '')
  if (!getProjectRow(s)) throw new Error('Proyecto no encontrado')
  return s
}
api.get('/app/:slug', (c) => {
  try {
    return c.json(appState(appGuard(c)))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})
api.post('/app/:slug/run', (c) => {
  try {
    return c.json(runApp(appGuard(c)))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})
api.post('/app/:slug/stop', (c) => {
  try {
    return c.json(stopApp(appGuard(c)))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})

// Borra un proyecto (dev server + registro + disco).
api.delete('/projects/:slug', async (c) => {
  try {
    await deleteProject(c.req.param('slug'))
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})

// Un nivel del árbol (carga perezosa). ?dir = subcarpeta relativa ('' = raíz).
api.get('/tree', async (c) => {
  const project = c.req.query('project')
  const dir = c.req.query('dir') ?? ''
  if (!project) return c.json({ error: 'falta ?project' }, 400)
  try {
    const base = projectRoot(project)
    const abs = dir ? safeResolve(project, dir) : base
    return c.json({ dir, entries: await readLevel(abs, base) })
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  }
})

// ── Archivos de un proyecto ───────────────────────────────────────────────────
api.get('/files', async (c) => {
  const project = c.req.query('project')
  if (!project) return c.json({ error: 'falta ?project' }, 400)
  try {
    const entries = await readdir(join(projectRoot(project), 'src'), { withFileTypes: true })
    return c.json({ files: entries.filter((e) => e.isFile()).map((e) => `src/${e.name}`) })
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  }
})

api.get('/file', async (c) => {
  const project = c.req.query('project')
  const path = c.req.query('path')
  if (!project || !path) return c.json({ error: 'faltan ?project y ?path' }, 400)
  try {
    const content = await readFile(safeResolve(project, path), 'utf8')
    return c.json({ path, content })
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  }
})

api.post('/file', async (c) => {
  const body = await c.req.json<{ project?: string; path?: string; content?: string }>()
  if (!body.project || !body.path || typeof body.content !== 'string') {
    return c.json({ error: 'se requiere { project, path, content }' }, 400)
  }
  try {
    const abs = safeResolve(body.project, body.path)
    await mkdir(dirname(abs), { recursive: true }) // permite crear archivos nuevos
    await writeFile(abs, body.content, 'utf8')
    return c.json({ ok: true, path: body.path, bytes: body.content.length })
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  }
})

// Borra un archivo del proyecto.
api.delete('/file', async (c) => {
  const project = c.req.query('project')
  const path = c.req.query('path')
  if (!project || !path) return c.json({ error: 'faltan ?project y ?path' }, 400)
  try {
    await rm(safeResolve(project, path), { force: true })
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  }
})

// ── Git ───────────────────────────────────────────────────────────────────────
// Helper para acciones git sobre un archivo: valida { project, path } y ejecuta.
function gitFileAction(action: (slug: string, path: string) => Promise<void>) {
  return async (c: Context) => {
    const { project, path } = await c.req.json<{ project?: string; path?: string }>()
    if (!project || !path) return c.json({ error: 'se requiere { project, path }' }, 400)
    try {
      const s = slug(project)
      if (!getProjectRow(s)) throw new Error('Proyecto no encontrado')
      await action(s, path)
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
    }
  }
}

api.get('/git/status', async (c) => {
  const project = c.req.query('project')
  if (!project) return c.json({ error: 'falta ?project' }, 400)
  try {
    const s = slug(project)
    if (!getProjectRow(s)) throw new Error('Proyecto no encontrado')
    return c.json(await statusOf(s))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})

// Diff de un archivo: contenido en HEAD vs working (para Monaco DiffEditor).
api.get('/git/diff', async (c) => {
  const project = c.req.query('project')
  const path = c.req.query('path')
  if (!project || !path) return c.json({ error: 'faltan ?project y ?path' }, 400)
  try {
    const s = slug(project)
    if (!getProjectRow(s)) throw new Error('Proyecto no encontrado')
    const original = await showHead(s, path)
    let modified = ''
    try {
      modified = await readFile(safeResolve(project, path), 'utf8')
    } catch {
      modified = '' // archivo borrado
    }
    return c.json({ path, original, modified })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})

api.post('/git/commit', async (c) => {
  const { project, message, all } = await c.req.json<{
    project?: string
    message?: string
    all?: boolean
  }>()
  if (!project || !message?.trim()) return c.json({ error: 'se requiere { project, message }' }, 400)
  try {
    const s = slug(project)
    if (!getProjectRow(s)) throw new Error('Proyecto no encontrado')
    return c.json(await commit(s, message, !!all))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return c.json({ error: /nothing to commit/.test(msg) ? 'No hay nada en stage' : msg }, 400)
  }
})

// Stage / unstage / descartar un archivo.
api.post('/git/stage', gitFileAction((s, p) => stageFile(s, p)))
api.post('/git/unstage', gitFileAction((s, p) => unstageFile(s, p)))
api.post('/git/discard', async (c) => {
  const { project, path, untracked } = await c.req.json<{
    project?: string
    path?: string
    untracked?: boolean
  }>()
  if (!project || !path) return c.json({ error: 'se requiere { project, path }' }, 400)
  try {
    const s = slug(project)
    if (!getProjectRow(s)) throw new Error('Proyecto no encontrado')
    await discardFile(s, path, !!untracked)
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})

api.get('/health', (c) => c.json({ ok: true, projectsDir: join(projectsDir) }))
