import { simpleGit, type SimpleGit } from 'simple-git'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { projectPath } from './projects.js'

/**
 * Operaciones git del editor usando simple-git (wrapper del binario git del
 * sistema). En Docker requiere `git` instalado en la imagen.
 */
function g(slug: string): SimpleGit {
  return simpleGit({ baseDir: projectPath(slug), binary: 'git', maxConcurrentProcesses: 1 })
}

const NAME = 'live-dev'
const EMAIL = 'live-dev@local'

/** Inicializa el repo con identidad local y un commit inicial. */
export async function initRepo(slug: string, name: string): Promise<void> {
  const git = g(slug)
  await git.init(['-b', 'main'])
  await git.addConfig('user.name', NAME)
  await git.addConfig('user.email', EMAIL)
  await git.raw(['add', '-A'])
  await git.commit(`init: ${name}`)
}

export type GitFile = { path: string; status: 'M' | 'A' | 'D' | 'R' | 'U' }
export type GitStatus = { branch: string; staged: GitFile[]; unstaged: GitFile[] }

function mapCode(code: string): GitFile['status'] {
  if (code === 'A') return 'A'
  if (code === 'D') return 'D'
  if (code === 'R') return 'R'
  if (code === '?') return 'U'
  return 'M'
}

/** Estado del repo separado en staged (index) y unstaged (working/untracked). */
export async function statusOf(slug: string): Promise<GitStatus> {
  const s = await g(slug).status()
  const staged: GitFile[] = []
  const unstaged: GitFile[] = []
  for (const f of s.files) {
    if (f.index && f.index !== ' ' && f.index !== '?') {
      staged.push({ path: f.path, status: mapCode(f.index) })
    }
    if (f.working_dir && f.working_dir !== ' ') {
      unstaged.push({ path: f.path, status: mapCode(f.working_dir) })
    }
  }
  return { branch: s.current || 'main', staged, unstaged }
}

/** Contenido de un archivo en HEAD ('' si no existe allí). */
export async function showHead(slug: string, path: string): Promise<string> {
  try {
    return await g(slug).show([`HEAD:${path}`])
  } catch {
    return ''
  }
}

/** Hace stage de un archivo. */
export async function stageFile(slug: string, path: string): Promise<void> {
  await g(slug).add([path])
}

/** Quita del stage un archivo (lo deja como cambio sin preparar). */
export async function unstageFile(slug: string, path: string): Promise<void> {
  await g(slug).raw(['reset', '-q', 'HEAD', '--', path])
}

/** Descarta los cambios de un archivo: untracked -> se borra; trazado -> HEAD. */
export async function discardFile(slug: string, path: string, untracked: boolean): Promise<void> {
  if (untracked) {
    await rm(join(projectPath(slug), path), { force: true })
  } else {
    await g(slug).raw(['checkout', 'HEAD', '--', path]) // restaura working + index
  }
}

/** Commit del index. Con `all`, primero hace stage de todo. */
export async function commit(
  slug: string,
  message: string,
  all: boolean,
): Promise<{ hash: string }> {
  const git = g(slug)
  if (all) await git.raw(['add', '-A'])
  const res = await git.commit(message)
  return { hash: res.commit || (await git.revparse(['--short', 'HEAD'])).trim() }
}
