'use client'

import { useState } from 'react'
import { runBillingAutomation } from '@/app/actions/billing'
import { RefreshCw } from 'lucide-react'

export function BillingAutomationButton() {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setMsg(null)
    try {
      const r = await runBillingAutomation()
      setMsg(
        `Facturas generadas: ${r.generatedInvoices}. Recordatorios enviados (job): ${r.remindersSent}.`,
      )
    } catch (e) {
      setMsg((e as Error).message || 'Error al ejecutar la automatización')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Ejecutando…' : 'Automatizar cobros (cuotas + impagos + recordatorios)'}
      </button>
      {msg && <p className="text-sm text-slate-600 max-w-xl">{msg}</p>}
      <p className="text-xs text-slate-500">
        Genera facturas de suscripciones vencidas, marca facturas como impagadas y lanza el job de
        recordatorios (email/webhook). Para producción puedes programar{' '}
        <code className="bg-slate-100 px-1 rounded">/api/jobs/billing</code> con un cron.
      </p>
    </div>
  )
}
