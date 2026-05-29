import { Hono } from 'hono'
import { getRequestListener, serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createServer as createHttpServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { api } from './api.js'
import { webRoot, webDist, projectsDir } from './paths.js'
import { stopAll } from './projects.js'

const PORT = Number(process.env.PORT ?? 3000)
const isProd = process.env.NODE_ENV === 'production'

// Asegura el directorio donde se persisten los proyectos.
await mkdir(projectsDir, { recursive: true })

// Al cerrar el editor, baja los dev servers de los proyectos.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    stopAll()
    process.exit(0)
  })
}

if (isProd) {
  await startProd()
} else {
  await startDev()
}

/**
 * DEV: el editor (apps/web) se sirve con Hono + Vite middleware (HMR del editor).
 * Cada proyecto corre su propio dev server (bajo demanda) y se muestra por iframe.
 */
async function startDev() {
  const { createServer: createViteServer } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')

  const httpServer = createHttpServer()

  const vite = await createViteServer({
    root: webRoot,
    // configFile:false evita que Vite bundlee la config a .vite-temp (lo que
    // disparaba reinicios de tsx watch).
    configFile: false,
    plugins: [react()],
    appType: 'custom',
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
    },
  })

  const app = new Hono()
  app.route('/api', api)

  app.get('*', async (c) => {
    try {
      const raw = await readFile(resolve(webRoot, 'index.html'), 'utf8')
      const html = await vite.transformIndexHtml(c.req.path, raw)
      return c.html(html)
    } catch (err) {
      vite.ssrFixStacktrace(err as Error)
      return c.text(String(err), 500)
    }
  })

  const honoListener = getRequestListener(app.fetch)

  httpServer.on('request', (req, res) => {
    vite.middlewares(req, res, () => honoListener(req, res))
  })

  httpServer.listen(PORT, () => {
    console.log(`\n  ⚡ live-development-app  [dev]`)
    console.log(`  → Editor: http://localhost:${PORT}`)
    console.log(`  Proyectos en: ${projectsDir}\n`)
  })
}

/** PROD: el editor se sirve estático desde apps/web/dist. */
async function startProd() {
  const app = new Hono()
  app.route('/api', api)
  app.use('/assets/*', serveStatic({ root: relativeToCwd(webDist) }))
  app.use('/*', serveStatic({ root: relativeToCwd(webDist) }))
  app.get('*', async (c) => {
    const html = await readFile(resolve(webDist, 'index.html'), 'utf8')
    return c.html(html)
  })
  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`\n  ⚡ live-development-app  [prod]`)
    console.log(`  → Editor: http://localhost:${PORT}\n`)
  })
}

function relativeToCwd(abs: string): string {
  return resolve(abs).replace(process.cwd() + '/', './')
}
