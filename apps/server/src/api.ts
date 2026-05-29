import { Hono } from 'hono'
import { readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join, dirname } from 'node:path'
import { projectsDir, terminalPort } from './paths.js'
import {
  listProjects,
  createProject,
  openProject,
  deleteProject,
  slug,
  projectPath,
} from './projects.js'
import { getProjectRow } from './db.js'

type TreeNode = { name: string; path: string; type: 'file' | 'dir'; children?: TreeNode[] }
const IGNORE = new Set(['node_modules', 'dist', '.git', '.DS_Store'])

async function buildTree(dir: string, base: string): Promise<TreeNode[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nodes: TreeNode[] = []
  for (const e of entries) {
    if (IGNORE.has(e.name)) continue
    const abs = join(dir, e.name)
    const rel = relative(base, abs)
    if (e.isDirectory()) {
      nodes.push({ name: e.name, path: rel, type: 'dir', children: await buildTree(abs, base) })
    } else if (e.isFile()) {
      nodes.push({ name: e.name, path: rel, type: 'file' })
    }
  }
  // Carpetas primero, luego archivos; alfabético dentro de cada grupo.
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

// Arranca (o reutiliza) el dev server del proyecto y devuelve su URL de preview.
api.post('/projects/:slug/open', async (c) => {
  try {
    const { url, port } = await openProject(c.req.param('slug'))
    return c.json({ url, port })
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

// Árbol de archivos del proyecto (excluye node_modules, dist, .git).
api.get('/tree', async (c) => {
  const project = c.req.query('project')
  if (!project) return c.json({ error: 'falta ?project' }, 400)
  try {
    const base = projectRoot(project)
    return c.json({ tree: await buildTree(base, base) })
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

api.get('/health', (c) => c.json({ ok: true, projectsDir: join(projectsDir) }))
