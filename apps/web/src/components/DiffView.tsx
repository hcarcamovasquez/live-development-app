import { DiffEditor } from '@monaco-editor/react'
import { defineDarcula } from './Editor'
import { langOf } from './fileMeta'

/**
 * Vista de diff (HEAD ↔ working) con el DiffEditor de Monaco, tema Darcula.
 */
export function DiffView({
  path,
  original,
  modified,
  onClose,
}: {
  path: string
  original: string
  modified: string
  onClose: () => void
}) {
  return (
    <div className="ws-diff">
      <div className="ws-diff-head">
        <span className="ws-diff-icon">±</span>
        <span className="ws-diff-title">{path}</span>
        <span className="ws-diff-sub">HEAD ↔ Working</span>
        <span className="ws-spacer" />
        <button className="ws-icon-btn" title="Cerrar diff" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="ws-diff-body">
        <DiffEditor
          height="100%"
          theme="darcula"
          original={original}
          modified={modified}
          language={langOf(path)}
          beforeMount={defineDarcula}
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 13,
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  )
}
