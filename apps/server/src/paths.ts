import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { homedir } from 'node:os'

// dirname de este archivo: apps/server/src (dev con tsx) o apps/server/dist (prod).
// En ambos casos, "../../web" apunta a apps/web (el EDITOR).
const here = dirname(fileURLToPath(import.meta.url))

export const webRoot = resolve(here, '../../web')
export const webDist = resolve(webRoot, 'dist')

// El PROYECTO editable: una app Vite COMPLETA e INDEPENDIENTE del editor, en un
// storage EXTERNO al repo (sus propios archivos, su propio node_modules, su
// propio dev server). Configurable con STORAGE_DIR.
export const projectDir =
  process.env.STORAGE_DIR ?? join(homedir(), '.live-development-app', 'project')

// Puerto del dev server propio del proyecto (independiente del editor).
export const previewPort = Number(process.env.PREVIEW_PORT ?? 5174)
export const previewUrl = `http://localhost:${previewPort}`
