import { useRef, useEffect, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

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

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/agent/chat',
      body: { project },
    }),
  })

  const isLoading = status === 'streaming' || status === 'submitted'
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const submit = () => {
    const text = draft.trim()
    if (!text || isLoading) return
    sendMessage({ role: 'user', parts: [{ type: 'text', text }] })
    setDraft('')
  }

  return (
    <div className="ws-ai-chat">
      <div className="ws-term-head">
        <span className="ws-term-fixed">✦ AI</span>
        <span className="ws-spacer" />
        <button className="ws-icon-btn" title="Ocultar" onClick={onClose}>✕</button>
      </div>

      <div className="ws-ai-messages">
        {messages.length === 0 && (
          <div className="ws-ai-empty">
            ✦ ¿En qué puedo ayudarte con <strong>{project}</strong>?
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`ws-ai-msg ws-ai-${m.role}`}>
            {m.parts.map((part, i) => {
              if (part.type === 'text') {
                return (
                  <div key={i} className={`ws-ai-bubble ws-ai-${m.role}-bubble`}>
                    <MarkdownText text={part.text} />
                  </div>
                )
              }
              if (part.type === 'dynamic-tool') {
                const label = TOOL_LABELS[part.toolName] ?? `⚙ ${part.toolName}`
                const input = part.input as Record<string, unknown> | undefined
                const detail = input?.path ?? input?.dir ?? input?.message ?? ''
                const done = part.state === 'output-available'
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

        {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
          <div className="ws-ai-msg ws-ai-assistant">
            <div className="ws-ai-bubble ws-ai-assistant-bubble ws-ai-thinking">
              <span className="ws-ai-dot-1" /><span className="ws-ai-dot-2" /><span className="ws-ai-dot-3" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        className="ws-ai-form"
        onSubmit={(e) => { e.preventDefault(); submit() }}
      >
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
        <button
          type="submit"
          className="ws-ai-send"
          disabled={isLoading || !draft.trim()}
          title="Enviar"
        >
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
