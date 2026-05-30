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
  list_components: '🧩 Secciones',
  get_style: '🎨 Estilo',
}

// Catálogo de secciones de una landing. label = lo que ve el usuario,
// name = nombre del componente/archivo (PascalCase ASCII).
const SECTIONS: { label: string; name: string }[] = [
  { label: 'Hero', name: 'Hero' },
  { label: 'Navbar', name: 'Navbar' },
  { label: 'Features', name: 'Features' },
  { label: 'Pricing', name: 'Pricing' },
  { label: 'Testimonios', name: 'Testimonials' },
  { label: 'CTA', name: 'CTA' },
  { label: 'Footer', name: 'Footer' },
  { label: 'FAQ', name: 'FAQ' },
  { label: 'Stats', name: 'Stats' },
  { label: 'Logos', name: 'Logos' },
]

type Preset = { id: string; label: string; description: string; tokens: Record<string, string> }
type FontPair = { id: string; label: string }
type StyleConfig = { preset: string | null; tweak: string; accent: string | null; fontPair: string | null }

const DEFAULT_STYLE: StyleConfig = { preset: null, tweak: '', accent: null, fontPair: null }

export function AIChat({
  project,
  onClose,
  onPreviewReload,
}: {
  project: string
  onClose: () => void
  onPreviewReload?: () => void
}) {
  const [draft, setDraft] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(true)

  // Estilo (design system) del proyecto + catálogo de presets para el selector.
  const [style, setStyle] = useState<StyleConfig>(DEFAULT_STYLE)
  const [presets, setPresets] = useState<Preset[]>([])
  const [fontPairs, setFontPairs] = useState<FontPair[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/agent/chat',
      body: { project },
    }),
  })

  const isLoading = status === 'streaming' || status === 'submitted'
  const bottomRef = useRef<HTMLDivElement>(null)

  // Carga el historial persistido en el server (SQLite del workspace) UNA SOLA VEZ
  // por proyecto. Importante: NO depender de `setMessages` (useChat devuelve una
  // identidad nueva en cada render); si el efecto se re-ejecutara durante el
  // streaming haría fetch del historial aún-no-guardado y machacaría los mensajes
  // en vivo. El guard por ref evita cualquier re-ejecución.
  const historyLoadedFor = useRef<string | null>(null)
  useEffect(() => {
    if (historyLoadedFor.current === project) return
    historyLoadedFor.current = project
    setLoadingHistory(true)
    fetch(`/api/agent/history?project=${encodeURIComponent(project)}`)
      .then((r) => r.json())
      .then((data: { messages?: UIMessage[] }) => {
        if (Array.isArray(data.messages)) setMessages(data.messages)
      })
      .catch(() => { /* sin historial */ })
      .finally(() => setLoadingHistory(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  // Carga el estilo actual + presets disponibles.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/agent/style?project=${encodeURIComponent(project)}`)
      .then((r) => r.json())
      .then((data: { style?: StyleConfig; presets?: Preset[]; fontPairs?: FontPair[] }) => {
        if (cancelled) return
        if (data.style) setStyle({ ...DEFAULT_STYLE, ...data.style })
        if (Array.isArray(data.presets)) setPresets(data.presets)
        if (Array.isArray(data.fontPairs)) setFontPairs(data.fontPairs)
      })
      .catch(() => { /* sin estilo */ })
    return () => { cancelled = true }
  }, [project])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  const submit = () => {
    const text = draft.trim()
    if (!text || isLoading) return
    sendMessage({ role: 'user', parts: [{ type: 'text', text }] })
    setDraft('')
  }

  // Chip de sección → pide al agente generar/actualizar ese componente.
  const createSection = (s: { label: string; name: string }) => {
    if (isLoading) return
    const text =
      `Crea o actualiza la sección **${s.label}** de la landing siguiendo el estilo del ` +
      `proyecto. Debe ser el archivo src/components/${s.name}.tsx con export default, ` +
      `autocontenido y usando las variables CSS del design system.`
    sendMessage({ role: 'user', parts: [{ type: 'text', text }] })
  }

  const clearChat = () => {
    setMessages([])
    fetch(`/api/agent/history?project=${encodeURIComponent(project)}`, { method: 'DELETE' })
      .catch(() => { /* noop */ })
  }

  const applyStyle = async (next: StyleConfig) => {
    setStyle(next)
    setPickerOpen(false)
    try {
      await fetch('/api/agent/style', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project, ...next }),
      })
      onPreviewReload?.()
    } catch {
      /* noop */
    }
  }

  const currentPreset = presets.find((p) => p.id === style.preset)
  const styleLabel = currentPreset ? currentPreset.label : 'Sin estilo'

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
        <button
          className={`ws-ai-style-badge${currentPreset ? ' on' : ''}`}
          title="Elegir el estilo de la librería"
          onClick={() => setPickerOpen(true)}
        >
          🎨 {styleLabel}
        </button>
        <span className="ws-spacer" />
        {messages.length > 0 && (
          <button className="ws-icon-btn" title="Nueva conversación" onClick={clearChat}>⟳</button>
        )}
        <button className="ws-icon-btn" title="Ocultar" onClick={onClose}>✕</button>
      </div>

      <div className="ws-ai-messages">
        {messages.length === 0 && !isLoading && !loadingHistory && (
          <div className="ws-ai-empty">
            ✦ Librería de componentes de <strong>{project}</strong>.<br />
            {currentPreset
              ? <>Estilo <strong>{currentPreset.label}</strong>. Elige una sección para generarla:</>
              : <>Primero elige un <strong>estilo</strong> (🎨 arriba); luego una sección:</>}
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

      {/* Catálogo de secciones */}
      <div className="ws-ai-chips" role="group" aria-label="Secciones de landing">
        {SECTIONS.map((s) => (
          <button
            key={s.name}
            className="ws-ai-chip"
            disabled={isLoading}
            title={`Generar sección ${s.label}`}
            onClick={() => createSection(s)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <form className="ws-ai-form" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <textarea
          className="ws-ai-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Describe una sección o un ajuste… (Enter para enviar)"
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

      {pickerOpen && (
        <StylePicker
          presets={presets}
          fontPairs={fontPairs}
          current={style}
          onApply={applyStyle}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

function StylePicker({
  presets,
  fontPairs,
  current,
  onApply,
  onClose,
}: {
  presets: Preset[]
  fontPairs: FontPair[]
  current: StyleConfig
  onApply: (s: StyleConfig) => void
  onClose: () => void
}) {
  const [preset, setPreset] = useState<string | null>(current.preset)
  const [accent, setAccent] = useState<string>(current.accent ?? '')
  const [fontPair, setFontPair] = useState<string>(current.fontPair ?? '')
  const [tweak, setTweak] = useState<string>(current.tweak ?? '')

  const apply = () =>
    onApply({
      preset,
      accent: accent.trim() ? accent.trim() : null,
      fontPair: fontPair || null,
      tweak: tweak.trim(),
    })

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal ws-style-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Estilo de la librería</span>
          <button className="ws-icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="ws-style-grid">
          {presets.map((p) => {
            const bg = p.tokens['color-bg'] || '#111'
            const ac = p.tokens['color-accent'] || '#888'
            const tx = p.tokens['color-text'] || '#eee'
            return (
              <button
                key={p.id}
                className={`ws-style-card${preset === p.id ? ' sel' : ''}`}
                onClick={() => setPreset(p.id)}
                title={p.description}
              >
                <span className="ws-style-swatch" style={{ background: bg }}>
                  <span style={{ background: ac }} />
                  <span style={{ background: tx }} />
                </span>
                <span className="ws-style-name">{p.label}</span>
              </button>
            )
          })}
        </div>

        <div className="ws-style-row">
          <label className="ws-style-field">
            <span>Acento (opcional)</span>
            <span className="ws-style-accent">
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : '#888888'}
                onChange={(e) => setAccent(e.target.value)}
              />
              <input
                type="text"
                placeholder="#hex"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
              />
            </span>
          </label>

          <label className="ws-style-field">
            <span>Tipografía (opcional)</span>
            <select value={fontPair} onChange={(e) => setFontPair(e.target.value)}>
              <option value="">Según el preset</option>
              {fontPairs.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="ws-style-field">
          <span>Ajuste libre (opcional)</span>
          <textarea
            className="ws-style-tweak"
            rows={2}
            placeholder="p. ej. más minimalista, esquinas redondeadas, tono cálido…"
            value={tweak}
            onChange={(e) => setTweak(e.target.value)}
          />
        </label>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-go" onClick={apply}>Aplicar estilo</button>
        </div>
      </div>
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
