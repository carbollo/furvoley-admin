'use client'

import { useCallback, useEffect, useState } from 'react'
import { PaymentReminderButton } from './PaymentReminderButton'

type Plan = {
  id: string
  name: string
  description: string | null
  amount: number
  billingPeriod: string
  billingPeriodLabel: string
  enrollmentFee: number
  paymentRequiredOnEnrollment: boolean
  isActive: boolean
  subscriptionCount: number
}

type SubscriptionRow = {
  id: string
  status: string
  memberId: string
  memberName: string
  memberEmail: string | null
  planName: string
  planAmount: number
  billingPeriodLabel: string
  nextInvoiceDate: string
  autoPay: boolean
  paymentRequiredOnEnrollment: boolean
}

type BundleSocio = { id: string; nombre: string; estado?: string }

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const PERIOD_OPTIONS = [
  { value: 'MONTHLY', label: 'Mensual' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'YEARLY', label: 'Anual' },
]

export function CuotasSection({
  bundle,
  reload,
  fmtMoney,
  showAlert,
  showConfirm,
}: {
  bundle: Record<string, unknown> | null
  reload: () => Promise<unknown>
  fmtMoney: (n: number) => string
  showAlert: (message: string) => void
  showConfirm: (message: string) => Promise<boolean>
}) {
  const socios = (bundle?.socios as BundleSocio[]) ?? []
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'planes' | 'asignaciones'>('planes')
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([])
  const [stats, setStats] = useState({ activePlans: 0, activeSubscriptions: 0 })
  const [busy, setBusy] = useState(false)
  const [generateBusy, setGenerateBusy] = useState(false)

  const [planModal, setPlanModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [planForm, setPlanForm] = useState({
    name: '',
    description: '',
    amount: '',
    billingPeriod: 'MONTHLY',
    enrollmentFee: '0',
    paymentRequiredOnEnrollment: false,
    isActive: true,
  })

  const [assignModal, setAssignModal] = useState(false)
  const [assignForm, setAssignForm] = useState({
    memberId: '',
    planId: '',
    startDate: '',
    autoPay: false,
    paymentRequiredOnEnrollment: false,
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/crm/membership-plans', { credentials: 'include', cache: 'no-store' })
      if (!r.ok) throw new Error('No se pudieron cargar los planes')
      const j = await r.json()
      setPlans(j.plans ?? [])
      setSubscriptions(j.subscriptions ?? [])
      setStats(j.stats ?? { activePlans: 0, activeSubscriptions: 0 })
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Error de carga')
    } finally {
      setLoading(false)
    }
  }, [showAlert])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const activePlans = plans.filter((p) => p.isActive)

  function planPaymentRequiredDefault(planId: string) {
    return activePlans.find((p) => p.id === planId)?.paymentRequiredOnEnrollment ?? false
  }

  function openNewPlan() {
    setEditingPlan(null)
    setPlanForm({
      name: '',
      description: '',
      amount: '',
      billingPeriod: 'MONTHLY',
      enrollmentFee: '0',
      paymentRequiredOnEnrollment: false,
      isActive: true,
    })
    setPlanModal(true)
  }

  function openEditPlan(p: Plan) {
    setEditingPlan(p)
    setPlanForm({
      name: p.name,
      description: p.description || '',
      amount: String(p.amount),
      billingPeriod: p.billingPeriod,
      enrollmentFee: String(p.enrollmentFee),
      paymentRequiredOnEnrollment: p.paymentRequiredOnEnrollment,
      isActive: p.isActive,
    })
    setPlanModal(true)
  }

  async function savePlan(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const payload = {
        name: planForm.name.trim(),
        description: planForm.description.trim() || undefined,
        amount: Number(planForm.amount),
        billingPeriod: planForm.billingPeriod,
        enrollmentFee: Number(planForm.enrollmentFee) || 0,
        paymentRequiredOnEnrollment: planForm.paymentRequiredOnEnrollment,
        isActive: planForm.isActive,
      }
      const r = editingPlan
        ? await fetch('/api/crm/membership-plans', {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingPlan.id, ...payload }),
          })
        : await fetch('/api/crm/membership-plans', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || 'No se pudo guardar el plan')
        return
      }
      setPlanModal(false)
      await loadData()
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function removePlan(p: Plan) {
    const ok = await showConfirm(
      p.subscriptionCount > 0
        ? `¿Desactivar el plan «${p.name}»? Tiene ${p.subscriptionCount} suscripción(es) vinculada(s).`
        : `¿Eliminar el plan «${p.name}»?`,
    )
    if (!ok) return
    setBusy(true)
    try {
      const r = await fetch(`/api/crm/membership-plans/${p.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || 'No se pudo eliminar')
        return
      }
      await loadData()
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function assignCuota(e: React.FormEvent) {
    e.preventDefault()
    if (!assignForm.memberId || !assignForm.planId) {
      showAlert('Selecciona socio y plan')
      return
    }
    const paymentRequired = assignForm.paymentRequiredOnEnrollment
    setBusy(true)
    try {
      const r = await fetch('/api/crm/subscriptions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: assignForm.memberId,
          planId: assignForm.planId,
          startDate: assignForm.startDate || undefined,
          autoPay: assignForm.autoPay,
          paymentRequiredOnEnrollment: assignForm.paymentRequiredOnEnrollment,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || 'No se pudo asignar la cuota')
        return
      }
      setAssignModal(false)
      setAssignForm({
        memberId: '',
        planId: '',
        startDate: '',
        autoPay: false,
        paymentRequiredOnEnrollment: false,
      })
      await loadData()
      await reload()
      showAlert(
        paymentRequired
          ? 'Cuota asignada. El socio queda en «Alta pendiente de pago» hasta que pague la primera factura.'
          : 'Cuota asignada. Se ha generado la primera factura del periodo.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function setSubscriptionStatus(id: string, status: string, label: string) {
    const ok = await showConfirm(`¿${label} esta suscripción?`)
    if (!ok) return
    setBusy(true)
    try {
      const r = await fetch(`/api/crm/subscriptions/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || 'No se pudo actualizar')
        return
      }
      await loadData()
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function emitirCuotasPendientes() {
    const ok = await showConfirm(
      '¿Emitir facturas de todas las suscripciones con periodo vencido? Se crearán las cuotas pendientes.',
    )
    if (!ok) return
    setGenerateBusy(true)
    try {
      const r = await fetch('/api/crm/billing/generate-due', {
        method: 'POST',
        credentials: 'include',
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || 'No se pudieron emitir las cuotas')
        return
      }
      await reload()
      showAlert(
        j.createdCount > 0
          ? `Se han emitido ${j.createdCount} factura(s) nueva(s). Revisa Contabilidad.`
          : 'No había cuotas pendientes de emitir en este momento.',
      )
    } finally {
      setGenerateBusy(false)
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface)' }}>
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '32px 40px 56px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.02em', margin: 0 }}>
              Gestión de cuotas
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 6, margin: 0 }}>
              Planes de membresía, asignación a socios y emisión periódica de facturas
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <PaymentReminderButton />
            <button
              type="button"
              disabled={generateBusy}
              onClick={() => void emitirCuotasPendientes()}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: '#fff',
                cursor: generateBusy ? 'wait' : 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              {generateBusy ? 'Emitiendo…' : 'Emitir cuotas pendientes'}
            </button>
            <button
              type="button"
              onClick={() => {
                const firstPlanId = activePlans[0]?.id || ''
                setAssignForm({
                  memberId: '',
                  planId: firstPlanId,
                  startDate: new Date().toISOString().slice(0, 10),
                  autoPay: false,
                  paymentRequiredOnEnrollment: planPaymentRequiredDefault(firstPlanId),
                })
                setAssignModal(true)
              }}
              disabled={activePlans.length === 0}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                cursor: activePlans.length === 0 ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                opacity: activePlans.length === 0 ? 0.5 : 1,
              }}
            >
              Asignar cuota a socio
            </button>
            <button
              type="button"
              onClick={openNewPlan}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--accent-pill)',
                color: 'var(--accent)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              + Nuevo plan
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div
            style={{
              flex: '1 1 180px',
              padding: 20,
              borderRadius: 14,
              background: 'var(--surface-card)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Planes activos</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
              {stats.activePlans}
            </div>
          </div>
          <div
            style={{
              flex: '1 1 180px',
              padding: 20,
              borderRadius: 14,
              background: 'var(--surface-card)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Socios con cuota</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
              {stats.activeSubscriptions}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          {(['planes', 'asignaciones'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: '10px 18px',
                border: 'none',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                background: 'transparent',
                color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: tab === t ? 700 : 500,
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginBottom: -1,
              }}
            >
              {t === 'planes' ? 'Planes de cuota' : 'Socios con cuota'}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
        ) : tab === 'planes' ? (
          <div
            style={{
              background: 'var(--surface-card)',
              borderRadius: 14,
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}
          >
            {plans.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                No hay planes. Crea el primero con «Nuevo plan» (p. ej. Cuota senior, Cuota juvenil).
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                    {['Plan', 'Importe', 'Periodicidad', 'Matrícula', 'Pago al alta', 'Socios', 'Estado', ''].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '14px 20px',
                          textAlign: 'left',
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--text-muted)',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                        {p.description ? (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{p.description}</div>
                        ) : null}
                      </td>
                      <td style={{ padding: '16px 20px', fontWeight: 700 }}>{fmtMoney(p.amount)}</td>
                      <td style={{ padding: '16px 20px', fontSize: 14 }}>{p.billingPeriodLabel}</td>
                      <td style={{ padding: '16px 20px', fontSize: 14 }}>
                        {p.enrollmentFee > 0 ? fmtMoney(p.enrollmentFee) : '—'}
                      </td>
                      <td style={{ padding: '16px 20px', fontSize: 13 }}>
                        {p.paymentRequiredOnEnrollment ? (
                          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>Obligatorio</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Opcional</span>
                        )}
                      </td>
                      <td style={{ padding: '16px 20px', fontSize: 14 }}>{p.subscriptionCount}</td>
                      <td style={{ padding: '16px 20px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: p.isActive ? 'var(--green-soft)' : 'var(--surface-low)',
                            color: p.isActive ? 'var(--green)' : 'var(--text-muted)',
                          }}
                        >
                          {p.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => openEditPlan(p)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: '1px solid var(--border)',
                              background: '#fff',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600,
                              fontFamily: 'inherit',
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removePlan(p)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: '1px solid #fecaca',
                              background: '#fff',
                              color: '#b91c1c',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600,
                              fontFamily: 'inherit',
                            }}
                          >
                            {p.isActive ? 'Desactivar' : 'Eliminar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div
            style={{
              background: 'var(--surface-card)',
              borderRadius: 14,
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}
          >
            {subscriptions.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                Ningún socio tiene cuota asignada. Usa «Asignar cuota a socio».
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                    {['Socio', 'Plan', 'Importe', 'Pago al alta', 'Próxima factura', 'Estado', ''].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '14px 20px',
                          textAlign: 'left',
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--text-muted)',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{s.memberName}</div>
                        {s.memberEmail ? (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.memberEmail}</div>
                        ) : null}
                      </td>
                      <td style={{ padding: '16px 20px', fontSize: 14 }}>{s.planName}</td>
                      <td style={{ padding: '16px 20px', fontWeight: 700 }}>
                        {fmtMoney(s.planAmount)} / {s.billingPeriodLabel.toLowerCase()}
                      </td>
                      <td style={{ padding: '16px 20px', fontSize: 13 }}>
                        {s.paymentRequiredOnEnrollment ? (
                          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>Obligatorio</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Opcional</span>
                        )}
                      </td>
                      <td style={{ padding: '16px 20px', fontSize: 14 }}>
                        {new Date(s.nextInvoiceDate).toLocaleDateString('es-ES')}
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '4px 10px',
                            borderRadius: 999,
                            background:
                              s.status === 'ACTIVE' ? 'var(--green-soft)' : 'var(--amber-soft, #fef3c7)',
                            color: s.status === 'ACTIVE' ? 'var(--green)' : '#b45309',
                          }}
                        >
                          {s.status === 'ACTIVE' ? 'Activa' : s.status === 'PAUSED' ? 'Pausada' : s.status}
                        </span>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        {s.status === 'ACTIVE' ? (
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void setSubscriptionStatus(s.id, 'PAUSED', 'Pausar')}
                              style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: '#fff',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 600,
                                fontFamily: 'inherit',
                              }}
                            >
                              Pausar
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void setSubscriptionStatus(s.id, 'CANCELED', 'Cancelar')}
                              style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                border: '1px solid #fecaca',
                                background: '#fff',
                                color: '#b91c1c',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 600,
                                fontFamily: 'inherit',
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : s.status === 'PAUSED' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void setSubscriptionStatus(s.id, 'ACTIVE', 'Reactivar')}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: 'none',
                              background: 'var(--accent)',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600,
                              fontFamily: 'inherit',
                            }}
                          >
                            Reactivar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
          Los cobros y facturas emitidas aparecen en <strong>Contabilidad</strong>. El cron automático usa{' '}
          <code style={{ fontSize: 11 }}>POST /api/jobs/billing</code> en producción.
        </p>
      </div>

      {planModal && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 500,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setPlanModal(false)
          }}
        >
          <form
            onSubmit={(e) => void savePlan(e)}
            style={{
              width: '100%',
              maxWidth: 440,
              background: '#fff',
              borderRadius: 16,
              padding: 28,
              border: '1px solid var(--border)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.2)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>
              {editingPlan ? 'Editar plan' : 'Nuevo plan de cuota'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Nombre *
                <input
                  required
                  value={planForm.name}
                  onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 6 }}
                  placeholder="Cuota senior"
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Descripción
                <input
                  value={planForm.description}
                  onChange={(e) => setPlanForm((f) => ({ ...f, description: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 6 }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Importe (€) *
                <input
                  required
                  type="number"
                  min={0}
                  step="0.01"
                  value={planForm.amount}
                  onChange={(e) => setPlanForm((f) => ({ ...f, amount: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 6 }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Periodicidad
                <select
                  value={planForm.billingPeriod}
                  onChange={(e) => setPlanForm((f) => ({ ...f, billingPeriod: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 6 }}
                >
                  {PERIOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Matrícula / alta (€)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={planForm.enrollmentFee}
                  onChange={(e) => setPlanForm((f) => ({ ...f, enrollmentFee: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 6 }}
                />
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={planForm.paymentRequiredOnEnrollment}
                  onChange={(e) =>
                    setPlanForm((f) => ({ ...f, paymentRequiredOnEnrollment: e.target.checked }))
                  }
                  style={{ marginTop: 3 }}
                />
                <span>
                  Pago obligatorio al darse de alta
                  <span
                    style={{
                      display: 'block',
                      fontWeight: 500,
                      color: 'var(--text-muted)',
                      marginTop: 4,
                      fontSize: 12,
                    }}
                  >
                    El socio queda en «Alta pendiente de pago» hasta abonar la primera factura (incluye
                    matrícula si la hay). Vencimiento inmediato.
                  </span>
                </span>
              </label>
              {editingPlan ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={planForm.isActive}
                    onChange={(e) => setPlanForm((f) => ({ ...f, isActive: e.target.checked }))}
                  />
                  Plan activo (visible para nuevas asignaciones)
                </label>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPlanModal(false)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--accent)',
                  color: '#fff',
                  cursor: busy ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                }}
              >
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {assignModal && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 500,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setAssignModal(false)
          }}
        >
          <form
            onSubmit={(e) => void assignCuota(e)}
            style={{
              width: '100%',
              maxWidth: 440,
              background: '#fff',
              borderRadius: 16,
              padding: 28,
              border: '1px solid var(--border)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.2)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Asignar cuota a socio</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Socio *
                <select
                  required
                  value={assignForm.memberId}
                  onChange={(e) => setAssignForm((f) => ({ ...f, memberId: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 6 }}
                >
                  <option value="">— Seleccionar —</option>
                  {socios
                    .filter((s) => s.estado !== 'INACTIVE')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                </select>
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Plan *
                <select
                  required
                  value={assignForm.planId}
                  onChange={(e) => {
                    const planId = e.target.value
                    setAssignForm((f) => ({
                      ...f,
                      planId,
                      paymentRequiredOnEnrollment: planPaymentRequiredDefault(planId),
                    }))
                  }}
                  style={{ ...inputStyle, marginTop: 6 }}
                >
                  <option value="">— Seleccionar —</option>
                  {activePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {fmtMoney(p.amount)} / {p.billingPeriodLabel.toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Inicio del periodo
                <input
                  type="date"
                  value={assignForm.startDate}
                  onChange={(e) => setAssignForm((f) => ({ ...f, startDate: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 6 }}
                />
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={assignForm.paymentRequiredOnEnrollment}
                  onChange={(e) =>
                    setAssignForm((f) => ({ ...f, paymentRequiredOnEnrollment: e.target.checked }))
                  }
                  style={{ marginTop: 3 }}
                />
                <span>
                  Pago obligatorio al darse de alta (esta persona)
                  <span
                    style={{
                      display: 'block',
                      fontWeight: 500,
                      color: 'var(--text-muted)',
                      marginTop: 4,
                      fontSize: 12,
                    }}
                  >
                    Por defecto sigue la configuración del plan; puedes cambiarlo solo para este socio.
                  </span>
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={assignForm.autoPay}
                  onChange={(e) => setAssignForm((f) => ({ ...f, autoPay: e.target.checked }))}
                />
                Cobro automático (Stripe) cuando esté configurado
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setAssignModal(false)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--accent)',
                  color: '#fff',
                  cursor: busy ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                }}
              >
                {busy ? 'Asignando…' : 'Asignar y facturar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
