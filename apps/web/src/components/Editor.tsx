import MonacoEditor from '@monaco-editor/react'

type Props = {
  value: string
  language?: string
  onChange: (value: string) => void
  onSave: () => void
}

export function Editor({ value, language = 'typescript', onChange, onSave }: Props) {
  return (
    <MonacoEditor
      height="100%"
      theme="vs-dark"
      language={language}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={(editor, monaco) => {
        // Ctrl/Cmd + S -> guardar (dispara el hot reload en el servidor).
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, onSave)
        // TSX sin que Monaco marque errores de tipos en la PoC.
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
