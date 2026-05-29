import { Hono } from 'hono'
import { getRequestListener, serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createServer as createHttpServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { api } from './api.js'
import { webRoot, webDist, previewUrl } from './paths.js'
import { ensureScaffold, ensureInstalled, startDevServer } from './project.js'

const PORT = Number(process.env.PORT ?? 3000)
const isProd = process.env.NODE_ENV === 'production'

// 1) Garantiza el PROYECTO independiente y arranca SU dev server propio.
await ensureScaffold()
await ensureInstalled()
const projectChild = await startDevServer()
console.log(`  🧪 Proyecto (independiente) en ${previewUrl}`)

// Si el editor termina, baja también el dev server del proyecto.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    projectChild.kill()
    process.exit(0)
  })
}

// 2) Sirve el EDITOR.
if (isProd) {
  await startProd()
} else {
  await startDev()
}

/**
 * DEV: el editor (apps/web) se sirve con Hono + Vite middleware (HMR del editor).
 * El preview del proyecto va por iframe a SU propio dev server.
 */
async function startDev() {
  const { createServer: createViteServer } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')

  const httpServer = createHttpServer()

  const vite = await createViteServer({
    root: webRoot,
    // configFile:false evita que Vite bundlee apps/web/vite.config.ts a un
    // archivo temporal (.vite-temp), que disparaba reinicios de tsx watch.
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
    console.log(`  → Editor:   http://localhost:${PORT}`)
    console.log(`  → Proyecto: ${previewUrl} (iframe)\n`)
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
    console.log(`  → Editor:   http://localhost:${PORT}`)
    console.log(`  → Proyecto: ${previewUrl} (iframe)\n`)
  })
}

function relativeToCwd(abs: string): string {
  return resolve(abs).replace(process.cwd() + '/', './')
}
