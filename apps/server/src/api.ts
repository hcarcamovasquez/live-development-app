import { Hono } from 'hono'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { projectDir, previewUrl } from './paths.js'

/**
 * API del editor. Opera sobre los archivos del PROYECTO independiente (storage
 * externo). Toda ruta se resuelve DENTRO de projectDir; se rechaza el path
 * traversal (../) para no escribir fuera del sandbox.
 */
export const api = new Hono()

/** Resuelve y valida que `rel` quede contenido en projectDir. */
function safeResolve(rel: string): string {
  const abs = resolve(projectDir, rel)
  const r = relative(projectDir, abs)
  if (r.startsWith('..') || isAbsolute(r)) {
    throw new Error(`Ruta fuera del proyecto: ${rel}`)
  }
  return abs
}

// Info del proyecto: URL del preview (su dev server propio) y carpeta.
api.get('/project', (c) => c.json({ url: previewUrl, dir: join(projectDir) }))

// Lista archivos de src/ del proyecto.
api.get('/files', async (c) => {
  const entries = await readdir(join(projectDir, 'src'), { withFileTypes: true })
  const files = entries.filter((e) => e.isFile()).map((e) => `src/${e.name}`)
  return c.json({ files })
})

// Lee el contenido de un archivo del proyecto.
api.get('/file', async (c) => {
  const path = c.req.query('path')
  if (!path) return c.json({ error: 'falta ?path' }, 400)
  try {
    const content = await readFile(safeResolve(path), 'utf8')
    return c.json({ path, content })
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  }
})

// Escribe un archivo del proyecto -> el Vite del proyecto dispara HMR.
api.post('/file', async (c) => {
  const body = await c.req.json<{ path?: string; content?: string }>()
  if (!body.path || typeof body.content !== 'string') {
    return c.json({ error: 'se requiere { path, content }' }, 400)
  }
  try {
    await writeFile(safeResolve(body.path), body.content, 'utf8')
    return c.json({ ok: true, path: body.path, bytes: body.content.length })
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  }
})

api.get('/health', (c) => c.json({ ok: true, project: join(projectDir), preview: previewUrl }))
