import { useEffect, useRef, useState } from 'react'

type Workspace = {
  id: string
  name: string
  slug: string
  status: string // creating | building | running | error | stopped
  url: string | null
  createdAt: string
}

const STATUS: Record<string, string> = {
  creating: 'creando…',
  building: 'desplegando…',
  running: 'activo',
  error: 'error',
  stopped: 'detenido',
}

export function App() {
  const [items, setItems] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [del, setDel] = useState<Workspace | null>(null)

  const load = () =>
    fetch('/api/workspaces')
      .then((r) => r.json())
      .then((d) => setItems(d.workspaces ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))

  useEffect(() => {
    load()
    const iv = setInterval(load, 3000) // refresca estados (building → running)
    return () => clearInterval(iv)
  }, [])

  const remove = async () => {
    if (!del) return
    await fetch(`/api/workspaces/${encodeURIComponent(del.id)}`, { method: 'DELETE' })
    setDel(null)
    load()
  }

  return (
    <div className="console">
      <header className="head">
        <div className="wordmark">
          <span className="bolt">⚡</span>
          <span className="wm-main">workspaces</span>
          <span className="wm-sub">console</span>
        </div>
        <span className="head-meta">despliegue bajo demanda · Dokploy</span>
      </header>

      <div className="body">
        <div className="bar">
          <h1 className="title">
            Workspaces<sup className="count">{loading ? '··' : items.length}</sup>
          </h1>
          <button className="btn-new" onClick={() => setModal(true)}>
            <span className="plus">+</span> Nuevo workspace
          </button>
        </div>

        {loading ? (
          <p className="empty">Cargando…</p>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <p>No hay workspaces todavía.</p>
            <button className="btn-new" onClick={() => setModal(true)}>
              <span className="plus">+</span> Crear el primero
            </button>
          </div>
        ) : (
          <ul className="grid">
            {items.map((w, i) => {
              const deploying = w.status === 'creating' || w.status === 'building'
              return (
              <li
                key={w.id}
                className={`card${deploying ? ' deploying' : ''}`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="card-top">
                  <span className={`status ${w.status}`}>
                    <span className="dot" /> {STATUS[w.status] ?? w.status}
                  </span>
                  <button className="trash" title="Borrar" onClick={() => setDel(w)}>
                    ✕
                  </button>
                </div>
                <h2 className="card-name">{w.name}</h2>
                <code className="slug">/{w.slug}</code>
                <div className="card-foot">
                  {w.status === 'running' && w.url ? (
                    <a className="open" href={w.url} target="_blank" rel="noreferrer">
                      abrir ↗
                    </a>
                  ) : w.status === 'error' ? (
                    <span className="open error">error al desplegar</span>
                  ) : (
                    <span className="deploying-foot">
                      <span className="mini-spin" /> desplegando…
                    </span>
                  )}
                </div>
              </li>
              )
            })}
          </ul>
        )}
      </div>

      {modal && <CreateModal onClose={() => setModal(false)} onCreated={load} />}
      {del && (
        <Confirm
          name={del.name}
          onCancel={() => setDel(null)}
          onConfirm={remove}
        />
      )}
    </div>
  )
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'No se pudo crear')
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <span className="modal-tag">new_workspace</span>
          <button type="button" className="x" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>
        <label className="field">
          <span className="field-label">Nombre del workspace</span>
          <input
            ref={ref}
            value={name}
            disabled={busy}
            placeholder="p. ej. Demo de cliente"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p className="hint">Se desplegará un contenedor propio del editor en Dokploy.</p>
        {error && <div className="modal-error">⚠ {error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn-go" disabled={!name.trim() || busy}>
            {busy ? <span className="spinner" /> : 'Crear y desplegar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Confirm({
  name,
  onCancel,
  onConfirm,
}: {
  name: string
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="overlay" onClick={() => !busy && onCancel()}>
      <div className="modal danger" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-tag danger-tag">delete_workspace</span>
          <button className="x" onClick={onCancel} disabled={busy}>
            ✕
          </button>
        </div>
        <p className="confirm-msg">
          ¿Borrar <strong>{name}</strong>? Se eliminará su contenedor y datos en Dokploy.
        </p>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            className="btn-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await onConfirm()
            }}
          >
            {busy ? <span className="spinner" /> : 'Borrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
