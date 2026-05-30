import { randomBytes } from 'node:crypto'
import { config, assertDokployConfig } from './config.js'

/**
 * Cliente de la API de Dokploy (REST sobre /api, header x-api-key).
 * Los cuerpos siguen el OpenAPI de la instancia (v0.29.x): varios campos son
 * "required" aunque admitan null — hay que enviarlos o devuelve 400 (Zod).
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

  // 1) Crear la aplicación (required: name, environmentId)
  const created = await post<{ applicationId: string }>('application.create', {
    name,
    appName: `ws-${slug}`,
    description: null,
    environmentId: config.environmentId,
    serverId: config.serverId || null,
  })
  const applicationId = created.applicationId
  if (!applicationId) throw new Error('Dokploy no devolvió applicationId')

  // 2) Fuente git (el editor). required: applicationId, customGitBuildPath,
  //    customGitUrl, watchPaths, customGitBranch
  await post('application.saveGitProvider', {
    applicationId,
    customGitUrl: config.editorRepoUrl,
    customGitBranch: config.editorBranch,
    customGitBuildPath: '/',
    watchPaths: null,
  })

  // 3) Build por Dockerfile. required: applicationId, buildType, dockerfile,
  //    dockerContextPath, dockerBuildStage, herokuVersion, railpackVersion
  await post('application.saveBuildType', {
    applicationId,
    buildType: 'dockerfile',
    dockerfile: config.editorDockerfile,
    dockerContextPath: null,
    dockerBuildStage: null,
    herokuVersion: null,
    railpackVersion: null,
  })

  // 4) Variables de entorno del editor. required: applicationId, env,
  //    buildArgs, buildSecrets, createEnvFile
  const env = [
    'NODE_ENV=production',
    `PORT=${config.editorPort}`,
    'PROJECTS_DIR=/data/projects',
    'DB_PATH=/data/registry.db',
    `WORKSPACE_ID=${slug}`,
  ].join('\n')
  await post('application.saveEnvironment', {
    applicationId,
    env,
    buildArgs: null,
    buildSecrets: null,
    createEnvFile: false,
  })

  // 5) Volumen persistente montado en /data (proyectos + SQLite del workspace).
  //    required: type, mountPath, serviceId
  await post('mounts.create', {
    type: 'volume',
    volumeName: `ws-${slug}-data`,
    mountPath: '/data',
    serviceType: 'application',
    serviceId: applicationId,
  })

  // 6) Dominio (aleatorio) apuntando al puerto del editor. required: host
  const host = randomHost(slug)
  await post('domain.create', {
    applicationId,
    host,
    port: config.editorPort,
    https: true,
    certificateType: 'letsencrypt',
    domainType: 'application',
  })

  // 7) Desplegar
  await post('application.deploy', { applicationId })

  return { applicationId, url: `https://${host}` }
}

/** Borra la app del workspace en Dokploy. */
export async function deleteApp(applicationId: string): Promise<void> {
  await post('application.delete', { applicationId })
}
