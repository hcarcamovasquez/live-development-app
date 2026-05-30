import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { config } from './config.js'

mkdirSync(dirname(config.dbPath), { recursive: true })
const db = new DatabaseSync(config.dbPath)
db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    application_id  TEXT,
    url             TEXT,
    status          TEXT NOT NULL,
    created_at      TEXT NOT NULL
  )
`)

export type WorkspaceRow = {
  id: string
  name: string
  slug: string
  application_id: string | null
  url: string | null
  status: string
  created_at: string
}

export function listWorkspaces(): WorkspaceRow[] {
  return db
    .prepare('SELECT * FROM workspaces ORDER BY created_at DESC')
    .all() as unknown as WorkspaceRow[]
}

export function getWorkspace(id: string): WorkspaceRow | undefined {
  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as WorkspaceRow | undefined
}

export function getWorkspaceBySlug(slug: string): WorkspaceRow | undefined {
  return db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(slug) as WorkspaceRow | undefined
}

export function insertWorkspace(row: WorkspaceRow): void {
  db.prepare(
    `INSERT INTO workspaces (id, name, slug, application_id, url, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.name, row.slug, row.application_id, row.url, row.status, row.created_at)
}

export function updateWorkspace(
  id: string,
  patch: Partial<Pick<WorkspaceRow, 'application_id' | 'url' | 'status'>>,
): void {
  const cur = getWorkspace(id)
  if (!cur) return
  db.prepare('UPDATE workspaces SET application_id = ?, url = ?, status = ? WHERE id = ?').run(
    patch.application_id ?? cur.application_id,
    patch.url ?? cur.url,
    patch.status ?? cur.status,
    id,
  )
}

export function deleteWorkspace(id: string): void {
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
}
