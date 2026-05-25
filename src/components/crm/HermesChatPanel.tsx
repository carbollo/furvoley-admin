'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'furvoley-hermes-chat'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type ChatStatus = {
  chatReady?: boolean
  gatewayRunning?: boolean
  apiServerHealthy?: boolean
  hasApiServerKey?: boolean
  enabled?: boolean
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function loadStoredMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChatMessage[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (m) =>
        m &&
        typeof m.id === 'string' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string',
    )
  } catch {
    return []
  }
}

function persistMessages(messages: ChatMessage[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  } catch {
    //
  }
}

function parseSseDelta(line: string): string | null {
  if (!line.startsWith('data:')) return null
  const payload = line.slice(5).trim()
  if (!payload || payload === '[DONE]') return null
  try {
    const json = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string } }>
    }
    const chunk = json.choices?.[0]?.delta?.content
    return typeof chunk === 'string' ? chunk : null
  } catch {
    return null
  }
}

type HermesChatPanelProps = {
  chatReady: boolean
  enabled: boolean
  gatewayRunning: boolean
  onRestartGateway?: () => void
}

export function HermesChatPanel({
  chatReady,
  enabled,
  gatewayRunning,
  onRestartGateway,
}: HermesChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<ChatStatus>({})
  const listRef = useRef<HTMLDivElement>(null)
  const hydratedRef = useRef(false)

  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    setMessages(loadStoredMessages())
  }, [])

  useEffect(() => {
    if (!hydratedRef.current) return
    persistMessages(messages)
  }, [messages])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/hermes/chat/status', { credentials: 'include' })
      if (!r.ok) return
      const j = (await r.json()) as ChatStatus & {
        chatReady?: boolean
        gatewayRunning?: boolean
        apiServerHealthy?: boolean
        enabled?: boolean
      }
      setStatus(j)
    } catch {
      //
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    const t = window.setInterval(() => void refreshStatus(), 8000)
    return () => window.clearInterval(t)
  }, [refreshStatus])

  const ready = chatReady || Boolean(status.chatReady)

  function clearConversation() {
    setMessages([])
    setError(null)
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      //
    }
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || sending) return

    setError(null)
    setSending(true)
    setInput('')

    const userMessage: ChatMessage = { id: newId(), role: 'user', content: text }
    const assistantId = newId()
    const history = [...messages, userMessage]
    setMessages([...history, { id: assistantId, role: 'assistant', content: '' }])

    try {
      const payload = history.map((m) => ({ role: m.role, content: m.content }))
      const r = await fetch('/api/hermes/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload, stream: true }),
      })

      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || 'No se pudo enviar el mensaje')
      }

      const reader = r.body?.getReader()
      if (!reader) throw new Error('Respuesta sin stream')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const delta = parseSseDelta(line.trim())
          if (!delta) continue
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + delta } : m,
            ),
          )
        }
      }

      setMessages((prev) => {
        const last = prev.find((m) => m.id === assistantId)
        if (last && !last.content.trim()) {
          return prev.filter((m) => m.id !== assistantId)
        }
        return prev
      })
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== assistantId))
      setError(e instanceof Error ? e.message : 'Error al chatear con Hermes')
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  const cardStyle = {
    border: '1px solid var(--border)',
    borderRadius: 12,
    background: 'var(--surface-low)',
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: 420,
    overflow: 'hidden',
  }

  return (
    <div style={cardStyle}>
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Chat con Hermes</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
            Mismo agente que WhatsApp · historial solo en esta sesión del navegador
          </p>
        </div>
        <button
          type="button"
          onClick={clearConversation}
          disabled={sending || messages.length === 0}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            cursor: sending || messages.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          Nueva conversación
        </button>
      </div>

      {!enabled ? (
        <div style={{ padding: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
          Activa Hermes en la pestaña Configuración para usar el chat.
        </div>
      ) : !gatewayRunning ? (
        <div style={{ padding: 20, fontSize: 13, color: '#b45309' }}>
          El gateway no está en ejecución. Guarda la configuración o reinicia el gateway en Configuración.
        </div>
      ) : !ready ? (
        <div style={{ padding: 20, fontSize: 13, color: '#b45309', lineHeight: 1.6 }}>
          {status.hasApiServerKey === false
            ? 'Falta la clave del API Server. Ve a Configuración, pulsa Guardar configuración y reinicia el gateway.'
            : 'El API Server de Hermes no responde. Guarda la configuración y reinicia el gateway para activar el chat web.'}
          {onRestartGateway ? (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={onRestartGateway}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  cursor: 'pointer',
                }}
              >
                Reiniciar gateway
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              maxHeight: 'min(60vh, 520px)',
            }}
          >
            {messages.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Pregunta algo sobre el CRM, por ejemplo: «¿Cuántos socios activos hay?» o «Busca al socio
                García».
              </p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: 12,
                    background:
                      m.role === 'user'
                        ? 'var(--accent)'
                        : 'var(--surface)',
                    color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                    border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                    fontSize: 13,
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.content || (sending && m.role === 'assistant' ? 'Hermes está pensando…' : '')}
                </div>
              ))
            )}
          </div>

          {error ? (
            <p style={{ margin: '0 16px', fontSize: 12, color: '#b91c1c' }}>{error}</p>
          ) : null}

          <div
            style={{
              padding: 16,
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-end',
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              placeholder="Escribe a Hermes… (Enter envía, Shift+Enter nueva línea)"
              rows={2}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                fontFamily: 'inherit',
                fontSize: 13,
                resize: 'vertical',
                minHeight: 44,
              }}
            />
            <button
              type="button"
              disabled={sending || !input.trim()}
              onClick={() => void sendMessage()}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontWeight: 700,
                cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {sending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
