'use client'

import { useCallback, useEffect, useState } from 'react'
import { PaymentReminderButton } from './PaymentReminderButton'
import { MemberCombobox } from './MemberCombobox'
import { track } from '@/lib/analytics/umami'

type Plan = {
  id: string
  name: string
  description: string | null
  amount: number
  billingPeriod: string
  billingPeriodLabel: string
  enrollmentFee: number
  paymentRequiredOnEnrollment: boolean
  billingDayOfMonth: number
  isActive: boolean
  subscriptionCount: number
  /** La cuota ya tiene su plan espejo en la pasarela con el precio actual. */
  onlineReady?: boolean
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
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'planes' | 'asignaciones'>('planes')
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([])
  const [stats, setStats] = useState({ activePlans: 0, activeSubscriptions: 0 })
  const [busy, setBusy] = useState(false)
  const [generateBusy, setGenerateBusy] = useState(false)
  // Acciones contra la pasarela de cobro (preparar cuotas, enlaces de cobro).
  const [gatewayBusy, setGatewayBusy] = useState(false)

  const [planModal, setPlanModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [planForm, setPlanForm] = useState({
    name: '',
    description: '',
    amount: '',
    billingPeriod: 'MONTHLY',
    enrollmentFee: '0',
    paymentRequiredOnEnrollment: false,
    billingDayOfMonth: '1',
    isActive: true,
  })

  const [assignModal, setAssignModal] = useState(false)
  const [assignForm, setAssignForm] = useState({
    /** Socios a los que se aplicará la misma cuota. */
    members: [] as { id: string; name: string }[],
    memberId: '',
    planId: '',
    startDate: '',
    autoPay: false,
    paymentRequiredOnEnrollment: false,
    discountCodeId: '',
  })
  // Códigos de descuento activos (roadmap · 6.5) para asociar al crear la cuota.
  const [discountOptions, setDiscountOptions] = useState<{ id: string; code: string; label: string; kind: string; value: number }[]>([])
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/crm/discounts', { credentials: 'include', cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        setDiscountOptions((j.discounts ?? []).filter((d: { isActive: boolean }) => d.isActive))
      } catch { /* opcional */ }
    })()
  }, [])

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
      billingDayOfMonth: '1',
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
      billingDayOfMonth: String(p.billingDayOfMonth ?? 1),
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
        billingDayOfMonth: Math.min(28, Math.max(1, Number(planForm.billingDayOfMonth) || 1)),
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
      track('guardar-plan-cuota')
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
    if (assignForm.members.length === 0 || !assignForm.planId) {
      showAlert('Añade al menos un socio y elige la cuota')
      return
    }
    const paymentRequired = assignForm.paymentRequiredOnEnrollment
    const count = assignForm.members.length
    setBusy(true)
    try {
      const r = await fetch('/api/crm/whop/assign-plan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberIds: assignForm.members.map((m) => m.id),
          planId: assignForm.planId,
          paymentRequiredOnEnrollment: assignForm.paymentRequiredOnEnrollment,
          // El enlace solo tiene sentido entregarlo cuando es para un socio.
          withLink: count === 1,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || 'No se pudo asignar la cuota')
        return
      }
      track('asignar-cuota', { pagoAlAlta: paymentRequired, socios: count })
      setAssignModal(false)
      setAssignForm({
        members: [],
        memberId: '',
        planId: '',
        startDate: '',
        autoPay: false,
        paymentRequiredOnEnrollment: false,
        discountCodeId: '',
      })
      await loadData()
      await reload()

      const base =
        count === 1
          ? paymentRequired
            ? 'Cuota asignada. El socio queda en «Alta pendiente de pago» hasta que pague.'
            : 'Cuota asignada y primera factura generada.'
          : `Cuota asignada a ${j.succeeded ?? count} socio(s)${j.failed ? `, ${j.failed} con error` : ''}.`

      if (j.url) {
        try {
          await navigator.clipboard?.writeText(String(j.url))
          showAlert(`${base}\n\nEnlace de pago copiado al portapapeles:\n${j.url}`)
        } catch {
          showAlert(`${base}\n\nEnlace de pago:\n${j.url}`)
        }
      } else {
        showAlert(j.linkError ? `${base}\n\n(No se pudo generar el enlace: ${j.linkError})` : base)
      }
    } finally {
      setBusy(false)
    }
  }

  const [editSubModal, setEditSubModal] = useState<SubscriptionRow | null>(null)
  const [editSubPlanId, setEditSubPlanId] = useState('')
  const [editSubOrigPlanId, setEditSubOrigPlanId] = useState('')
  const [editSubNextDate, setEditSubNextDate] = useState('')

  function abrirEditarSuscripcion(s: SubscriptionRow) {
    setEditSubModal(s)
    // Si el plan actual está INACTIVO no aparece en activePlans: NO preseleccionar
    // otro plan por defecto (eso reasignaría al socio en silencio y cambiaría su
    // cuota). Vacío = mantener el plan actual (no se envía planId en el PATCH).
    const plan = activePlans.find((p) => p.name === s.planName)
    setEditSubPlanId(plan?.id || '')
    setEditSubOrigPlanId(plan?.id || '')
    setEditSubNextDate(s.nextInvoiceDate ? s.nextInvoiceDate.slice(0, 10) : '')
  }

  async function guardarEdicionSuscripcion() {
    if (!editSubModal) return
    setBusy(true)
    try {
      const r = await fetch(`/api/crm/subscriptions/${editSubModal.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Solo cambia de plan si el usuario eligió uno DISTINTO del actual.
          ...(editSubPlanId && editSubPlanId !== editSubOrigPlanId ? { planId: editSubPlanId } : {}),
          ...(editSubNextDate ? { nextInvoiceDate: editSubNextDate } : {}),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || 'No se pudo modificar la suscripción')
        return
      }
      setEditSubModal(null)
      await loadData()
      await reload()
      showAlert('Suscripción modificada. El nuevo plan aplica desde la siguiente factura.')
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

  /** Prepara en la pasarela un plan por cada cuota, para poder cobrarlas online. */
  async function prepararCobroOnline() {
    if (gatewayBusy) return
    setGatewayBusy(true)
    try {
      const r = await fetch('/api/crm/whop/sync-plans', { method: 'POST', credentials: 'include' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || 'No se pudieron preparar las cuotas para el cobro online')
        return
      }
      const errores = Array.isArray(j.errors) ? j.errors : []
      showAlert(
        errores.length > 0
          ? `Preparadas ${j.synced} cuota(s). Con problemas: ${errores.map((e: { plan: string; error: string }) => `${e.plan} (${e.error})`).join('; ')}`
          : `Listo: ${j.synced} cuota(s) preparadas para cobro online${j.created ? ` (${j.created} nueva(s))` : ''}.`,
      )
      track('preparar-cobro-online', { cuotas: j.synced })
    } finally {
      setGatewayBusy(false)
    }
  }

  /** Enlace de alta con cobro recurrente para la cuota de un socio. */
  async function enlaceCobroRecurrente(subscriptionId: string) {
    if (gatewayBusy) return
    setGatewayBusy(true)
    try {
      const r = await fetch('/api/crm/whop/subscription-link', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.url) {
        showAlert(j.error || 'No se pudo generar el enlace de cobro')
        return
      }
      try {
        await navigator.clipboard?.writeText(String(j.url))
        showAlert('Enlace de cobro copiado. Envíaselo al socio: al pagarlo, su cuota se renovará automáticamente.')
      } catch {
        showAlert(`Enlace de cobro: ${j.url}`)
      }
      track('enlace-cobro-recurrente')
    } finally {
      setGatewayBusy(false)
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
      track('emitir-cuotas', { creadas: j.createdCount })
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
            <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
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
              onClick={() => {
                const firstPlanId = activePlans[0]?.id || ''
                setAssignForm({
                  members: [],
                  memberId: '',
                  planId: firstPlanId,
                  startDate: new Date().toISOString().slice(0, 10),
                  autoPay: false,
                  paymentRequiredOnEnrollment: planPaymentRequiredDefault(firstPlanId),
                  discountCodeId: '',
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
              Asignar cuotas
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
                    {['Plan', 'Importe', 'Periodicidad', 'Día cobro', 'Matrícula', 'Pago al alta', 'Cobro online', 'Socios', 'Estado', ''].map((h) => (
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
                      <td style={{ padding: '16px 20px', fontSize: 14, fontWeight: 600 }}>
                        Día {p.billingDayOfMonth ?? 1}
                      </td>
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
                      <td style={{ padding: '16px 20px', fontSize: 13 }}>
                        {p.onlineReady ? (
                          <span style={{ fontWeight: 700, color: 'var(--green)' }} title="Esta cuota ya se puede cobrar online">
                            ✓ Listo
                          </span>
                        ) : (
                          <span
                            style={{ color: 'var(--text-muted)' }}
                            title="Pulsa «Preparar cobro online» para poder cobrarla por internet"
                          >
                            — Sin preparar
                          </span>
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
                              onClick={() => abrirEditarSuscripcion(s)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: 'var(--accent-pill)',
                                color: 'var(--accent)',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 700,
                                fontFamily: 'inherit',
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              disabled={gatewayBusy}
                              onClick={() => void enlaceCobroRecurrente(s.id)}
                              title="Copia un enlace de pago; al abonarlo, la cuota se renueva automáticamente cada periodo"
                              style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: '#fff',
                                cursor: gatewayBusy ? 'wait' : 'pointer',
                                fontSize: 12,
                                fontWeight: 600,
                                fontFamily: 'inherit',
                              }}
                            >
                              Enlace de cobro
                            </button>
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
                Día de cobro del mes (1–28)
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={planForm.billingDayOfMonth}
                  onChange={(e) => setPlanForm((f) => ({ ...f, billingDayOfMonth: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 6 }}
                />
                <span
                  style={{
                    display: 'block',
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                    marginTop: 4,
                    fontSize: 12,
                  }}
                >
                  Las cuotas recurrentes se emiten ese día (p. ej. 1 = cada día 1 del mes).
                </span>
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

      {/* Modal: modificar suscripción (roadmap · 6.3) */}
      {editSubModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => { if (!busy) setEditSubModal(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.45)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 20px 50px rgba(28,25,23,0.25)' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700 }}>Modificar suscripción</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>
              {editSubModal.memberName} · ahora en «{editSubModal.planName}» ({fmtMoney(editSubModal.planAmount)} / {editSubModal.billingPeriodLabel.toLowerCase()})
            </p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Plan de cuota</label>
            <select
              value={editSubPlanId}
              onChange={(e) => setEditSubPlanId(e.target.value)}
              style={{ ...inputStyle, marginBottom: 4, background: '#fff' }}
            >
              <option value="">Mantener plan actual{editSubModal.planName ? ` («${editSubModal.planName}»)` : ''}</option>
              {activePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {fmtMoney(p.amount)}
                </option>
              ))}
            </select>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-muted)' }}>
              El cambio de plan aplica desde la siguiente factura (las ya emitidas no se tocan).
            </p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Próxima factura</label>
            <input
              type="date"
              value={editSubNextDate}
              onChange={(e) => setEditSubNextDate(e.target.value)}
              style={{ ...inputStyle, marginBottom: 20 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditSubModal(null)}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy || (!editSubPlanId && !editSubNextDate)}
                onClick={() => void guardarEdicionSuscripcion()}
                style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: busy || (!editSubPlanId && !editSubNextDate) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, opacity: busy || (!editSubPlanId && !editSubNextDate) ? 0.6 : 1 }}
              >
                {busy ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
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
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Asignar cuota a socios</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <MemberCombobox
                  label="Socios *"
                  value=""
                  onChange={(memberId, member) => {
                    if (!memberId) return
                    setAssignForm((f) =>
                      f.members.some((m) => m.id === memberId)
                        ? f
                        : { ...f, members: [...f.members, { id: memberId, name: member?.nombre || 'Socio' }] },
                    )
                  }}
                  placeholder="Buscar socio y añadirlo…"
                  style={{ marginBottom: 0 }}
                />
                {assignForm.members.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {assignForm.members.map((m) => (
                      <span
                        key={m.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12.5,
                          fontWeight: 600,
                          padding: '4px 8px 4px 10px',
                          borderRadius: 999,
                          background: 'var(--accent-pill)',
                          color: 'var(--accent)',
                        }}
                      >
                        {m.name}
                        <button
                          type="button"
                          onClick={() =>
                            setAssignForm((f) => ({ ...f, members: f.members.filter((x) => x.id !== m.id) }))
                          }
                          title="Quitar de la lista"
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: 'inherit',
                            fontSize: 14,
                            lineHeight: 1,
                            padding: 0,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                    Busca y añade tantos socios como quieras: se les asignará la misma cuota.
                  </div>
                )}
              </div>
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
                Descuento (opcional)
                <select
                  value={assignForm.discountCodeId}
                  onChange={(e) => setAssignForm((f) => ({ ...f, discountCodeId: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 6 }}
                >
                  <option value="">Sin descuento</option>
                  {discountOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.label} ({d.kind === 'PERCENT' ? `−${d.value}%` : `−${fmtMoney(d.value)}`})
                    </option>
                  ))}
                </select>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 4 }}>
                  Se descuenta en cada factura de la suscripción. Genera códigos en Contabilidad → Descuentos.
                </span>
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
