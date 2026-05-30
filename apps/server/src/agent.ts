import { Hono } from 'hono'
import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises'
import { resolve, relative, isAbsolute, dirname } from 'node:path'
import { getProjectRow } from './db.js'
import { projectPath, slug } from './projects.js'
import { statusOf, commit } from './git.js'
import { runApp, stopApp, appState } from './apprunner.js'

export const agentApi = new Hono()

function base(project: string): string {
  const s = slug(project)
  if (!s || !getProjectRow(s)) throw new Error('Proyecto no encontrado')
  return projectPath(s)
}

function safe(project: string, rel: string): string {
  const b = base(project)
  const abs = resolve(b, rel)
  const r = relative(b, abs)
  if (r.startsWith('..') || isAbsolute(r)) throw new Error(`Ruta fuera del proyecto: ${rel}`)
  return abs
}

const tools = (project: string) => ({
  read_file: tool({
    description: 'Lee el contenido de un archivo del proyecto.',
    inputSchema: z.object({ path: z.string().describe('Ruta relativa al proyecto') }),
    execute: async ({ path }) => {
      const content = await readFile(safe(project, path), 'utf8')
      return { path, content }
    },
  }),

  write_file: tool({
    description: 'Crea o sobreescribe un archivo del proyecto con el contenido dado.',
    inputSchema: z.object({
      path: z.string().describe('Ruta relativa al proyecto'),
      content: z.string().describe('Contenido completo del archivo'),
    }),
    execute: async ({ path, content }) => {
      const abs = safe(project, path)
      await mkdir(dirname(abs), { recursive: true })
      await writeFile(abs, content, 'utf8')
      return { ok: true, path, bytes: Buffer.byteLength(content) }
    },
  }),

  list_directory: tool({
    description: 'Lista el contenido de un directorio del proyecto.',
    inputSchema: z.object({
      dir: z.string().default('').describe('Ruta relativa al directorio (vacío = raíz)'),
    }),
    execute: async ({ dir }) => {
      const abs = dir ? safe(project, dir) : base(project)
      const entries = await readdir(abs, { withFileTypes: true })
      return {
        dir: dir || '/',
        entries: entries
          .filter((e) => e.name !== '.git')
          .sort((a, b) =>
            a.isDirectory() !== b.isDirectory()
              ? a.isDirectory() ? -1 : 1
              : a.name.localeCompare(b.name),
          )
          .map((e) => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' })),
      }
    },
  }),

  delete_file: tool({
    description: 'Elimina un archivo del proyecto.',
    inputSchema: z.object({ path: z.string().describe('Ruta relativa al proyecto') }),
    execute: async ({ path }) => {
      await rm(safe(project, path), { force: true })
      return { ok: true, path }
    },
  }),

  run_app: tool({
    description: 'Instala las dependencias (si faltan) y arranca el dev server del proyecto.',
    inputSchema: z.object({}),
    execute: async () => runApp(slug(project)),
  }),

  stop_app: tool({
    description: 'Detiene el dev server del proyecto.',
    inputSchema: z.object({}),
    execute: async () => stopApp(slug(project)),
  }),

  app_status: tool({
    description: 'Devuelve el estado actual del dev server (idle, installing, starting, running, error).',
    inputSchema: z.object({}),
    execute: async () => appState(slug(project)),
  }),

  git_status: tool({
    description: 'Muestra el estado del repositorio git: archivos con cambios staged y unstaged.',
    inputSchema: z.object({}),
    execute: async () => statusOf(slug(project)),
  }),

  git_commit: tool({
    description: 'Hace commit de los cambios en el proyecto.',
    inputSchema: z.object({
      message: z.string().describe('Mensaje del commit'),
      all: z.boolean().default(true).describe('Si true, hace stage de todos los cambios antes del commit'),
    }),
    execute: async ({ message, all }) => commit(slug(project), message, all),
  }),
})

agentApi.post('/chat', async (c) => {
  const { messages, project } = await c.req.json<{
    messages: Parameters<typeof convertToModelMessages>[0]
    project: string
  }>()

  if (!project) return c.json({ error: 'Falta el proyecto' }, 400)

  const s = slug(project)
  const row = getProjectRow(s)
  if (!row) return c.json({ error: 'Proyecto no encontrado' }, 404)

  const result = streamText({
    model: google('gemini-2.0-flash'),
    system: `Eres un asistente de desarrollo de software embebido en un IDE web.
Estás trabajando sobre el proyecto "${row.name}" (slug: ${s}).
Tu misión es ayudar al desarrollador a escribir, modificar y organizar su código.

Reglas:
- Antes de modificar un archivo, léelo primero con read_file.
- Escribe el contenido COMPLETO del archivo al usar write_file (nunca parcial).
- El archivo principal de la app es src/UserApp.tsx.
- Si el usuario pide cambios en múltiples archivos, hazlos todos.
- Responde siempre en el mismo idioma que el usuario.`,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(15),
    tools: tools(project),
  })

  return result.toUIMessageStreamResponse()
})
