import { Hono } from 'hono'
import { streamText, tool, convertToModelMessages, stepCountIs, type UIMessage } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises'
import { resolve, relative, isAbsolute, dirname } from 'node:path'
import { getProjectRow, getChatHistory, saveChatHistory, clearChatHistory } from './db.js'
import { projectPath, slug } from './projects.js'
import { statusOf, commit } from './git.js'
import { runApp, stopApp, appState } from './apprunner.js'
import {
  PRESETS,
  FONT_PAIRS,
  DEFAULT_STYLE,
  getPreset,
  renderTokensCss,
  type StyleConfig,
} from './presets.js'

export const agentApi = new Hono()

// ── Estilo (design system) por proyecto ───────────────────────────────────────
/** Lee `style.json` del proyecto (o el estilo por defecto si no existe). */
async function readStyle(project: string): Promise<StyleConfig> {
  try {
    const raw = await readFile(safe(project, 'style.json'), 'utf8')
    return { ...DEFAULT_STYLE, ...(JSON.parse(raw) as Partial<StyleConfig>) }
  } catch {
    return { ...DEFAULT_STYLE }
  }
}

/** Persiste el estilo: reescribe `style.json` y regenera `src/styles/tokens.css`. */
async function writeStyle(project: string, style: StyleConfig): Promise<void> {
  await writeFile(safe(project, 'style.json'), JSON.stringify(style, null, 2) + '\n', 'utf8')
  const cssAbs = safe(project, 'src/styles/tokens.css')
  await mkdir(dirname(cssAbs), { recursive: true })
  await writeFile(cssAbs, renderTokensCss(style), 'utf8')
}

/** Resumen del contrato de estilo para inyectar en el system prompt. */
function styleSummary(style: StyleConfig): string {
  const p = getPreset(style.preset)
  if (!p) {
    return 'AÚN NO hay un estilo elegido (design system neutro). Si el usuario no ha elegido estilo, sugiérele abrir el selector "Estilo" en ✦ AI; mientras tanto usa las variables CSS de src/styles/tokens.css.'
  }
  const lines = [`Estilo elegido: ${p.label}. ${p.description}`]
  if (style.tweak) lines.push(`Ajuste pedido por el usuario: "${style.tweak}".`)
  return lines.join('\n')
}

// Guía de diseño frontend (basada en la skill frontend-design de Anthropic).
// Se inyecta en el system prompt para que la UI generada evite la estética
// genérica de IA y tenga una dirección estética intencional.
const DESIGN_GUIDE = `
Cuando construyas o modifiques interfaz (UI), aplica diseño de alta calidad y
evita la estética genérica de "IA":
- Dirección estética: comprométete con un tono claro y deliberado (minimalista
  refinado, brutalista, editorial, retro-futurista, lujoso, etc.). Intencionalidad
  sobre intensidad.
- Tipografía: fuentes distintivas y con carácter; evita Arial, Inter, Roboto y
  fuentes de sistema. Empareja una display expresiva con una de texto legible.
- Color: paleta cohesiva con variables CSS; colores dominantes con acentos
  marcados, no paletas tímidas y uniformes. EVITA gradientes morados sobre blanco.
- Movimiento: micro-interacciones y una carga de página orquestada (reveals
  escalonados con animation-delay). CSS puro cuando sea posible.
- Composición: layouts inesperados, asimetría, superposición, espacio negativo
  generoso o densidad controlada; rompe la rejilla con intención.
- Fondo y detalle: atmósfera y profundidad (mallas de gradiente, texturas de
  ruido, patrones geométricos, sombras dramáticas, grano) en vez de colores planos.
- NUNCA: layouts y componentes predecibles, esquemas cliché, diseño cortado con
  molde sin carácter propio del contexto.
- Ajusta la complejidad del código a la visión: maximalismo => código elaborado
  con animaciones; minimalismo => precisión y atención al espaciado/tipografía.`

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

  // ── Específicas de la librería de landing ──
  list_components: tool({
    description: 'Lista las secciones (componentes) que ya existen en src/components.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const entries = await readdir(safe(project, 'src/components'), { withFileTypes: true })
        return {
          components: entries
            .filter((e) => e.isFile() && e.name.endsWith('.tsx'))
            .map((e) => e.name.replace(/\.tsx$/, '')),
        }
      } catch {
        return { components: [] }
      }
    },
  }),

  get_style: tool({
    description:
      'Devuelve el estilo/design system elegido para la librería (preset + ajuste). Consúltalo antes de generar un componente para respetar el estilo.',
    inputSchema: z.object({}),
    execute: async () => {
      const style = await readStyle(project)
      const p = getPreset(style.preset)
      return {
        style,
        preset: p ? { id: p.id, label: p.label, description: p.description } : null,
      }
    },
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

  // Contrato de estilo del proyecto (design system elegido por el usuario).
  const style = await readStyle(project)

  // Modelo configurable por env (GEMINI_MODEL); default Gemini 3.1 Pro. Si tu key
  // no tiene acceso a uno, cámbialo sin tocar código (p. ej. gemini-2.5-flash).
  const result = streamText({
    model: google(process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview'),
    system: `Eres un agente especializado en construir una LIBRERÍA DE COMPONENTES DE LANDING.
Trabajas dentro de un IDE web sobre el proyecto "${row.name}" (slug: ${s}), una app
React + Vite cuya home (src/UserApp.tsx) es una GALERÍA que auto-descubre y renderiza
cada sección de src/components/*.tsx.

Cómo funciona la librería:
- Cada sección de landing es UN archivo en src/components/<Nombre>.tsx con \`export default\`
  de un componente React autocontenido (con sus datos/textos demo incluidos).
- La galería los muestra sola (import.meta.glob); NO tienes que registrar nada ni tocar
  src/UserApp.tsx ni src/main.tsx.
- Nombres en PascalCase y descriptivos por tipo de sección: Hero, Navbar, Features,
  Pricing, Testimonials, CTA, Footer, FAQ, Stats, Logos…

Reglas:
- Antes de modificar un archivo existente, léelo con read_file. Usa list_components para
  ver qué secciones ya existen y get_style para conocer el estilo.
- Al crear/editar una sección, escribe el archivo COMPLETO con write_file (nunca parcial).
- Una petición = normalmente UNA sección nueva (un archivo en src/components/). No generes
  toda la landing salvo que te lo pidan explícitamente.
- Componentes responsive y accesibles, a ancho completo (una sección de landing real).
- ESTILO: respeta el design system. USA SIEMPRE las variables CSS de src/styles/tokens.css
  (var(--color-bg), var(--color-surface), var(--color-text), var(--color-muted),
  var(--color-accent), var(--color-accent-ink), var(--color-border), var(--font-display),
  var(--font-text), var(--radius), var(--shadow), var(--space), var(--max-width)).
  NO hardcodees colores ni fuentes: el usuario cambia el estilo y todo debe re-estilarse solo.
- No edites src/styles/tokens.css (lo gestiona el selector de estilo). No instales librerías
  de UI: CSS puro y React.
- Responde breve y en el mismo idioma que el usuario.

Contrato de estilo actual:
${styleSummary(style)}
${DESIGN_GUIDE}`,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(15),
    tools: tools(project),
  })

  // Persistencia serverside: al terminar el turno, guardamos el historial completo
  // (mensajes originales + respuesta del asistente) en el SQLite del workspace.
  return result.toUIMessageStreamResponse({
    originalMessages: messages as UIMessage[],
    onFinish: ({ messages: finalMessages }) => {
      try {
        saveChatHistory(s, finalMessages as unknown[])
      } catch {
        /* noop */
      }
    },
  })
})

// Historial del chat (serverside). El cliente lo carga al abrir el panel.
agentApi.get('/history', (c) => {
  const project = c.req.query('project') ?? ''
  const s = slug(project)
  if (!s || !getProjectRow(s)) return c.json({ messages: [] })
  return c.json({ messages: getChatHistory(s) })
})

// Borra el historial del chat (botón "nueva conversación").
agentApi.delete('/history', (c) => {
  const project = c.req.query('project') ?? ''
  const s = slug(project)
  if (s) clearChatHistory(s)
  return c.json({ ok: true })
})

// ── Estilo / design system de la librería ─────────────────────────────────────
// Devuelve el estilo actual + el catálogo de presets y parejas tipográficas
// (para el selector "Estilo" del panel ✦ AI).
agentApi.get('/style', async (c) => {
  const project = c.req.query('project') ?? ''
  const s = slug(project)
  if (!s || !getProjectRow(s)) {
    return c.json({ style: DEFAULT_STYLE, presets: PRESETS, fontPairs: FONT_PAIRS })
  }
  const style = await readStyle(project)
  return c.json({ style, presets: PRESETS, fontPairs: FONT_PAIRS })
})

// Aplica un estilo: persiste style.json y regenera src/styles/tokens.css
// (determinista, sin LLM). El preview recarga y todos los componentes se re-estilan.
agentApi.post('/style', async (c) => {
  const body = await c.req.json<Partial<StyleConfig> & { project?: string }>()
  const project = body.project ?? ''
  const s = slug(project)
  if (!s || !getProjectRow(s)) return c.json({ error: 'Proyecto no encontrado' }, 404)

  const style: StyleConfig = {
    preset: typeof body.preset === 'string' ? body.preset : null,
    tweak: typeof body.tweak === 'string' ? body.tweak : '',
    accent: typeof body.accent === 'string' ? body.accent : null,
    fontPair: typeof body.fontPair === 'string' ? body.fontPair : null,
  }
  await writeStyle(project, style)
  return c.json({ ok: true, style })
})
