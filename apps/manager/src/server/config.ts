/** Configuración del manager (toda por variables de entorno). */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  dbPath: process.env.DB_PATH ?? '/data/manager.db',

  // Dokploy
  dokployUrl: (process.env.DOKPLOY_URL ?? '').replace(/\/$/, ''),
  dokployApiKey: process.env.DOKPLOY_API_KEY ?? '',
  environmentId: process.env.DOKPLOY_ENVIRONMENT_ID ?? '',
  serverId: process.env.DOKPLOY_SERVER_ID || undefined,

  // Fuente del editor (Dokploy construye desde git)
  editorRepoUrl: process.env.EDITOR_REPO_URL ?? '',
  editorBranch: process.env.EDITOR_BRANCH ?? 'main',
  editorDockerfile: process.env.EDITOR_DOCKERFILE_PATH ?? 'Dockerfile',
  editorPort: Number(process.env.EDITOR_PORT ?? 3000),

  // Sufijo de dominio para el workspace (p. ej. tu wildcard o <ip>.sslip.io).
  domainSuffix: process.env.WORKSPACE_DOMAIN_SUFFIX ?? '',

  // Key + modelo de Gemini (agente IA). Si están en el manager, se PROPAGAN
  // automáticamente a cada workspace nuevo (sin configurarlos una por una).
  geminiApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-3.1-pro-preview',
}

export function assertDokployConfig(): void {
  const missing = [
    ['DOKPLOY_URL', config.dokployUrl],
    ['DOKPLOY_API_KEY', config.dokployApiKey],
    ['DOKPLOY_ENVIRONMENT_ID', config.environmentId],
    ['EDITOR_REPO_URL', config.editorRepoUrl],
  ].filter(([, v]) => !v)
  if (missing.length) {
    throw new Error(`Faltan variables de entorno: ${missing.map(([k]) => k).join(', ')}`)
  }
}
