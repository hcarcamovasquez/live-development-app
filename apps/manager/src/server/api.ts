import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import {
  listWorkspaces,
  getWorkspace,
  getWorkspaceBySlug,
  insertWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from './db.js'
import { createAndDeploy, deleteApp } from './dokploy.js'

export const api = new Hono()

function slug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * Sondea la URL del workspace; solo está "arriba" si el editor responde 2xx/3xx.
 * Durante el build, Traefik devuelve 404/502/503 (y mientras se emite el cert TLS
 * el fetch falla) → se mantiene en 'building' hasta que sirve de verdad. Así la UI
 * no ofrece el enlace antes de tiempo (evita el 404 al hacer clic).
 */
async function isUp(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 2500)
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal, redirect: 'manual' })
    clearTimeout(t)
    return res.status >= 200 && res.status < 400
  } catch {
    return false
  }
}

api.get('/workspaces', async (c) => {
  const rows = listWorkspaces()
  // Promueve 'building' → 'running' cuando la URL ya responde.
  await Promise.all(
    rows
      .filter((r) => r.status === 'building' && r.url)
      .map(async (r) => {
        if (await isUp(r.url!)) {
          updateWorkspace(r.id, { status: 'running' })
          r.status = 'running'
        }
      }),
  )
  return c.json({
    workspaces: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      url: r.url,
      createdAt: r.created_at,
    })),
  })
})

api.post('/workspaces', async (c) => {
  const { name } = await c.req.json<{ name?: string }>()
  if (!name?.trim()) return c.json({ error: 'Falta el nombre' }, 400)
  const s = slug(name)
  if (!s) return c.json({ error: 'Nombre inválido' }, 400)
  if (getWorkspaceBySlug(s)) return c.json({ error: 'Ya existe un workspace con ese nombre' }, 400)

  const id = randomUUID()
  insertWorkspace({
    id,
    name,
    slug: s,
    application_id: null,
    url: null,
    status: 'creating',
    created_at: new Date().toISOString(),
  })

  // Orquesta el despliegue en Dokploy en segundo plano; la UI refleja el estado.
  void (async () => {
    try {
      const { applicationId, url } = await createAndDeploy(name, s)
      updateWorkspace(id, { application_id: applicationId, url, status: 'building' })
    } catch (err) {
      console.error('createAndDeploy:', err)
      updateWorkspace(id, { status: 'error' })
    }
  })()

  return c.json({ id, slug: s, status: 'creating' }, 201)
})

api.delete('/workspaces/:id', async (c) => {
  const row = getWorkspace(c.req.param('id'))
  if (!row) return c.json({ error: 'No encontrado' }, 404)
  if (row.application_id) {
    try {
      await deleteApp(row.application_id)
    } catch (err) {
      console.error('deleteApp:', err)
    }
  }
  deleteWorkspace(row.id)
  return c.json({ ok: true })
})

api.get('/health', (c) => c.json({ ok: true }))
