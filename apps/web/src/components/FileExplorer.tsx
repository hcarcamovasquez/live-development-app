import { useCallback, useEffect, useRef, useState } from 'react'
import { fileMeta } from './fileMeta'

export type TreeNode = { name: string; path: string; type: 'file' | 'dir' }

type Props = {
  project: string
  reloadKey: number
  active: string
  dirtyPaths: Set<string>
  onOpen: (path: string) => void
  onNewFile: (path: string) => void
  onDeleteFile: (path: string) => void
}

export function FileExplorer({
  project,
  reloadKey,
  active,
  dirtyPaths,
  onOpen,
  onNewFile,
  onDeleteFile,
}: Props) {
  // Caché de entradas por carpeta ('' = raíz). Carga perezosa al expandir.
  const [cache, setCache] = useState<Record<string, TreeNode[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded

  const loadDir = useCallback(
    (dir: string) =>
      fetch(`/api/tree?project=${encodeURIComponent(project)}&dir=${encodeURIComponent(dir)}`)
        .then((r) => r.json())
        .then((d) => setCache((c) => ({ ...c, [dir]: d.entries ?? [] })))
        .catch(() => {}),
    [project],
  )

  // (Re)carga la raíz y las carpetas ya expandidas cuando cambia el proyecto o reloadKey.
  useEffect(() => {
    setCache({})
    loadDir('')
    for (const d of expandedRef.current) loadDir(d)
  }, [project, reloadKey, loadDir])

  const toggle = (dir: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(dir)) next.delete(dir)
      else {
        next.add(dir)
        if (!cache[dir]) loadDir(dir)
      }
      return next
    })
  }

  const expandAncestors = (filePath: string) => {
    const parts = filePath.split('/')
    parts.pop()
    let acc = ''
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const p of parts) {
        acc = acc ? `${acc}/${p}` : p
        next.add(acc)
      }
      return next
    })
  }

  const submitNew = () => {
    const p = draft.trim().replace(/^\/+/, '')
    if (p) {
      expandAncestors(p)
      onNewFile(p)
    }
    setDraft('')
    setCreating(false)
  }

  return (
    <aside className="ws-explorer">
      <div className="ws-tw-head">
        <span className="ws-tw-title">Project</span>
        <button className="ws-tw-action" title="Nuevo archivo" onClick={() => setCreating((v) => !v)}>
          +
        </button>
      </div>

      <div className="ws-tree">
        <div className="ws-row root" style={{ paddingLeft: 8 }}>
          <span className="ws-chevron">▾</span>
          <span className="ws-root-icon" />
          <span className="ws-row-name">{project}</span>
        </div>

        {creating && (
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
                  setCreating(false)
                }
              }}
              onBlur={() => (draft.trim() ? submitNew() : setCreating(false))}
            />
          </div>
        )}

        <Level
          dir=""
          depth={1}
          cache={cache}
          expanded={expanded}
          active={active}
          dirtyPaths={dirtyPaths}
          onToggle={toggle}
          onOpen={onOpen}
          onDeleteFile={onDeleteFile}
        />
      </div>
    </aside>
  )
}

function Level({
  dir,
  depth,
  cache,
  expanded,
  active,
  dirtyPaths,
  onToggle,
  onOpen,
  onDeleteFile,
}: {
  dir: string
  depth: number
  cache: Record<string, TreeNode[]>
  expanded: Set<string>
  active: string
  dirtyPaths: Set<string>
  onToggle: (dir: string) => void
  onOpen: (path: string) => void
  onDeleteFile: (path: string) => void
}) {
  const entries = cache[dir]
  if (!entries) return <div className="ws-row loading" style={{ paddingLeft: 10 + depth * 14 }}>…</div>

  return (
    <>
      {entries.map((node) => {
        const indent = 8 + depth * 14
        if (node.type === 'dir') {
          const open = expanded.has(node.path)
          return (
            <div key={node.path}>
              <div className="ws-row dir" style={{ paddingLeft: indent }} onClick={() => onToggle(node.path)}>
                <span className="ws-chevron">{open ? '▾' : '▸'}</span>
                <FolderIcon open={open} />
                <span className="ws-row-name">{node.name}</span>
              </div>
              {open && (
                <Level
                  dir={node.path}
                  depth={depth + 1}
                  cache={cache}
                  expanded={expanded}
                  active={active}
                  dirtyPaths={dirtyPaths}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  onDeleteFile={onDeleteFile}
                />
              )}
            </div>
          )
        }
        const meta = fileMeta(node.name)
        const isActive = node.path === active
        const isDirty = dirtyPaths.has(node.path)
        return (
          <div
            key={node.path}
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
            {isDirty && <span className="ws-dirty" />}
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
      })}
    </>
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
