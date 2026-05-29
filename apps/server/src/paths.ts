import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { homedir } from 'node:os'

// dirname de este archivo: apps/server/src (dev con tsx) o apps/server/dist (prod).
// En ambos casos, "../../web" apunta a apps/web (el EDITOR).
const here = dirname(fileURLToPath(import.meta.url))

export const webRoot = resolve(here, '../../web')
export const webDist = resolve(webRoot, 'dist')

// Directorio donde se PERSISTEN los proyectos (cada subcarpeta es un proyecto
// Vite independiente con su propio node_modules y dev server). Configurable.
export const projectsDir =
  process.env.PROJECTS_DIR ?? join(homedir(), '.live-development-app', 'projects')

// Puerto base para los dev servers de los proyectos (se asigna uno libre por
// proyecto a partir de aquí).
export const previewPortBase = Number(
  process.env.PREVIEW_PORT_BASE ?? process.env.PREVIEW_PORT ?? 5174,
)

// Puerto del WebSocket de terminales (PTY por proyecto).
export const terminalPort = Number(process.env.TERMINAL_PORT ?? 3001)
