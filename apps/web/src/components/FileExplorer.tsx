import { useEffect, useState } from 'react'

export type TreeNode = {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: TreeNode[]
}

type Props = {
  project: string
  tree: TreeNode[]
  active: string
  dirtyPaths: Set<string>
  onOpen: (path: string) => void
  onNewFile: (path: string) => void
  onDeleteFile: (path: string) => void
}

export function FileExplorer({
  project,
  tree,
  active,
  dirtyPaths,
  onOpen,
  onNewFile,
  onDeleteFile,
}: Props) {
  // Carpetas expandidas (por ruta). Se eleva aquí para poder abrir los
  // ancestros de un archivo recién creado en una subcarpeta anidada.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Creación en curso: ruta del directorio destino ('' = raíz), o null.
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  // Al (re)cargar el árbol, asegura las carpetas de primer nivel expandidas.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const n of tree) if (n.type === 'dir') next.add(n.path)
      return next
    })
  }, [tree])

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })

  const expandAncestors = (filePath: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      const parts = filePath.split('/')
      parts.pop() // quita el nombre del archivo
      let acc = ''
      for (const part of parts) {
        acc = acc ? `${acc}/${part}` : part
        next.add(acc)
      }
      return next
    })

  const startCreate = (dir: string) => {
    setCreatingIn(dir)
    setDraft(dir ? `${dir}/` : '')
  }

  const submitNew = () => {
    const p = draft.trim().replace(/^\/+/, '')
    if (p) {
      onNewFile(p)
      expandAncestors(p)
    }
    setDraft('')
    setCreatingIn(null)
  }

  return (
    <aside className="explorer">
      <div className="explorer-head">
        <span className="explorer-title">explorer</span>
        <button className="ex-action" title="Nuevo archivo" onClick={() => startCreate('')}>
          +
        </button>
      </div>

      {creatingIn !== null && (
        <div className="new-file-row">
          <input
            className="new-file-input"
            autoFocus
            value={draft}
            placeholder="src/components/Boton.tsx"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNew()
              if (e.key === 'Escape') {
                setDraft('')
                setCreatingIn(null)
              }
            }}
            onBlur={() => (draft.trim() ? submitNew() : setCreatingIn(null))}
          />
          <span className="new-file-hint">usa “/” para subcarpetas anidadas</span>
        </div>
      )}

      <div className="tree" key={project}>
        {tree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            active={active}
            expanded={expanded}
            dirtyPaths={dirtyPaths}
            onToggle={toggle}
            onOpen={onOpen}
            onCreateIn={startCreate}
            onDeleteFile={onDeleteFile}
          />
        ))}
      </div>
    </aside>
  )
}

function TreeItem({
  node,
  depth,
  active,
  expanded,
  dirtyPaths,
  onToggle,
  onOpen,
  onCreateIn,
  onDeleteFile,
}: {
  node: TreeNode
  depth: number
  active: string
  expanded: Set<string>
  dirtyPaths: Set<string>
  onToggle: (path: string) => void
  onOpen: (path: string) => void
  onCreateIn: (dir: string) => void
  onDeleteFile: (path: string) => void
}) {
  const pad = { paddingLeft: `${10 + depth * 14}px` }

  if (node.type === 'dir') {
    const isOpen = expanded.has(node.path)
    return (
      <div>
        <div className="row dir" style={pad}>
          <button className="row-name dir-btn" onClick={() => onToggle(node.path)}>
            <span className="caret">{isOpen ? '▾' : '▸'}</span>
            {node.name}
          </button>
          <button
            className="row-add"
            title={`Nuevo archivo en ${node.name}/`}
            onClick={(e) => {
              e.stopPropagation()
              onCreateIn(node.path)
            }}
          >
            +
          </button>
        </div>
        {isOpen &&
          node.children?.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              active={active}
              expanded={expanded}
              dirtyPaths={dirtyPaths}
              onToggle={onToggle}
              onOpen={onOpen}
              onCreateIn={onCreateIn}
              onDeleteFile={onDeleteFile}
            />
          ))}
      </div>
    )
  }

  const isActive = node.path === active
  const isDirty = dirtyPaths.has(node.path)

  return (
    <div className={`row file ${isActive ? 'active' : ''}`} style={pad}>
      <button className="row-name file-btn" onClick={() => onOpen(node.path)}>
        <span className="file-icon">{icon(node.name)}</span>
        {node.name}
        {isDirty && <span className="dirty-dot" title="sin guardar" />}
      </button>
      <button
        className="row-del"
        title="Borrar archivo"
        onClick={(e) => {
          e.stopPropagation()
          onDeleteFile(node.path)
        }}
      >
        ✕
      </button>
    </div>
  )
}

function icon(name: string): string {
  if (/\.tsx?$/.test(name)) return '◆'
  if (/\.jsx?$/.test(name)) return '◇'
  if (/\.css$/.test(name)) return '▣'
  if (/\.html?$/.test(name)) return '◧'
  if (/\.json$/.test(name)) return '⟦'
  return '·'
}
