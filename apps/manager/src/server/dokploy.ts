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

/**
 * Host del workspace. Si hay WORKSPACE_DOMAIN_SUFFIX explícito, se construye a mano;
 * si no, se le pide a Dokploy un dominio autogenerado, que respeta la config de la
 * instancia (sslip.io/traefik.me + la IP del servidor) → ws-<slug>-<hash>-<ip>.sslip.io
 */
async function generateHost(appName: string): Promise<string> {
  if (config.domainSuffix) {
    const rand = randomBytes(3).toString('hex')
    return `${appName}-${rand}.${config.domainSuffix}`
  }
  const res = await post<unknown>('domain.generateDomain', {
    appName,
    ...(config.serverId ? { serverId: config.serverId } : {}),
  })
  const host =
    typeof res === 'string'
      ? res
      : ((res as { domain?: string; host?: string } | null)?.domain ??
        (res as { domain?: string; host?: string } | null)?.host)
  if (!host || typeof host !== 'string') {
    throw new Error(`Dokploy generateDomain no devolvió dominio: ${JSON.stringify(res).slice(0, 200)}`)
  }
  return host
}

export type CreateResult = { applicationId: string; url: string }

/** Crea la app del workspace en Dokploy desde el repo del editor y la despliega. */
export async function createAndDeploy(name: string, slug: string): Promise<CreateResult> {
  assertDokployConfig()
  const appName = `ws-${slug}`

  // 1) Crear la aplicación (required: name, environmentId)
  const created = await post<{ applicationId: string }>('application.create', {
    name,
    appName,
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
  // Key de Gemini del agente IA: se PROPAGA desde el manager. Así, al crear un
  // workspace, hereda automáticamente la key y el chat ✦ AI funciona sin
  // configurar nada por workspace.
  const env = [
    'NODE_ENV=production',
    `PORT=${config.editorPort}`,
    'PROJECTS_DIR=/home/node/projects',
    'DB_PATH=/home/node/projects/registry.db',
    `WORKSPACE_ID=${slug}`,
    `GOOGLE_GENERATIVE_AI_API_KEY=${config.geminiApiKey}`,
    `GEMINI_MODEL=${config.geminiModel}`,
  ].join('\n')
  await post('application.saveEnvironment', {
    applicationId,
    env,
    buildArgs: null,
    buildSecrets: null,
    createEnvFile: false,
  })

  // 5) Volumen persistente con los proyectos + SQLite del workspace, montado bajo
  //    el home del usuario `node`. required: type, mountPath, serviceId
  await post('mounts.create', {
    type: 'volume',
    volumeName: `ws-${slug}-data`,
    mountPath: '/home/node/projects',
    serviceType: 'application',
    serviceId: applicationId,
  })

  // 6) Dominio (autogenerado por Dokploy → sslip.io/IP) apuntando al editor. required: host
  const host = await generateHost(appName)
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
