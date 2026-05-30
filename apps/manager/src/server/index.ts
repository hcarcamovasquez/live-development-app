import { Hono } from 'hono'
import { getRequestListener, serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createServer as createHttpServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { api } from './api.js'
import { config } from './config.js'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '../web') // dev: src/web · prod: dist/web
const isProd = process.env.NODE_ENV === 'production'

const app = new Hono()
app.route('/api', api)

if (isProd) {
  app.use('/assets/*', serveStatic({ root: relativeToCwd(webRoot) }))
  app.use('/*', serveStatic({ root: relativeToCwd(webRoot) }))
  app.get('*', async (c) => c.html(await readFile(resolve(webRoot, 'index.html'), 'utf8')))
  serve({ fetch: app.fetch, port: config.port }, () =>
    console.log(`\n  🗂  manager [prod] → :${config.port}\n`),
  )
} else {
  const { createServer: createViteServer } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const vite = await createViteServer({
    root: webRoot,
    configFile: false,
    plugins: [react()],
    appType: 'custom',
    server: { middlewareMode: true },
  })
  app.get('*', async (c) => {
    try {
      const raw = await readFile(resolve(webRoot, 'index.html'), 'utf8')
      return c.html(await vite.transformIndexHtml(c.req.path, raw))
    } catch (err) {
      vite.ssrFixStacktrace(err as Error)
      return c.text(String(err), 500)
    }
  })
  const honoListener = getRequestListener(app.fetch)
  const server = createHttpServer((req, res) =>
    vite.middlewares(req, res, () => honoListener(req, res)),
  )
  server.listen(config.port, () => console.log(`\n  🗂  manager [dev] → :${config.port}\n`))
}

function relativeToCwd(abs: string): string {
  return resolve(abs).replace(process.cwd() + '/', './')
}
