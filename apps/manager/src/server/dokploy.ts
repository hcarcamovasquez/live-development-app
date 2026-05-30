import { randomBytes } from 'node:crypto'
import { config, assertDokployConfig } from './config.js'

/**
 * Cliente de la API de Dokploy (REST sobre /api, header x-api-key).
 * NOTA: los nombres/campos exactos pueden variar según la versión de Dokploy;
 * confírmalos en <DOKPLOY_URL>/api/openapi.json. Cada paso lanza con contexto.
 */
async function post<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${config.dokployUrl}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.dokployApiKey },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Dokploy ${path} → ${res.status}: ${text.slice(0, 300)}`)
  return (text ? JSON.parse(text) : {}) as T
}

function randomHost(slug: string): string {
  const rand = randomBytes(3).toString('hex')
  const suffix = config.domainSuffix || 'traefik.me'
  return `${slug}-${rand}.${suffix}`
}

export type CreateResult = { applicationId: string; url: string }

/** Crea la app del workspace en Dokploy desde el repo del editor y la despliega. */
export async function createAndDeploy(name: string, slug: string): Promise<CreateResult> {
  assertDokployConfig()

  // 1) Crear la aplicación
  const created = await post<{ applicationId: string }>('application.create', {
    name,
    appName: `ws-${slug}`,
    environmentId: config.environmentId,
    ...(config.serverId ? { serverId: config.serverId } : {}),
  })
  const applicationId = created.applicationId
  if (!applicationId) throw new Error('Dokploy no devolvió applicationId')

  // 2) Fuente git (el editor)
  await post('application.saveGitProvider', {
    applicationId,
    customGitUrl: config.editorRepoUrl,
    customGitBranch: config.editorBranch,
    customGitBuildPath: '/',
  })

  // 3) Build por Dockerfile
  await post('application.saveBuildType', {
    applicationId,
    buildType: 'dockerfile',
    dockerfile: config.editorDockerfile,
  })

  // 4) Variables de entorno del editor (persistencia en el volumen /data)
  const env = [
    'NODE_ENV=production',
    `PORT=${config.editorPort}`,
    'PROJECTS_DIR=/data/projects',
    'DB_PATH=/data/registry.db',
    `WORKSPACE_ID=${slug}`,
  ].join('\n')
  await post('application.saveEnvironment', { applicationId, env })

  // 5) Dominio (aleatorio) apuntando al puerto del editor
  const host = randomHost(slug)
  await post('domain.create', {
    applicationId,
    host,
    port: config.editorPort,
    https: true,
    certificateType: 'letsencrypt',
  })

  // 6) Desplegar
  await post('application.deploy', { applicationId })

  return { applicationId, url: `https://${host}` }
}

/** Borra la app del workspace en Dokploy. */
export async function deleteApp(applicationId: string): Promise<void> {
  await post('application.delete', { applicationId })
}
