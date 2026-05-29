import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { projectPath } from './projects.js'

const exec = promisify(execFile)

// Identidad usada para los commits del entorno (evita "author identity unknown").
const IDENT = ['-c', 'user.name=live-dev', '-c', 'user.email=live-dev@local']

/** Ejecuta git dentro del proyecto y devuelve stdout. */
export async function git(slug: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', projectPath(slug), ...args], {
    maxBuffer: 16 * 1024 * 1024,
  })
  return stdout
}

/** Inicializa el repo con un commit inicial (se llama al crear el proyecto). */
export async function initRepo(slug: string, name: string): Promise<void> {
  await git(slug, ['init', '-q', '-b', 'main'])
  await git(slug, ['add', '-A'])
  await git(slug, [...IDENT, 'commit', '-q', '-m', `init: ${name}`])
}

export type GitFile = { path: string; status: 'M' | 'A' | 'D' | 'R' | 'U' }
export type GitStatus = { branch: string; files: GitFile[]; ahead: number }

/** Estado del repo: rama + archivos cambiados (porcelain). */
export async function statusOf(slug: string): Promise<GitStatus> {
  let branch = 'main'
  try {
    branch = (await git(slug, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim() || 'main'
  } catch {
    /* repo sin commits aún */
  }
  const out = await git(slug, ['status', '--porcelain=v1'])
  const files: GitFile[] = out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const x = line[0]
      const y = line[1]
      const path = line.slice(3).replace(/^"|"$/g, '')
      let status: GitFile['status'] = 'M'
      if (line.startsWith('??')) status = 'U'
      else if (x === 'A' || y === 'A') status = 'A'
      else if (x === 'D' || y === 'D') status = 'D'
      else if (x === 'R' || y === 'R') status = 'R'
      else status = 'M'
      return { path, status }
    })
  let ahead = 0
  try {
    ahead = (await git(slug, ['rev-list', '--count', 'HEAD'])).trim() === '' ? 0 : 0
  } catch {
    /* noop */
  }
  return { branch, files, ahead }
}

/** Contenido de un archivo en HEAD (cadena vacía si no existe allí). */
export async function showHead(slug: string, path: string): Promise<string> {
  try {
    return await git(slug, ['show', `HEAD:${path}`])
  } catch {
    return ''
  }
}

/** Hace stage de todo y commitea. Devuelve el hash corto. */
export async function commitAll(slug: string, message: string): Promise<{ hash: string }> {
  await git(slug, ['add', '-A'])
  await git(slug, [...IDENT, 'commit', '-m', message])
  const hash = (await git(slug, ['rev-parse', '--short', 'HEAD'])).trim()
  return { hash }
}
