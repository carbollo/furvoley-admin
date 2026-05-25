'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { HermesChatPanel } from '@/components/crm/HermesChatPanel'

type HermesTab = 'config' | 'chat'

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
  gateway: { status: string; pid: number | null; message?: string; logTail?: string }
  whatsapp: {
    status: string
    hasQr?: boolean
    bridgeHealthy?: boolean
    bridgeConnectionState?: string | null
    bridgePort?: number
  }
  apiServer?: {
    healthy?: boolean
    port?: number
    hasKey?: boolean
    chatReady?: boolean
  }
}

type BusyAction = 'save' | 'restart' | 'reconnect' | 'mcp' | null
type BannerKind = 'success' | 'error' | 'info'

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

function applySettingsToForm(j: HermesSettingsView, setters: {
  setEnabled: (v: boolean) => void
  setOllamaModel: (v: string) => void
  setWhatsappMode: (v: 'bot' | 'self-chat') => void
  setAllowedUsersText: (v: string) => void
  setAllowDestructive: (v: boolean) => void
}) {
  setters.setEnabled(Boolean(j.enabled))
  setters.setOllamaModel(j.ollamaModel || 'gpt-oss:120b')
  setters.setWhatsappMode(j.whatsappMode === 'self-chat' ? 'self-chat' : 'bot')
  setters.setAllowedUsersText(Array.isArray(j.allowedUsers) ? j.allowedUsers.join(', ') : '')
  setters.setAllowDestructive(Boolean(j.allowDestructive))
}

function whatsappStatusLabel(status?: string) {
  switch (status) {
    case 'CONNECTED':
      return 'Conectado (bridge activo)'
    case 'SESSION_PAIRED':
      return 'Emparejado — bridge sin responder'
    case 'QR_PENDING':
      return 'Esperando escaneo QR'
    case 'PAIRING':
      return 'Emparejando…'
    case 'DISCONNECTED':
      return 'Desconectado'
    default:
      return status || '—'
  }
}

function StepCheck({ done, label }: { done: boolean; label: string }) {
  return (
    <li style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5 }}>
      <span style={{ color: done ? '#15803d' : 'var(--text-secondary)', fontWeight: 700, minWidth: 18 }}>
        {done ? '✓' : '○'}
      </span>
      <span style={{ color: done ? 'var(--text-primary, inherit)' : 'var(--text-secondary)' }}>{label}</span>
    </li>
  )
}

export function HermesAgentSection() {
  const [data, setData] = useState<HermesSettingsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<BusyAction>(null)
  const [banner, setBanner] = useState<{ kind: BannerKind; text: string } | null>(null)
  const [copyToast, setCopyToast] = useState(false)
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [qrHint, setQrHint] = useState<string | null>(null)

  const [enabled, setEnabled] = useState(false)
  const [ollamaApiKey, setOllamaApiKey] = useState('')
  const [ollamaModel, setOllamaModel] = useState('gpt-oss:120b')
  const [whatsappMode, setWhatsappMode] = useState<'bot' | 'self-chat'>('bot')
  const [allowedUsersText, setAllowedUsersText] = useState('')
  const [allowDestructive, setAllowDestructive] = useState(false)
  const [activeTab, setActiveTab] = useState<HermesTab>('config')

  const formDirtyRef = useRef(false)
  const [isDirty, setIsDirty] = useState(false)

  const busy = busyAction !== null

  const syncFormFromServer = useCallback((j: HermesSettingsView) => {
    applySettingsToForm(j, {
      setEnabled,
      setOllamaModel,
      setWhatsappMode,
      setAllowedUsersText,
      setAllowDestructive,
    })
    formDirtyRef.current = false
    setIsDirty(false)
  }, [])

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/hermes/settings', { credentials: 'include' })
      const j = (await r.json()) as HermesSettingsView & { error?: string }
      if (!r.ok) throw new Error(j.error || 'No se pudo cargar Hermes')
      setData(j)
      if (!formDirtyRef.current) syncFormFromServer(j)
    } catch (e) {
      setBanner({ kind: 'error', text: e instanceof Error ? e.message : 'Error al cargar' })
    } finally {
      setLoading(false)
    }
  }, [syncFormFromServer])

  const refreshLiveStatus = useCallback(async () => {
    try {
      const [statusR, qrR] = await Promise.all([
        fetch('/api/hermes/status', { credentials: 'include' }),
        fetch('/api/hermes/whatsapp/qr', { credentials: 'include' }),
      ])
      const statusJ = statusR.ok ? await statusR.json() : null
      const qrJ = qrR.ok ? await qrR.json() : null

      if (statusJ?.gateway || statusJ?.whatsapp || statusJ?.apiServer) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                gateway: statusJ.gateway ?? prev.gateway,
                whatsapp: statusJ.whatsapp ?? prev.whatsapp,
                apiServer: statusJ.apiServer ?? prev.apiServer,
              }
            : prev,
        )
      }

      if (qrJ?.qrImage) {
        setQrImage(qrJ.qrImage)
        setQrHint(null)
      } else if (qrJ?.connected || statusJ?.whatsapp?.status === 'CONNECTED') {
        setQrImage(null)
        setQrHint(null)
      } else if (statusJ?.whatsapp?.status === 'SESSION_PAIRED') {
        setQrImage(null)
        setQrHint(
          'Sesión WhatsApp guardada, pero el bridge no responde. Pulsa Guardar configuración o Reiniciar gateway.',
        )
      } else if (typeof qrJ?.hint === 'string') {
        setQrHint(qrJ.hint)
      }
    } catch {
      //
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (!data?.enabled) return

    void refreshLiveStatus()

    const gatewayDone = data.gateway?.status === 'running'
    const whatsappDone = data.whatsapp?.status === 'CONNECTED'
    const intervalMs = gatewayDone && whatsappDone ? 15000 : 4000

    const t = window.setInterval(() => {
      void refreshLiveStatus()
    }, intervalMs)

    return () => window.clearInterval(t)
  }, [data?.enabled, data?.gateway?.status, data?.whatsapp?.status, refreshLiveStatus])

  function markDirty() {
    formDirtyRef.current = true
    setIsDirty(true)
  }

  function showBanner(kind: BannerKind, text: string) {
    setBanner({ kind, text })
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    setBusyAction('save')
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
      formDirtyRef.current = false
      setIsDirty(false)

      if (j.settings) {
        setData(j.settings)
        syncFormFromServer(j.settings)
      } else {
        await loadSettings()
      }

      if (j.generatedMcpKey) {
        setFreshKey(j.generatedMcpKey)
        showBanner('success', 'Configuración guardada. Se generó una clave MCP automáticamente.')
      } else if (j.gatewayResult?.pending) {
        showBanner(
          'info',
          j.gatewayResult.message ||
            'Configuración guardada. Reiniciando gateway en segundo plano…',
        )
      } else if (j.gatewayResult?.ok === false) {
        showBanner('error', j.gatewayResult.error || 'Guardado, pero el gateway no arrancó.')
      } else if (j.gatewayResult?.apiServerReady === false) {
        showBanner(
          'error',
          j.gatewayResult.error ||
            'Guardado y gateway en ejecución, pero el API Server del chat no responde. Pulsa Reiniciar gateway.',
        )
      } else {
        showBanner('success', 'Configuración guardada. Espera el QR si aún no está conectado.')
      }

      await refreshLiveStatus()
    } catch (e) {
      showBanner('error', e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setBusyAction(null)
    }
  }

  async function regenerateKey() {
    if (!confirm('¿Generar una nueva clave MCP? Hermes se reiniciará si está activo.')) return
    setBusyAction('mcp')
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
      showBanner('success', 'Nueva clave MCP generada.')
      await loadSettings()
    } catch (e) {
      showBanner('error', e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyAction(null)
    }
  }

  async function reconnectWhatsapp() {
    setBusyAction('reconnect')
    try {
      const r = await fetch('/api/hermes/whatsapp/reconnect', {
        method: 'POST',
        credentials: 'include',
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo reconectar WhatsApp')
      showBanner('info', 'Hermes reiniciado. Escanea el nuevo QR si aparece.')
      await refreshLiveStatus()
    } catch (e) {
      showBanner('error', e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyAction(null)
    }
  }

  async function restartGateway() {
    setBusyAction('restart')
    try {
      const r = await fetch('/api/hermes/gateway/restart', {
        method: 'POST',
        credentials: 'include',
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo reiniciar el gateway')
      showBanner(
        'info',
        j.message || 'Reiniciando gateway… El chat estará listo en unos segundos.',
      )
      if (j.status) {
        setData((prev) => (prev ? { ...prev, gateway: j.status } : prev))
      }
      await refreshLiveStatus()
    } catch (e) {
      showBanner('error', e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyAction(null)
    }
  }

  function handleCopyUrl() {
    if (!data?.mcpUrl) return
    copyText(data.mcpUrl)
    setCopyToast(true)
    window.setTimeout(() => setCopyToast(false), 2000)
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

  const bannerColors: Record<BannerKind, { bg: string; border: string; text: string }> = {
    success: { bg: 'rgba(21,128,61,0.1)', border: 'rgba(21,128,61,0.35)', text: '#15803d' },
    error: { bg: 'rgba(185,28,28,0.08)', border: 'rgba(185,28,28,0.35)', text: '#b91c1c' },
    info: { bg: 'rgba(234,179,8,0.1)', border: 'rgba(234,179,8,0.35)', text: '#a16207' },
  }

  const saveButtonStyle = {
    padding: '12px 24px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    cursor: busy ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap' as const,
  }

  const stickySaveBar = (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 5,
        marginTop: 8,
        padding: '14px 20px',
        background: 'var(--surface-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          Guardar en base de datos
        </p>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 12,
            color: isDirty ? '#a16207' : 'var(--text-secondary)',
          }}
        >
          {isDirty
            ? 'Tienes cambios sin guardar. Pulsa Guardar para aplicarlos y reiniciar Hermes si está activo.'
            : 'La configuración actual está guardada de forma persistente.'}
        </p>
      </div>
      <button type="submit" disabled={busy} style={saveButtonStyle}>
        {busyAction === 'save' ? 'Guardando…' : 'Guardar configuración'}
      </button>
    </div>
  )

  const chatAvailable = Boolean(data?.enabled && data?.gateway?.status === 'running')
  const chatReady = Boolean(data?.apiServer?.chatReady)

  const setupDone = {
    mcp: Boolean(data?.hasMcpKey),
    ollama: Boolean(data?.hasOllamaKey),
    phones: Boolean(data?.allowedUsers?.length),
    gateway: data?.gateway?.status === 'running',
    whatsapp: data?.whatsapp?.status === 'CONNECTED',
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface)', width: '100%', minHeight: 0 }}>
      <div style={{ padding: '28px 32px 56px', maxWidth: 920 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>
          Hermes Agent
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
          Controla el CRM con Ollama Cloud por WhatsApp o chat web. Configura todo aquí; no hace falta consola.
          ApiWass sigue siendo el canal hacia socios.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 16,
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              { id: 'config' as const, label: 'Configuración' },
              { id: 'chat' as const, label: 'Chat' },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.id
            const disabled = tab.id === 'chat' && !chatAvailable
            return (
              <button
                key={tab.id}
                type="button"
                disabled={disabled}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                  background: isActive ? 'var(--accent)' : 'var(--surface)',
                  color: isActive ? '#fff' : 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {banner ? (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 10,
            border: `1px solid ${bannerColors[banner.kind].border}`,
            background: bannerColors[banner.kind].bg,
            color: bannerColors[banner.kind].text,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {banner.text}
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Cargando…</p>
      ) : activeTab === 'chat' ? (
        <HermesChatPanel
          enabled={Boolean(data?.enabled)}
          gatewayRunning={data?.gateway?.status === 'running'}
          chatReady={chatReady}
          onRestartGateway={() => void restartGateway()}
        />
      ) : (
        <form onSubmit={saveSettings} style={{ display: 'grid', gap: 16 }}>
          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Configuración en 5 pasos</h2>
            <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
              <StepCheck done={setupDone.mcp} label="Clave MCP (se genera sola al guardar si falta)" />
              <StepCheck
                done={setupDone.ollama}
                label="Ollama Cloud: API key en ollama.com/settings/keys + modelo (p. ej. gpt-oss:120b)"
              />
              <StepCheck done={setupDone.phones} label="Tu teléfono admin sin + (ej. 34600111222)" />
              <StepCheck
                done={whatsappMode === 'self-chat' || whatsappMode === 'bot'}
                label="Modo WhatsApp: Self-chat (pruebas contigo mismo) o Bot (número dedicado con QR en ese móvil)"
              />
              <StepCheck
                done={setupDone.gateway && setupDone.whatsapp}
                label="Activar + Guardar → gateway running → escanear QR → probar: «¿Cuántos socios activos hay?»"
              />
            </ol>
            <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <strong>Self-chat:</strong> escaneas el QR con tu WhatsApp y te escribes a ti mismo.{' '}
              <strong>Bot:</strong> necesitas un segundo móvil/línea; el QR se escanea en ese teléfono y ese número
              recibe tus órdenes al CRM.
            </p>
          </div>

          {stickySaveBar}

          <div style={cardStyle}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => {
                  markDirty()
                  setEnabled(e.target.checked)
                }}
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
              <div style={{ margin: '8px 0 0' }}>
                <p style={{ fontSize: 12, color: '#b91c1c', lineHeight: 1.4, margin: 0 }}>
                  {data.gateway.message}
                </p>
                {data.gateway.logTail ? (
                  <pre
                    style={{
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 8,
                      background: '#0f172a',
                      color: '#e2e8f0',
                      fontSize: 11,
                      lineHeight: 1.45,
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {data.gateway.logTail}
                  </pre>
                ) : null}
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, marginBottom: 0 }}>
                  Prueba: pulsa «Guardar configuración» y luego «Reiniciar gateway».
                </p>
              </div>
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
              {busyAction === 'restart' ? 'Reiniciando…' : 'Reiniciar gateway'}
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
              onChange={(e) => {
                markDirty()
                setOllamaApiKey(e.target.value)
              }}
              placeholder="Pega tu OLLAMA_API_KEY (ollama.com/settings/keys)"
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            <label style={labelStyle}>Modelo</label>
            <input
              type="text"
              value={ollamaModel}
              onChange={(e) => {
                markDirty()
                setOllamaModel(e.target.value)
              }}
              placeholder="gpt-oss:120b"
              style={inputStyle}
            />
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 14px', fontSize: 16 }}>WhatsApp admin (Hermes)</h2>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-secondary)' }}>
              Estado: <strong>{whatsappStatusLabel(data?.whatsapp?.status)}</strong>
            </p>
            {data?.whatsapp?.bridgePort ? (
              <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
                Bridge puerto {data.whatsapp.bridgePort}
                {data.whatsapp.bridgeConnectionState
                  ? ` · socket ${data.whatsapp.bridgeConnectionState}`
                  : ''}
              </p>
            ) : null}
            {whatsappMode === 'self-chat' ? (
              <p
                style={{
                  margin: '0 0 12px',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                Modo <strong>self-chat</strong>: escribe en WhatsApp en el chat{' '}
                <strong>«Mensajes a ti mismo»</strong> (o «Tú»), no en un chat normal contigo. Tras guardar,
                reinicia el gateway si el estado queda en «Emparejado — bridge sin responder».
              </p>
            ) : null}
            <label style={labelStyle}>Teléfonos permitidos (sin +, separados por coma)</label>
            <input
              type="text"
              value={allowedUsersText}
              onChange={(e) => {
                markDirty()
                setAllowedUsersText(e.target.value)
              }}
              placeholder="34600111222, 34600999888"
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            <label style={labelStyle}>Modo</label>
            <select
              value={whatsappMode}
              onChange={(e) => {
                markDirty()
                setWhatsappMode(e.target.value as 'bot' | 'self-chat')
              }}
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
              <p style={{ fontSize: 13, color: '#15803d', marginBottom: 12 }}>
                WhatsApp listo. Envía un mensaje{whatsappMode === 'self-chat' ? ' en «Mensajes a ti mismo»' : ''}.
              </p>
            ) : data?.whatsapp?.status === 'SESSION_PAIRED' ? (
              <p style={{ fontSize: 13, color: '#b45309', marginBottom: 12 }}>
                Hay sesión emparejada pero Hermes no recibe mensajes. Guarda de nuevo y pulsa «Reiniciar gateway» arriba.
              </p>
            ) : qrHint ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{qrHint}</p>
            ) : data?.whatsapp?.status === 'PAIRING' || data?.whatsapp?.status === 'QR_PENDING' ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Generando QR… puede tardar 10–30 s tras guardar. Mantén el gateway en running.
              </p>
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
              {busyAction === 'reconnect' ? 'Reconectando…' : 'Reconectar WhatsApp'}
            </button>
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>MCP Furvoley</h2>
            <label style={labelStyle}>URL</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <code style={{ ...inputStyle, flex: 1, wordBreak: 'break-all' }}>{data?.mcpUrl || '—'}</code>
              <button
                type="button"
                disabled={!data?.mcpUrl || busy}
                onClick={handleCopyUrl}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  cursor: 'pointer',
                }}
              >
                {copyToast ? 'Copiado' : 'Copiar'}
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
              {busyAction === 'mcp' ? 'Generando…' : 'Regenerar clave MCP'}
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
                onChange={(e) => {
                  markDirty()
                  setAllowDestructive(e.target.checked)
                }}
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

          {stickySaveBar}
        </form>
      )}
      </div>
    </div>
  )
}
