import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { projectsDir } from './paths.js'

/**
 * Base de datos del SERVIDOR (SQLite, módulo integrado node:sqlite, sin deps
 * nativas). Guarda el REGISTRO de proyectos (metadata). Los archivos de cada
 * proyecto viven en disco; aquí solo persistimos qué proyectos existen.
 *
 * Va en el servidor porque es quien posee el filesystem y los dev servers;
 * SQLite en el navegador no podría ver esas carpetas ni los puertos.
 */
const dbPath = process.env.DB_PATH ?? join(projectsDir, 'registry.db')
mkdirSync(dirname(dbPath), { recursive: true })

const db = new DatabaseSync(dbPath)
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  )
`)

// Historial del chat ✦ AI por proyecto (serverside: sobrevive recargas y cambios
// de navegador/dispositivo). Guardamos el array de mensajes UI serializado en una
// sola fila por slug; se reemplaza al terminar cada turno del agente.
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_history (
    slug       TEXT PRIMARY KEY,
    messages   TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)

export type ProjectRow = {
  id: number
  name: string
  slug: string
  created_at: string
}

export function listProjectRows(): ProjectRow[] {
  return db
    .prepare('SELECT * FROM projects ORDER BY created_at DESC')
    .all() as unknown as ProjectRow[]
}

export function getProjectRow(slug: string): ProjectRow | undefined {
  return db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as
    | ProjectRow
    | undefined
}

export function insertProjectRow(name: string, slug: string): ProjectRow {
  const createdAt = new Date().toISOString()
  db.prepare('INSERT INTO projects (name, slug, created_at) VALUES (?, ?, ?)').run(
    name,
    slug,
    createdAt,
  )
  return getProjectRow(slug)!
}

export function deleteProjectRow(slug: string): void {
  db.prepare('DELETE FROM projects WHERE slug = ?').run(slug)
  db.prepare('DELETE FROM chat_history WHERE slug = ?').run(slug)
}

/** Devuelve el historial del chat IA del proyecto (array de mensajes UI). */
export function getChatHistory(slug: string): unknown[] {
  const row = db.prepare('SELECT messages FROM chat_history WHERE slug = ?').get(slug) as
    | { messages: string }
    | undefined
  if (!row) return []
  try {
    const arr = JSON.parse(row.messages)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

/** Reemplaza el historial del chat IA del proyecto. */
export function saveChatHistory(slug: string, messages: unknown[]): void {
  db.prepare(
    `INSERT INTO chat_history (slug, messages, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at`,
  ).run(slug, JSON.stringify(messages), new Date().toISOString())
}

/** Borra el historial del chat IA del proyecto. */
export function clearChatHistory(slug: string): void {
  db.prepare('DELETE FROM chat_history WHERE slug = ?').run(slug)
}
