'use client'

import { useCallback, useEffect, useState } from 'react'

type HermesSettingsView = {
  enabled: boolean
  mcpUrl: string
  hasMcpKey: boolean
  mcpApiKeySource: string
  mcpApiKeyMasked: string
  ollamaModel: string
  ollamaApiKeyMasked: string
  hasOllamaKey: boolean
  whatsappMode: 'bot' | 'self-chat'
  allowedUsers: string[]
  allowDestructive: boolean
  gateway: { status: string; pid: number | null; message?: string }
  whatsapp: { status: string; hasQr?: boolean }
}

function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text)
    return
  }
  const el = document.createElement('textarea')
  el.value = text
  document.body.appendChild(el)
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
}

export function HermesAgentSection() {
  const [data, setData] = useState<HermesSettingsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)

  const [enabled, setEnabled] = useState(false)
  const [ollamaApiKey, setOllamaApiKey] = useState('')
  const [ollamaModel, setOllamaModel] = useState('gpt-oss:120b')
  const [whatsappMode, setWhatsappMode] = useState<'bot' | 'self-chat'>('bot')
  const [allowedUsersText, setAllowedUsersText] = useState('')
  const [allowDestructive, setAllowDestructive] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/hermes/settings', { credentials: 'include' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo cargar Hermes')
      setData(j)
      setEnabled(Boolean(j.enabled))
      setOllamaModel(j.ollamaModel || 'gpt-oss:120b')
      setWhatsappMode(j.whatsappMode === 'self-chat' ? 'self-chat' : 'bot')
      setAllowedUsersText(Array.isArray(j.allowedUsers) ? j.allowedUsers.join(', ') : '')
      setAllowDestructive(Boolean(j.allowDestructive))
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadQr = useCallback(async () => {
    try {
      const r = await fetch('/api/hermes/whatsapp/qr', { credentials: 'include' })
      const j = await r.json()
      if (r.ok && j.qrImage) setQrImage(j.qrImage)
      else if (j.connected) setQrImage(null)
    } catch {
      //
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!data?.enabled) return
    void loadQr()
    const t = window.setInterval(() => {
      void load()
      void loadQr()
    }, 4000)
    return () => window.clearInterval(t)
  }, [data?.enabled, load, loadQr])

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const body: Record<string, unknown> = {
        enabled,
        ollamaModel: ollamaModel.trim(),
        whatsappMode,
        allowedUsers: allowedUsersText
          .split(/[,;\s]+/)
          .map((p) => p.replace(/[^\d+]/g, '').replace(/^\+/, ''))
          .filter(Boolean),
        allowDestructive,
      }
      if (ollamaApiKey.trim()) body.ollamaApiKey = ollamaApiKey.trim()

      const r = await fetch('/api/hermes/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar')
      setOllamaApiKey('')
      setMessage(j.gatewayResult?.ok === false ? j.gatewayResult.error : 'Configuración guardada.')
      await load()
      await loadQr()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setBusy(false)
    }
  }

  async function regenerateKey() {
    if (!confirm('¿Generar una nueva clave MCP? Actualiza Hermes tras regenerar.')) return
    setBusy(true)
    setFreshKey(null)
    try {
      const r = await fetch('/api/hermes/settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate_key' }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo regenerar')
      setFreshKey(j.apiKey)
      setMessage('Nueva clave MCP generada.')
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function reconnectWhatsapp() {
    setBusy(true)
    try {
      const r = await fetch('/api/hermes/whatsapp/reconnect', {
        method: 'POST',
        credentials: 'include',
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo reconectar WhatsApp')
      setMessage('Hermes reiniciado. Escanea el nuevo QR si aparece.')
      await load()
      await loadQr()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function restartGateway() {
    setBusy(true)
    try {
      const r = await fetch('/api/hermes/gateway/restart', {
        method: 'POST',
        credentials: 'include',
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo reiniciar el gateway')
      setMessage('Gateway reiniciado.')
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  const cardStyle = {
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 20,
    background: 'var(--surface-low)',
  } as const

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    fontFamily: 'inherit',
    fontSize: 13,
  } as const

  const labelStyle = {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-secondary)',
    display: 'block',
    marginBottom: 6,
  } as const

  return (
    <div style={{ padding: '28px 32px', maxWidth: 920 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>
          Hermes Agent
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
          Controla el CRM por WhatsApp con Ollama Cloud. Configura todo aquí; no hace falta consola.
          ApiWass sigue siendo el canal hacia socios.
        </p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Cargando…</p>
      ) : (
        <form onSubmit={saveSettings} style={{ display: 'grid', gap: 16 }}>
          <div style={cardStyle}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span style={{ fontWeight: 700 }}>Activar Hermes Agent</span>
            </label>
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Gateway:{' '}
              <strong
                style={{
                  color:
                    data?.gateway?.status === 'running'
                      ? '#15803d'
                      : data?.gateway?.status === 'error'
                        ? '#b91c1c'
                        : undefined,
                }}
              >
                {data?.gateway?.status || '—'}
              </strong>
              {data?.gateway?.pid ? ` (PID ${data.gateway.pid})` : ''}
            </p>
            {data?.gateway?.message ? (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#b91c1c', lineHeight: 1.4 }}>
                {data.gateway.message}
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void restartGateway()}
              style={{
                marginTop: 10,
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              Reiniciar gateway
            </button>
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 14px', fontSize: 16 }}>Ollama Cloud</h2>
            <label style={labelStyle}>
              API key {data?.ollamaApiKeyMasked ? `(${data.ollamaApiKeyMasked})` : ''}
            </label>
            <input
              type="password"
              value={ollamaApiKey}
              onChange={(e) => setOllamaApiKey(e.target.value)}
              placeholder="Pega tu OLLAMA_API_KEY (ollama.com/settings/keys)"
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            <label style={labelStyle}>Modelo</label>
            <input
              type="text"
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              placeholder="gpt-oss:120b"
              style={inputStyle}
            />
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 14px', fontSize: 16 }}>WhatsApp admin (Hermes)</h2>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
              Estado: <strong>{data?.whatsapp?.status || '—'}</strong>
            </p>
            <label style={labelStyle}>Teléfonos permitidos (sin +, separados por coma)</label>
            <input
              type="text"
              value={allowedUsersText}
              onChange={(e) => setAllowedUsersText(e.target.value)}
              placeholder="34600111222, 34600999888"
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            <label style={labelStyle}>Modo</label>
            <select
              value={whatsappMode}
              onChange={(e) => setWhatsappMode(e.target.value as 'bot' | 'self-chat')}
              style={{ ...inputStyle, marginBottom: 12 }}
            >
              <option value="bot">Bot (número dedicado)</option>
              <option value="self-chat">Self-chat (mensajes a ti mismo)</option>
            </select>
            {qrImage ? (
              <div style={{ marginBottom: 12 }}>
                <img src={qrImage} alt="QR WhatsApp Hermes" style={{ maxWidth: 280, borderRadius: 8 }} />
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                  Escanea con WhatsApp → Dispositivos vinculados. El QR se actualiza solo.
                </p>
              </div>
            ) : data?.whatsapp?.status === 'CONNECTED' ? (
              <p style={{ fontSize: 13, color: '#15803d', marginBottom: 12 }}>WhatsApp conectado.</p>
            ) : enabled ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Guarda la configuración y espera el QR (puede tardar unos segundos tras arrancar el gateway).
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void reconnectWhatsapp()}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              Reconectar WhatsApp
            </button>
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>MCP Furvoley</h2>
            <label style={labelStyle}>URL</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <code style={{ ...inputStyle, flex: 1, wordBreak: 'break-all' }}>{data?.mcpUrl || '—'}</code>
              <button
                type="button"
                disabled={!data?.mcpUrl}
                onClick={() => data?.mcpUrl && copyText(data.mcpUrl)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  cursor: 'pointer',
                }}
              >
                Copiar
              </button>
            </div>
            <label style={labelStyle}>Clave MCP ({data?.mcpApiKeyMasked || '—'})</label>
            <button
              type="button"
              disabled={busy || data?.mcpApiKeySource === 'env'}
              onClick={() => void regenerateKey()}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              Regenerar clave MCP
            </button>
            {freshKey ? (
              <code
                style={{
                  display: 'block',
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 8,
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontSize: 12,
                  wordBreak: 'break-all',
                }}
              >
                {freshKey}
              </code>
            ) : null}
          </div>

          <div style={cardStyle}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allowDestructive}
                onChange={(e) => setAllowDestructive(e.target.checked)}
              />
              <span>Permitir tools destructivos (borrar socios/cobros)</span>
            </label>
          </div>

          <div style={{ ...cardStyle, borderColor: 'rgba(234,179,8,0.35)' }}>
            <strong>ApiWass ≠ Hermes WhatsApp</strong>
            <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              La pestaña WhatsApp (ApiWass) sigue enviando avisos a socios. Hermes usa su propio QR solo
              para que el admin controle el CRM.
            </p>
          </div>

          <button
            type="submit"
            disabled={busy}
            style={{
              padding: '12px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              cursor: busy ? 'not-allowed' : 'pointer',
              justifySelf: 'start',
            }}
          >
            {busy ? 'Guardando…' : 'Guardar configuración'}
          </button>

          {message ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>{message}</p>
          ) : null}
        </form>
      )}
    </div>
  )
}
