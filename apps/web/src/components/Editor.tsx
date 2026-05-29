import { useRef } from 'react'
import MonacoEditor, { type Monaco } from '@monaco-editor/react'

type Props = {
  path: string
  value: string
  language?: string
  onChange: (value: string) => void
  onSave: () => void
  onCursor?: (line: number, col: number) => void
}

// Tema Darcula (aprox. al de JetBrains/WebStorm).
export function defineDarcula(monaco: Monaco) {
  monaco.editor.defineTheme('darcula', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'a9b7c6', background: '2b2b2b' },
      { token: 'comment', foreground: '808080', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'cc7832' },
      { token: 'string', foreground: '6a8759' },
      { token: 'number', foreground: '6897bb' },
      { token: 'regexp', foreground: '6a8759' },
      { token: 'type', foreground: 'a9b7c6' },
      { token: 'type.identifier', foreground: 'a9b7c6' },
      { token: 'function', foreground: 'ffc66d' },
      { token: 'variable', foreground: 'a9b7c6' },
      { token: 'variable.predefined', foreground: '9876aa' },
      { token: 'tag', foreground: 'e8bf6a' },
      { token: 'attribute.name', foreground: 'bababa' },
      { token: 'attribute.value', foreground: '6a8759' },
      { token: 'delimiter', foreground: 'a9b7c6' },
    ],
    colors: {
      'editor.background': '#2b2b2b',
      'editor.foreground': '#a9b7c6',
      'editorLineNumber.foreground': '#606366',
      'editorLineNumber.activeForeground': '#a4a3a3',
      'editor.selectionBackground': '#214283',
      'editor.lineHighlightBackground': '#323232',
      'editor.lineHighlightBorder': '#00000000',
      'editorCursor.foreground': '#bbbbbb',
      'editorIndentGuide.background': '#3b3b3b',
      'editorIndentGuide.activeBackground': '#5a5a5a',
      'editorGutter.background': '#2b2b2b',
      'editorWhitespace.foreground': '#3b3b3b',
      'editorBracketMatch.background': '#3b514d',
      'editorBracketMatch.border': '#5b7672',
    },
  })
}

export function Editor({ path, value, language = 'typescript', onChange, onSave, onCursor }: Props) {
  const saveRef = useRef(onSave)
  saveRef.current = onSave

  return (
    <MonacoEditor
      height="100%"
      theme="darcula"
      path={path}
      language={language}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      beforeMount={defineDarcula}
      onMount={(editor, monaco) => {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current())
        editor.onDidChangeCursorPosition((e) =>
          onCursor?.(e.position.lineNumber, e.position.column),
        )
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
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontLigatures: true,
        fontSize: 13.5,
        lineHeight: 21,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        renderLineHighlight: 'line',
        guides: { indentation: true, bracketPairs: true },
        padding: { top: 8 },
        scrollbar: { verticalScrollbarSize: 11, horizontalScrollbarSize: 11 },
      }}
    />
  )
}
