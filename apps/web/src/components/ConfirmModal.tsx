import { useEffect, useState } from 'react'

type Props = {
  title: string
  message: React.ReactNode
  confirmLabel?: string
  onConfirm: () => Promise<void> | void
  onClose: () => void
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Borrar',
  onConfirm,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <div className="modal danger" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-tag danger-tag">{title}</span>
          <button className="x" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>
        <p className="confirm-msg">{message}</p>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn-danger" onClick={confirm} disabled={busy}>
            {busy ? <span className="spinner" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
