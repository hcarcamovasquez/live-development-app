import { useRef } from 'react'
import MonacoEditor from '@monaco-editor/react'

type Props = {
  /** Ruta del archivo: Monaco mantiene un modelo (undo/cursor) por ruta. */
  path: string
  value: string
  language?: string
  onChange: (value: string) => void
  onSave: () => void
}

export function Editor({ path, value, language = 'typescript', onChange, onSave }: Props) {
  // Ref para que el atajo Ctrl/Cmd+S siempre llame al onSave más reciente.
  const saveRef = useRef(onSave)
  saveRef.current = onSave

  return (
    <MonacoEditor
      height="100%"
      theme="vs-dark"
      path={path}
      language={language}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={(editor, monaco) => {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current())
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: true,
          noSyntaxValidation: false,
        })
        monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
          jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
          target: monaco.languages.typescript.ScriptTarget.ESNext,
          allowNonTsExtensions: true,
        })
      }}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
      }}
    />
  )
}
