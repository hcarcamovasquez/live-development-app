import { useEffect, useRef, useState } from 'react'

type Project = {
  name: string
  slug: string
  createdAt: string
  running: boolean
  url: string | null
}

export function ProjectList({ onOpen }: { onOpen: (slug: string) => void }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)

  const load = () => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  return (
    <div className="console">
      <header className="console-head">
        <div className="wordmark">
          <span className="bolt">⚡</span>
          <span className="wm-main">live·dev</span>
          <span className="wm-sub">console</span>
        </div>
        <div className="head-meta">
          <span className="dot-live" /> servidor local · :3000
        </div>
      </header>

      <div className="console-body">
        <div className="section-bar">
          <h1 className="section-title">
            Proyectos
            <sup className="count">{loading ? '··' : projects.length}</sup>
          </h1>
          <button className="btn-new" onClick={() => setModal(true)}>
            <span className="plus">+</span> Nuevo proyecto
          </button>
        </div>

        {loading ? (
          <p className="empty">Cargando registro…</p>
        ) : projects.length === 0 ? (
          <EmptyState onNew={() => setModal(true)} />
        ) : (
          <ul className="grid">
            {projects.map((p, i) => (
              <li
                key={p.slug}
                className="card"
                style={{ animationDelay: `${i * 60}ms` }}
                onClick={() => onOpen(p.slug)}
              >
                <div className="card-top">
                  <span className={`status ${p.running ? 'on' : 'off'}`}>
                    <span className="status-dot" />
                    {p.running ? 'running' : 'idle'}
                  </span>
                  <span className="card-idx">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <h2 className="card-name">{p.name}</h2>
                <div className="card-foot">
                  <code className="slug">/{p.slug}</code>
                  <span className="created">{fmtDate(p.createdAt)}</span>
                </div>
                <span className="card-open">abrir →</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modal && (
        <CreateModal
          onClose={() => setModal(false)}
          onCreated={(slug) => onOpen(slug)}
        />
      )}
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="empty-state">
      <pre className="ascii">{`   ┌─────────────┐
   │   · · ·     │
   │             │
   └─────────────┘`}</pre>
      <p>No hay proyectos en el registro todavía.</p>
      <button className="btn-new" onClick={onNew}>
        <span className="plus">+</span> Crear el primero
      </button>
    </div>
  )
}

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (slug: string) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'No se pudo crear')
      onCreated(d.project.slug)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const preview = slugify(name)

  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <span className="modal-tag">new_project</span>
          <button type="button" className="x" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>

        <label className="field">
          <span className="field-label">Nombre del proyecto</span>
          <input
            ref={inputRef}
            value={name}
            disabled={busy}
            placeholder="p. ej. Tablero de control"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="path-preview">
          se guardará en{' '}
          <code>~/.live-development-app/projects/{preview || '…'}</code>
        </div>

        {error && <div className="modal-error">⚠ {error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn-go" disabled={!name.trim() || busy}>
            {busy ? (
              <>
                <span className="spinner" /> Creando · pnpm install…
              </>
            ) : (
              'Crear proyecto'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}
