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

export function AIChat({ project, onClose }: { project: string; onClose: () => void }) {
  const [draft, setDraft] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(true)

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/agent/chat',
      body: { project },
    }),
  })

  const isLoading = status === 'streaming' || status === 'submitted'
  const bottomRef = useRef<HTMLDivElement>(null)

  // Carga el historial persistido en el server (SQLite del workspace): sobrevive
  // recargas, cierre del panel y cambios de navegador/dispositivo.
  useEffect(() => {
    let cancelled = false
    setLoadingHistory(true)
    fetch(`/api/agent/history?project=${encodeURIComponent(project)}`)
      .then((r) => r.json())
      .then((data: { messages?: UIMessage[] }) => {
        if (!cancelled && Array.isArray(data.messages)) setMessages(data.messages)
      })
      .catch(() => { /* sin historial */ })
      .finally(() => { if (!cancelled) setLoadingHistory(false) })
    return () => { cancelled = true }
  }, [project, setMessages])

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
    fetch(`/api/agent/history?project=${encodeURIComponent(project)}`, { method: 'DELETE' })
      .catch(() => { /* noop */ })
  }

  // Indicador "trabajando…". Gemini entrega cada tool-call (p. ej. write_file con
  // todo el contenido del archivo) SOLO cuando termina de generarlo: durante esos
  // segundos no hay ningún paso con spinner y la UI parecería congelada. Mostramos
  // los puntos siempre que esté cargando y NO haya ya un paso activo (con su propio
  // spinner) ni texto streameando en la cola.
  const last = messages[messages.length - 1]
  const lastParts = last?.role === 'assistant' ? last.parts : []
  const toolRunning = lastParts.some((p) => {
    const isTool = p.type.startsWith('tool-') || p.type === 'dynamic-tool'
    const state = (p as { state?: string }).state
    return isTool && state !== 'output-available' && state !== 'output-error'
  })
  const tail = lastParts[lastParts.length - 1]
  const tailTextStreaming = tail?.type === 'text' && !!(tail as { text?: string }).text
  const showThinking = isLoading && !toolRunning && !tailTextStreaming

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
        {messages.length === 0 && !isLoading && !loadingHistory && (
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
                const failed = anyPart.state === 'output-error'
                const done = anyPart.state === 'output-available' || failed
                return (
                  <div key={i} className={`ws-ai-tool ${done ? 'done' : 'running'}${failed ? ' failed' : ''}`}>
                    <span className="ws-ai-tool-icon">{!done ? <span className="ws-ai-tool-spin" /> : failed ? '✕' : '✓'}</span>
                    <span className="ws-ai-tool-label">{label}</span>
                    {detail ? <code className="ws-ai-tool-detail">{String(detail)}</code> : null}
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
