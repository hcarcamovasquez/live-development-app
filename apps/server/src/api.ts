import { Hono } from 'hono'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { projectsDir } from './paths.js'
import { listProjects, createProject, openProject, slug, projectPath } from './projects.js'
import { getProjectRow } from './db.js'

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
    await writeFile(safeResolve(body.project, body.path), body.content, 'utf8')
    return c.json({ ok: true, path: body.path, bytes: body.content.length })
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  }
})

api.get('/health', (c) => c.json({ ok: true, projectsDir: join(projectsDir) }))
