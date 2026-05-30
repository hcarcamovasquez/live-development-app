import { Hono } from 'hono'
import { getRequestListener } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import type { Duplex } from 'node:stream'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import httpProxy from 'http-proxy'
import { api } from './api.js'
import { agentApi } from './agent.js'
import { webRoot, webDist, projectsDir } from './paths.js'
import { startTerminalServer, handleTerminalUpgrade, stopTerminals } from './terminal.js'
import { stopAllApps, appPort } from './apprunner.js'

// Carga variables desde un .env local (gitignoreado) para desarrollo: la key de
// Gemini y cualquier override. En prod las inyecta Dokploy y este archivo no existe.
for (const envFile of ['.env', '../../.env']) {
  try {
    process.loadEnvFile(resolve(process.cwd(), envFile))
  } catch {
    /* no existe → se ignora */
  }
}

const PORT = Number(process.env.PORT ?? 3000)
const isProd = process.env.NODE_ENV === 'production'

await mkdir(projectsDir, { recursive: true })
startTerminalServer()

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    stopAllApps()
    stopTerminals()
    process.exit(0)
  })
}

// Proxy del preview: /preview/<slug>/… → dev server del proyecto (127.0.0.1:port),
// en el MISMO origen del editor (funciona tras un dominio remoto). Incluye WS de HMR.
const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true })
proxy.on('error', (_e, _req, res) => {
  const r = res as ServerResponse | undefined
  if (r && 'writeHead' in r && !r.headersSent) {
    r.writeHead(502, { 'content-type': 'text/plain' })
    r.end('preview no disponible')
  }
})

function previewTarget(url: string): string | null {
  const m = url.match(/^\/preview\/([^/?]+)\//)
  if (!m) return null
  const port = appPort(decodeURIComponent(m[1]))
  return port ? `http://127.0.0.1:${port}` : null
}

const app = new Hono()
app.route('/api', api)
app.route('/api/agent', agentApi)

// En dev, las middlewares de Vite (HMR del editor por su propio ws). En prod, null.
let viteMiddlewares:
  | ((req: IncomingMessage, res: ServerResponse, next: () => void) => void)
  | null = null

if (isProd) {
  app.use('/assets/*', serveStatic({ root: relativeToCwd(webDist) }))
  app.use('/*', serveStatic({ root: relativeToCwd(webDist) }))
  app.get('*', async (c) => c.html(await readFile(resolve(webDist, 'index.html'), 'utf8')))
} else {
  const { createServer: createViteServer } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const vite = await createViteServer({
    root: webRoot,
    configFile: false,
    plugins: [react()],
    appType: 'custom',
    server: { middlewareMode: true }, // HMR del editor en su propio ws (solo dev local)
  })
  viteMiddlewares = vite.middlewares
  app.get('*', async (c) => {
    try {
      const raw = await readFile(resolve(webRoot, 'index.html'), 'utf8')
      return c.html(await vite.transformIndexHtml(c.req.path, raw))
    } catch (err) {
      vite.ssrFixStacktrace(err as Error)
      return c.text(String(err), 500)
    }
  })
}

const honoListener = getRequestListener(app.fetch)

const server = createHttpServer((req, res) => {
  const url = req.url ?? '/'
  const target = previewTarget(url)
  if (target) {
    proxy.web(req, res, { target })
    return
  }
  if (viteMiddlewares) {
    viteMiddlewares(req, res, () => honoListener(req, res))
    return
  }
  honoListener(req, res)
})

server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
  const url = req.url ?? '/'
  if (url.startsWith('/ws/terminal')) {
    handleTerminalUpgrade(req, socket, head)
    return
  }
  const target = previewTarget(url)
  if (target) {
    proxy.ws(req, socket, head, { target })
    return
  }
  socket.destroy()
})

server.listen(PORT, () => {
  console.log(`\n  ⚡ live-development-app  [${isProd ? 'prod' : 'dev'}]  →  :${PORT}\n`)
})

function relativeToCwd(abs: string): string {
  return resolve(abs).replace(process.cwd() + '/', './')
}
