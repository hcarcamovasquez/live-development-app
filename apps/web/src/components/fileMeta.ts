export type FileMeta = {
  badge: string // etiqueta corta del ícono (estilo JetBrains)
  color: string // color de marca del tipo
  dark?: boolean // texto oscuro sobre el color (para amarillos)
  type: string // nombre legible del lenguaje (status bar / breadcrumb)
}

/** Metadatos de un archivo según su extensión (ícono + lenguaje). */
export function fileMeta(name: string): FileMeta {
  if (/\.tsx$/.test(name)) return { badge: 'TS', color: '#3a96dd', type: 'TypeScript JSX' }
  if (/\.ts$/.test(name)) return { badge: 'TS', color: '#3a96dd', type: 'TypeScript' }
  if (/\.jsx$/.test(name)) return { badge: 'JS', color: '#e8d44d', dark: true, type: 'JavaScript JSX' }
  if (/\.js$/.test(name)) return { badge: 'JS', color: '#e8d44d', dark: true, type: 'JavaScript' }
  if (/\.css$/.test(name)) return { badge: '#', color: '#2d9cdb', type: 'CSS' }
  if (/\.html?$/.test(name)) return { badge: '<>', color: '#e44d26', type: 'HTML' }
  if (/\.json$/.test(name)) return { badge: '{}', color: '#cbcb41', dark: true, type: 'JSON' }
  if (/\.md$/.test(name)) return { badge: 'M', color: '#7d8ea0', type: 'Markdown' }
  if (/lock|\.yaml$|\.yml$/.test(name)) return { badge: '≡', color: '#9aa7b0', type: 'YAML' }
  return { badge: '·', color: '#9aa7b0', type: 'Text' }
}

/** Lenguaje para Monaco según extensión. */
export function langOf(path: string): string {
  if (/\.tsx?$/.test(path)) return 'typescript'
  if (/\.jsx?$/.test(path)) return 'javascript'
  if (/\.css$/.test(path)) return 'css'
  if (/\.html?$/.test(path)) return 'html'
  if (/\.json$/.test(path)) return 'json'
  if (/\.md$/.test(path)) return 'markdown'
  if (/\.ya?ml$/.test(path)) return 'yaml'
  return 'plaintext'
}
