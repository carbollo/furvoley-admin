'use client'

import { useCallback, useEffect, useState } from 'react'

type HermesHealth = {
  enabled: boolean
  mcpUrl: string
  hasApiKey: boolean
  apiKeySource: string
  apiKeyMasked: string
  destructiveAllowed: boolean
  allowedUsers: string[]
  envHints?: {
    HERMES_ENABLED: boolean
    DEEPSEEK_API_KEY: boolean
    WHATSAPP_ENABLED: boolean
  }
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
  const [health, setHealth] = useState<HermesHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [freshKey, setFreshKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/hermes/settings', { credentials: 'include' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo cargar Hermes')
      setHealth(j)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function regenerateKey() {
    if (!confirm('¿Generar una nueva API key MCP? Actualiza Hermes con la nueva clave.')) return
    setBusy(true)
    setMessage(null)
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
      setMessage('Nueva clave generada. Cópiala ahora; no se volverá a mostrar completa.')
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

  return (
    <div style={{ padding: '28px 32px', maxWidth: 920 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>
          Hermes Agent
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
          Controla el CRM por WhatsApp con DeepSeek y Hermes. Este canal es independiente de ApiWass
          (que sigue usándose para avisos a socios y flujos automáticos).
        </p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Cargando estado…</p>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  background: health?.enabled ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)',
                  color: health?.enabled ? '#15803d' : '#b91c1c',
                }}
              >
                {health?.enabled ? 'HERMES_ENABLED' : 'Desactivado'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                MCP {health?.hasApiKey ? 'configurado' : 'sin clave'} · origen {health?.apiKeySource}
              </span>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                URL MCP
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <code
                  style={{
                    flex: 1,
                    minWidth: 240,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    fontSize: 13,
                    wordBreak: 'break-all',
                  }}
                >
                  {health?.mcpUrl || '—'}
                </code>
                <button
                  type="button"
                  disabled={!health?.mcpUrl}
                  onClick={() => health?.mcpUrl && copyText(health.mcpUrl)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Copiar URL
                </button>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                API key ({health?.apiKeyMasked || '—'})
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={busy || health?.apiKeySource === 'env'}
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
                {health?.apiKeySource === 'env' ? (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>
                    La clave viene de HERMES_MCP_API_KEY en Railway.
                  </span>
                ) : null}
              </div>
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
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Guía rápida</h2>
            <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              <li>Define <code>HERMES_ENABLED=true</code> y <code>HERMES_MCP_API_KEY</code> en Railway.</li>
              <li>En el servicio Hermes: <code>DEEPSEEK_API_KEY</code>, <code>FURVOLEY_MCP_URL</code> y teléfonos en <code>WHATSAPP_ALLOWED_USERS</code>.</li>
              <li>Ejecuta <code>hermes setup</code> → elige DeepSeek → <code>hermes whatsapp</code> → escanea QR → <code>hermes gateway</code>.</li>
              <li>Prueba: «¿Cuántos socios activos hay?» o «Crea un cobro de 30€ a Juan Pérez».</li>
            </ol>
          </div>

          <div style={{ ...cardStyle, borderColor: 'rgba(234,179,8,0.35)' }}>
            <strong>ApiWass ≠ Hermes WhatsApp</strong>
            <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              ApiWass (pestaña WhatsApp) sigue siendo el canal operativo hacia socios. Hermes usa su
              propio número Baileys solo para que el admin controle el CRM conversando con el agente.
            </p>
          </div>

          {health?.allowedUsers?.length ? (
            <div style={cardStyle}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                Teléfonos admin permitidos (WHATSAPP_ALLOWED_USERS)
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {health.allowedUsers.map((p) => (
                  <span
                    key={p}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      fontSize: 13,
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {message ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{message}</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
