import { useEffect, useState } from 'react'

type GitFile = { path: string; status: string }
type Status = { branch: string; staged: GitFile[]; unstaged: GitFile[] }

const LABEL: Record<string, string> = {
  M: 'modificado',
  A: 'añadido',
  D: 'borrado',
  R: 'renombrado',
  U: 'sin seguimiento',
}

/**
 * Panel Source Control (git, vía simple-git en el servidor): rama, commit, y
 * cambios separados en Staged / Changes con stage, unstage y descartar.
 */
export function GitPanel({
  project,
  activePath,
  onOpenDiff,
  onReloadFile,
}: {
  project: string
  activePath: string
  onOpenDiff: (path: string) => void
  onReloadFile: (path: string) => void
}) {
  const [st, setSt] = useState<Status>({ branch: '', staged: [], unstaged: [] })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = () =>
    fetch(`/api/git/status?project=${encodeURIComponent(project)}`)
      .then((r) => r.json())
      .then((d) => setSt({ branch: d.branch ?? '', staged: d.staged ?? [], unstaged: d.unstaged ?? [] }))
      .catch(() => {})

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  const post = (url: string, body: object) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, ...body }),
    })

  const stage = async (path: string) => {
    await post('/api/git/stage', { path })
    load()
  }
  const stageAll = async () => {
    await post('/api/git/stage', { path: '.' })
    load()
  }
  const unstage = async (path: string) => {
    await post('/api/git/unstage', { path })
    load()
  }
  const discard = async (f: GitFile) => {
    if (!confirm(`¿Descartar los cambios de ${f.path}? No se puede deshacer.`)) return
    await post('/api/git/discard', { path: f.path, untracked: f.status === 'U' })
    onReloadFile(f.path)
    load()
  }

  const commit = async () => {
    if (!msg.trim() || busy) return
    const all = st.staged.length === 0
    setBusy(true)
    setNote('')
    try {
      const r = await (await post('/api/git/commit', { message: msg, all })).json()
      if (r.error) setNote(r.error)
      else {
        setMsg('')
        setNote(`✓ commit ${r.hash}`)
        load()
        setTimeout(() => setNote(''), 2500)
      }
    } finally {
      setBusy(false)
    }
  }

  const total = st.staged.length + st.unstaged.length
  const commitLabel = busy
    ? '…'
    : st.staged.length > 0
      ? `✓ Commit (${st.staged.length})`
      : st.unstaged.length > 0
        ? `✓ Commit todo (${st.unstaged.length})`
        : '✓ Commit'

  return (
    <aside className="ws-git">
      <div className="ws-tw-head">
        <span className="ws-tw-title">
          Source Control{st.branch && <span className="ws-git-branch"> ⎇ {st.branch}</span>}
        </span>
        <button className="ws-tw-action" title="Refrescar" onClick={load}>
          ⟳
        </button>
      </div>

      <div className="ws-git-commit">
        <textarea
          className="ws-git-msg"
          rows={2}
          value={msg}
          placeholder="Mensaje de commit…"
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit()
          }}
        />
        <button
          className="ws-git-commit-btn"
          disabled={!msg.trim() || total === 0 || busy}
          onClick={commit}
        >
          {commitLabel}
        </button>
        {note && <div className="ws-git-note">{note}</div>}
      </div>

      <div className="ws-git-list">
        {st.staged.length > 0 && (
          <Section
            title="Staged"
            count={st.staged.length}
            files={st.staged}
            activePath={activePath}
            onOpenDiff={onOpenDiff}
            actions={(f) => (
              <button
                className="ws-git-act"
                title="Quitar del stage"
                onClick={(e) => {
                  e.stopPropagation()
                  unstage(f.path)
                }}
              >
                −
              </button>
            )}
          />
        )}

        <Section
          title="Cambios"
          count={st.unstaged.length}
          files={st.unstaged}
          activePath={activePath}
          onOpenDiff={onOpenDiff}
          headerAction={
            st.unstaged.length > 0 ? (
              <button className="ws-git-act" title="Stage todo" onClick={stageAll}>
                +
              </button>
            ) : null
          }
          actions={(f) => (
            <>
              <button
                className="ws-git-act"
                title="Descartar cambios"
                onClick={(e) => {
                  e.stopPropagation()
                  discard(f)
                }}
              >
                ↩
              </button>
              <button
                className="ws-git-act"
                title="Stage"
                onClick={(e) => {
                  e.stopPropagation()
                  stage(f.path)
                }}
              >
                +
              </button>
            </>
          )}
        />

        {total === 0 && <div className="ws-git-empty">Árbol de trabajo limpio</div>}
      </div>
    </aside>
  )
}

function Section({
  title,
  count,
  files,
  activePath,
  onOpenDiff,
  actions,
  headerAction,
}: {
  title: string
  count: number
  files: GitFile[]
  activePath: string
  onOpenDiff: (path: string) => void
  actions: (f: GitFile) => React.ReactNode
  headerAction?: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <>
      <div className="ws-git-section">
        <span>
          {title} · {count}
        </span>
        {headerAction}
      </div>
      {files.map((f) => {
        const name = f.path.split('/').pop()
        const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
        return (
          <div
            key={`${title}:${f.path}`}
            className={`ws-git-row ${f.path === activePath ? 'active' : ''}`}
            onClick={() => onOpenDiff(f.path)}
            title={`${LABEL[f.status] ?? f.status} — ver diff`}
          >
            <span className="ws-git-name">{name}</span>
            {dir && <span className="ws-git-dir">{dir}</span>}
            <span className="ws-git-actions">{actions(f)}</span>
            <span className="ws-git-badge" data-st={f.status}>
              {f.status}
            </span>
          </div>
        )
      })}
    </>
  )
}
