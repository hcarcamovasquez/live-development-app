/**
 * Tool window de preview con chrome de navegador (estilo IDE): barra de URL,
 * recargar y abrir en pestaña nueva. El iframe apunta al dev server propio del
 * proyecto; el hot reload ocurre dentro de él.
 */
export function Preview({
  url,
  nonce,
  onReload,
}: {
  url: string
  nonce: number
  onReload: () => void
}) {
  return (
    <div className="ws-preview">
      <div className="ws-browser-bar">
        <button className="ws-icon-btn" title="Recargar" onClick={onReload} disabled={!url}>
          ⟳
        </button>
        <div className="ws-url">
          <span className={`ws-conn ${url ? 'up' : ''}`} />
          {url || 'arrancando dev server…'}
        </div>
        <a
          className="ws-icon-btn"
          title="Abrir en pestaña nueva"
          href={url || '#'}
          target="_blank"
          rel="noreferrer"
        >
          ↗
        </a>
      </div>
      <div className="ws-preview-frame">
        {url ? (
          <iframe key={nonce} title="preview" src={url} />
        ) : (
          <div className="ws-preview-empty">
            App detenida — pulsa <b>▶ Run</b> en la terminal <b>App</b> para arrancarla.
          </div>
        )}
      </div>
    </div>
  )
}
