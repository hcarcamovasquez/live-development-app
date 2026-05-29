import { useEffect, useState } from 'react'
import { fileMeta } from './fileMeta'

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

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
      parts.pop()
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
    <aside className="ws-explorer">
      <div className="ws-tw-head">
        <span className="ws-tw-title">Project</span>
        <button className="ws-tw-action" title="Nuevo archivo" onClick={() => startCreate('')}>
          +
        </button>
      </div>

      <div className="ws-tree">
        {/* Nodo raíz: el proyecto (estilo content root de WebStorm). */}
        <div className="ws-row root" style={{ paddingLeft: 8 }}>
          <span className="ws-chevron">▾</span>
          <span className="ws-root-icon" />
          <span className="ws-row-name">{project}</span>
        </div>

        {creatingIn !== null && (
          <div className="ws-new-row" style={{ paddingLeft: 26 }}>
            <input
              className="ws-new-input"
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
          </div>
        )}

        {tree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={1}
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
  const indent = 8 + depth * 14

  if (node.type === 'dir') {
    const isOpen = expanded.has(node.path)
    return (
      <div>
        <div className="ws-row dir" style={{ paddingLeft: indent }} onClick={() => onToggle(node.path)}>
          <span className="ws-chevron">{isOpen ? '▾' : '▸'}</span>
          <FolderIcon open={isOpen} />
          <span className="ws-row-name">{node.name}</span>
          <button
            className="ws-row-add"
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
  const meta = fileMeta(node.name)

  return (
    <div
      className={`ws-row file ${isActive ? 'active' : ''}`}
      style={{ paddingLeft: indent }}
      onClick={() => onOpen(node.path)}
    >
      <span className="ws-chevron empty" />
      <span
        className="ws-badge"
        style={{ background: meta.color, color: meta.dark ? '#1c1c1c' : '#fff' }}
      >
        {meta.badge}
      </span>
      <span className="ws-row-name">{node.name}</span>
      {isDirty && <span className="ws-dirty" title="sin guardar" />}
      <button
        className="ws-row-del"
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

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg className="ws-folder" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill={open ? '#8a9aa8' : '#7d8c99'}
        d="M1.5 3.5h4l1.5 1.5h7.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H1.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
      />
    </svg>
  )
}
