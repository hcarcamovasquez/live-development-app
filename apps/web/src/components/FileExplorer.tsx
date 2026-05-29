import { useState } from 'react'

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
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')

  const submitNew = () => {
    const p = draft.trim()
    if (p) onNewFile(p)
    setDraft('')
    setCreating(false)
  }

  return (
    <aside className="explorer">
      <div className="explorer-head">
        <span className="explorer-title">explorer</span>
        <button
          className="ex-action"
          title="Nuevo archivo"
          onClick={() => setCreating((v) => !v)}
        >
          +
        </button>
      </div>

      {creating && (
        <input
          className="new-file-input"
          autoFocus
          value={draft}
          placeholder="src/Boton.tsx"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitNew()
            if (e.key === 'Escape') {
              setCreating(false)
              setDraft('')
            }
          }}
          onBlur={() => (draft.trim() ? submitNew() : setCreating(false))}
        />
      )}

      <div className="tree" key={project}>
        {tree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            active={active}
            dirtyPaths={dirtyPaths}
            onOpen={onOpen}
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
  dirtyPaths,
  onOpen,
  onDeleteFile,
}: {
  node: TreeNode
  depth: number
  active: string
  dirtyPaths: Set<string>
  onOpen: (path: string) => void
  onDeleteFile: (path: string) => void
}) {
  const [open, setOpen] = useState(depth < 1)
  const pad = { paddingLeft: `${10 + depth * 14}px` }

  if (node.type === 'dir') {
    return (
      <div>
        <button className="row dir" style={pad} onClick={() => setOpen((v) => !v)}>
          <span className="caret">{open ? '▾' : '▸'}</span>
          <span className="row-name">{node.name}</span>
        </button>
        {open &&
          node.children?.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              active={active}
              dirtyPaths={dirtyPaths}
              onOpen={onOpen}
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
