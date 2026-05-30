import { useRef, useEffect, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'

const TOOL_LABELS: Record<string, string> = {
  read_file: '📄 Leyendo',
  write_file: '✏️ Escribiendo',
  list_directory: '📁 Listando',
  delete_file: '🗑 Borrando',
  run_app: '▶ Iniciando app',
  stop_app: '■ Deteniendo app',
  app_status: '○ Estado',
  git_status: '⎇ Estado git',
  git_commit: '✓ Commit',
}

function storeKey(project: string) {
  return `ide.aichat.${project}`
}
function loadHistory(project: string): UIMessage[] {
  try {
    const raw = localStorage.getItem(storeKey(project))
    const arr = raw ? JSON.parse(raw) : null
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function AIChat({ project, onClose }: { project: string; onClose: () => void }) {
  const [draft, setDraft] = useState('')

  const { messages, sendMessage, status, error, setMessages } = useChat({
    // Restaura la conversación persistida del proyecto (sobrevive cierre del
    // panel y recargas del navegador).
    messages: loadHistory(project),
    transport: new DefaultChatTransport({
      api: '/api/agent/chat',
      body: { project },
    }),
  })

  const isLoading = status === 'streaming' || status === 'submitted'
  const bottomRef = useRef<HTMLDivElement>(null)

  // Persiste la conversación por proyecto en cada cambio.
  useEffect(() => {
    try {
      localStorage.setItem(storeKey(project), JSON.stringify(messages))
    } catch {
      /* noop */
    }
  }, [messages, project])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  const submit = () => {
    const text = draft.trim()
    if (!text || isLoading) return
    sendMessage({ role: 'user', parts: [{ type: 'text', text }] })
    setDraft('')
  }

  const clearChat = () => {
    setMessages([])
    try { localStorage.removeItem(storeKey(project)) } catch { /* noop */ }
  }

  // El último mensaje es del asistente y aún no tiene contenido visible → "pensando".
  const last = messages[messages.length - 1]
  const lastHasContent =
    last?.role === 'assistant' &&
    last.parts.some((p) => (p.type === 'text' && p.text) || p.type.startsWith('tool-') || p.type === 'dynamic-tool')
  const showThinking = isLoading && (!last || last.role === 'user' || !lastHasContent)

  return (
    <div className="ws-ai-chat">
      <div className="ws-term-head">
        <span className="ws-term-fixed">✦ AI</span>
        <span className="ws-spacer" />
        {messages.length > 0 && (
          <button className="ws-icon-btn" title="Nueva conversación" onClick={clearChat}>⟳</button>
        )}
        <button className="ws-icon-btn" title="Ocultar" onClick={onClose}>✕</button>
      </div>

      <div className="ws-ai-messages">
        {messages.length === 0 && !isLoading && (
          <div className="ws-ai-empty">
            ✦ ¿En qué puedo ayudarte con <strong>{project}</strong>?
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`ws-ai-msg ws-ai-${m.role}`}>
            {m.parts.map((part, i) => {
              if (part.type === 'text') {
                if (!part.text) return null
                return (
                  <div key={i} className={`ws-ai-bubble ws-ai-${m.role}-bubble`}>
                    <MarkdownText text={part.text} />
                  </div>
                )
              }
              // Tool-calls: en v6 el tipo es `tool-<nombre>` (estático) o 'dynamic-tool'.
              const isTool = part.type.startsWith('tool-') || part.type === 'dynamic-tool'
              if (isTool) {
                const anyPart = part as {
                  type: string
                  toolName?: string
                  state?: string
                  input?: Record<string, unknown>
                }
                const name = anyPart.toolName ?? part.type.replace(/^tool-/, '')
                const label = TOOL_LABELS[name] ?? `⚙ ${name}`
                const input = anyPart.input
                const detail = input?.path ?? input?.dir ?? input?.message ?? ''
                const done = anyPart.state === 'output-available' || anyPart.state === 'output-error'
                return (
                  <div key={i} className={`ws-ai-tool ${done ? 'done' : 'running'}`}>
                    <span className="ws-ai-tool-label">{label}</span>
                    {detail ? <code className="ws-ai-tool-detail">{String(detail)}</code> : null}
                    {!done && <span className="ws-ai-tool-spin" />}
                  </div>
                )
              }
              return null
            })}
          </div>
        ))}

        {showThinking && (
          <div className="ws-ai-msg ws-ai-assistant">
            <div className="ws-ai-bubble ws-ai-assistant-bubble ws-ai-thinking">
              <span className="ws-ai-dot-1" /><span className="ws-ai-dot-2" /><span className="ws-ai-dot-3" />
            </div>
          </div>
        )}

        {error && (
          <div className="ws-ai-error">⚠ {error.message || 'Error al contactar el modelo'}</div>
        )}

        <div ref={bottomRef} />
      </div>

      <form className="ws-ai-form" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <textarea
          className="ws-ai-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Describe qué quieres hacer… (Enter para enviar)"
          rows={2}
          disabled={isLoading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
          }}
        />
        <button type="submit" className="ws-ai-send" disabled={isLoading || !draft.trim()} title="Enviar">
          {isLoading ? <span className="ws-ai-tool-spin" /> : '↑'}
        </button>
      </form>
    </div>
  )
}

function MarkdownText({ text }: { text: string }) {
  if (!text) return null
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return (
    <span className="ws-ai-text">
      {parts.map((p, i) => {
        if (p.startsWith('```') && p.endsWith('```')) {
          const inner = p.slice(3, -3).replace(/^[a-z]+\n/, '')
          return <pre key={i} className="ws-ai-code-block"><code>{inner}</code></pre>
        }
        if (p.startsWith('`') && p.endsWith('`')) {
          return <code key={i} className="ws-ai-inline-code">{p.slice(1, -1)}</code>
        }
        if (p.startsWith('**') && p.endsWith('**')) {
          return <strong key={i}>{p.slice(2, -2)}</strong>
        }
        if (p.startsWith('*') && p.endsWith('*')) {
          return <em key={i}>{p.slice(1, -1)}</em>
        }
        return <span key={i}>{p}</span>
      })}
    </span>
  )
}
