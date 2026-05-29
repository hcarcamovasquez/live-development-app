import { useEffect, useState } from 'react'

type GitFile = { path: string; status: string }

const LABEL: Record<string, string> = {
  M: 'modificado',
  A: 'añadido',
  D: 'borrado',
  R: 'renombrado',
  U: 'sin seguimiento',
}

/**
 * Panel Source Control (git): rama, mensaje + commit, y lista de cambios.
 * Clic en un archivo abre su diff (HEAD ↔ working) en el área de editor.
 */
export function GitPanel({
  project,
  activePath,
  onOpenDiff,
}: {
  project: string
  activePath: string
  onOpenDiff: (path: string) => void
}) {
  const [branch, setBranch] = useState('')
  const [files, setFiles] = useState<GitFile[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = () =>
    fetch(`/api/git/status?project=${encodeURIComponent(project)}`)
      .then((r) => r.json())
      .then((d) => {
        setBranch(d.branch ?? '')
        setFiles(d.files ?? [])
      })
      .catch(() => {})

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  const commit = async () => {
    if (!msg.trim() || busy) return
    setBusy(true)
    setNote('')
    try {
      const r = await (
        await fetch('/api/git/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project, message: msg }),
        })
      ).json()
      if (r.error) {
        setNote(r.error)
      } else {
        setMsg('')
        setNote(`✓ commit ${r.hash}`)
        load()
        setTimeout(() => setNote(''), 2500)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="ws-git">
      <div className="ws-tw-head">
        <span className="ws-tw-title">
          Source Control{branch && <span className="ws-git-branch"> ⎇ {branch}</span>}
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
          disabled={!msg.trim() || files.length === 0 || busy}
          onClick={commit}
        >
          {busy ? '…' : `✓ Commit${files.length ? ` (${files.length})` : ''}`}
        </button>
        {note && <div className="ws-git-note">{note}</div>}
      </div>

      <div className="ws-git-section">Cambios · {files.length}</div>
      <div className="ws-git-list">
        {files.length === 0 ? (
          <div className="ws-git-empty">Árbol de trabajo limpio</div>
        ) : (
          files.map((f) => {
            const name = f.path.split('/').pop()
            const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
            return (
              <div
                key={f.path}
                className={`ws-git-row ${f.path === activePath ? 'active' : ''}`}
                onClick={() => onOpenDiff(f.path)}
                title={`${LABEL[f.status] ?? f.status} — ver diff`}
              >
                <span className="ws-git-name">{name}</span>
                {dir && <span className="ws-git-dir">{dir}</span>}
                <span className="ws-git-badge" data-st={f.status}>
                  {f.status}
                </span>
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
