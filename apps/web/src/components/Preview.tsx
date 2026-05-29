/**
 * Muestra el PROYECTO independiente en un iframe que apunta a SU propio dev
 * server. El hot reload ocurre dentro de ese iframe (Vite del proyecto), de
 * forma totalmente desacoplada del editor.
 */
export function Preview({ url }: { url: string }) {
  if (!url) {
    return <div style={{ padding: 16, color: '#888' }}>Arrancando proyecto…</div>
  }
  return (
    <iframe
      title="preview"
      src={url}
      style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
    />
  )
}
