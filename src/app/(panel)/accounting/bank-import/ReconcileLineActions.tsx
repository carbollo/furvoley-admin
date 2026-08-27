'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  createLedgerFromBankLine,
  getSuggestedTransactionsForLine,
  ignoreBankLine,
  reconcileBankLine,
  unlinkBankLine,
  getInvoiceCandidatesForLine,
  payInvoiceFromBankLine,
} from '@/app/actions/bank-import'
import { formatMoney } from '@/lib/format-money'

type Tx = {
  id: string
  type: string
  amount: number
  description: string
  date: string
  invoice: { invoiceNumber: string } | null
}

type InvoiceCandidate = {
  id: string
  invoiceNumber: string
  memberName: string
  pendingAmount: number
  dueDate: string
}

type Props = {
  line: {
    id: string
    bankImportId: string
    status: string
    signedAmount: number
    date: string
    description: string
    reference: string | null
    matchedTransaction: Tx | null
  }
}

export function ReconcileLineActions({ line }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Tx[] | null>(null)
  const [facturas, setFacturas] = useState<InvoiceCandidate[] | null>(null)

  const abs = Math.abs(line.signedAmount)
  const isIn = line.signedAmount >= 0

  async function loadSuggestions() {
    setBusy(true)
    setErr(null)
    try {
      const s = await getSuggestedTransactionsForLine(line.id)
      setSuggestions(
        s.map((t) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          description: t.description,
          date:
            typeof t.date === 'string' ? t.date : new Date(t.date as Date).toISOString(),
          invoice: t.invoice,
        })),
      )
    } catch {
      setErr('No se pudieron cargar las sugerencias. Vuelve a intentarlo.')
    } finally {
      setBusy(false)
    }
  }

  async function cargarFacturas() {
    setBusy(true)
    setErr(null)
    try {
      setFacturas(await getInvoiceCandidatesForLine(line.id))
    } catch {
      setErr('No se pudieron cargar las facturas pendientes. Vuelve a intentarlo.')
    } finally {
      setBusy(false)
    }
  }

  async function cobrarFactura(invoiceId: string) {
    setBusy(true)
    setErr(null)
    try {
      const r = await payInvoiceFromBankLine(line.id, invoiceId)
      if (!r.ok) { setErr(r.error); return }
      setFacturas(null)
      router.refresh()
    } catch {
      setErr('No se pudo registrar el cobro. Comprueba tu conexión y vuelve a intentarlo.')
    } finally {
      setBusy(false)
    }
  }

  async function onMatch(txId: string) {
    setBusy(true)
    setErr(null)
    try {
      const r = await reconcileBankLine(line.id, txId)
      if (!r.ok) { setErr(r.error); return }
      setSuggestions(null)
      router.refresh()
    } catch {
      setErr('No se pudo completar la operación. Comprueba tu conexión y vuelve a intentarlo.')
    } finally {
      setBusy(false)
    }
  }

  async function onCreateLedger() {
    setBusy(true)
    setErr(null)
    try {
      const r = await createLedgerFromBankLine(line.id)
      if (!r.ok) { setErr(r.error); return }
      router.refresh()
    } catch {
      setErr('No se pudo completar la operación. Comprueba tu conexión y vuelve a intentarlo.')
    } finally {
      setBusy(false)
    }
  }

  async function onIgnore() {
    setBusy(true)
    setErr(null)
    try {
      const r = await ignoreBankLine(line.id)
      if (!r.ok) { setErr(r.error); return }
      router.refresh()
    } catch {
      setErr('No se pudo completar la operación. Comprueba tu conexión y vuelve a intentarlo.')
    } finally {
      setBusy(false)
    }
  }

  async function onUnlink() {
    setBusy(true)
    setErr(null)
    try {
      const r = await unlinkBankLine(line.id)
      if (!r.ok) { setErr(r.error); return }
      router.refresh()
    } catch {
      setErr('No se pudo completar la operación. Comprueba tu conexión y vuelve a intentarlo.')
    } finally {
      setBusy(false)
    }
  }

  if (line.status === 'MATCHED' && line.matchedTransaction) {
    return (
      <div className="text-sm space-y-1">
        <span className="text-emerald-700 font-medium">Vinculado</span>
        <p className="text-stone-600">
          {line.matchedTransaction.description} — {formatMoney(line.matchedTransaction.amount)} (
          {new Date(line.matchedTransaction.date).toLocaleDateString('es-ES')})
          {line.matchedTransaction.invoice && (
            <span className="ml-1">· {line.matchedTransaction.invoice.invoiceNumber}</span>
          )}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={onUnlink}
          className="text-xs text-blue-600 hover:underline"
        >
          Desvincular
        </button>
        {err && <p className="text-rose-600 text-xs">{err}</p>}
      </div>
    )
  }

  if (line.status === 'NEW_LEDGER' && line.matchedTransaction) {
    return (
      <div className="text-sm space-y-1">
        <span className="text-indigo-700 font-medium">Asiento creado desde extracto</span>
        <p className="text-stone-600">{line.matchedTransaction.description}</p>
        <button
          type="button"
          disabled={busy}
          onClick={onUnlink}
          className="text-xs text-blue-600 hover:underline"
        >
          Desvincular (vuelve a pendiente)
        </button>
        {err && <p className="text-rose-600 text-xs">{err}</p>}
      </div>
    )
  }

  if (line.status === 'IGNORED') {
    // Ignorar era un callejón sin salida: la línea se quedaba fuera para siempre
    // aunque la función de devolverla a pendiente ya existía en este componente.
    return (
      <div className="space-y-1 text-sm">
        <span className="text-stone-400">Ignorado</span>
        <button
          type="button"
          disabled={busy}
          onClick={onUnlink}
          className="block text-xs font-medium text-blue-700 underline hover:text-blue-900 disabled:opacity-60"
        >
          {busy ? '…' : 'Recuperar'}
        </button>
        {err && <p className="text-rose-600 text-xs">{err}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-2">
        {isIn && (
          <button
            type="button"
            disabled={busy}
            onClick={cargarFacturas}
            title="Registra el cobro de una factura con este ingreso"
            className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
          >
            {busy ? '…' : 'Cobrar una factura'}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={loadSuggestions}
          className="px-2 py-1 rounded bg-stone-100 text-stone-800 text-xs font-medium hover:bg-stone-200"
        >
          {busy ? '…' : 'Sugerencias'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCreateLedger}
          className="px-2 py-1 rounded bg-indigo-100 text-indigo-900 text-xs font-medium hover:bg-indigo-200"
        >
          Crear asiento
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onIgnore}
          className="px-2 py-1 rounded text-stone-500 text-xs hover:bg-stone-50"
        >
          Ignorar
        </button>
      </div>
      <p className="text-xs text-stone-500">
        {isIn ? 'Ingreso' : 'Gasto'} esperado: {formatMoney(abs)}
      </p>
      {suggestions && suggestions.length > 0 && (
        <ul className="border border-stone-100 rounded-lg divide-y max-h-40 overflow-y-auto">
          {suggestions.map((t) => (
            <li key={t.id} className="p-2 flex justify-between gap-2 items-start">
              <div>
                <p className="text-xs font-medium text-stone-800">{t.description}</p>
                <p className="text-xs text-stone-500">
                  {new Date(t.date).toLocaleDateString('es-ES')} · {formatMoney(t.amount)} ·{' '}
                  {t.type}
                  {t.invoice && ` · ${t.invoice.invoiceNumber}`}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => onMatch(t.id)}
                className="shrink-0 text-xs text-white bg-emerald-600 px-2 py-1 rounded"
              >
                Vincular
              </button>
            </li>
          ))}
        </ul>
      )}
      {suggestions && suggestions.length === 0 && (
        <p className="text-xs text-stone-500">No hay asientos cercanos por importe y fecha.</p>
      )}
      {facturas && facturas.length > 0 && (
        <div className="border border-emerald-100 rounded-lg">
          <p className="px-2 pt-2 text-xs font-semibold text-stone-700">
            ¿De quién es este ingreso? Al elegir, la factura queda cobrada.
          </p>
          <ul className="divide-y max-h-48 overflow-y-auto">
            {facturas.map((f) => (
              <li key={f.id} className="p-2 flex justify-between gap-2 items-start">
                <div>
                  <p className="text-xs font-medium text-stone-800">
                    {f.memberName} · {f.invoiceNumber}
                  </p>
                  <p className="text-xs text-stone-500">
                    Debe {formatMoney(f.pendingAmount)} · vence{' '}
                    {new Date(f.dueDate).toLocaleDateString('es-ES')}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => cobrarFactura(f.id)}
                  className="shrink-0 text-xs text-white bg-emerald-600 px-2 py-1 rounded hover:bg-emerald-700"
                >
                  Cobrar {formatMoney(Math.min(f.pendingAmount, abs))}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {facturas && facturas.length === 0 && (
        <p className="text-xs text-stone-500">
          Ningún socio tiene facturas pendientes ahora mismo.
        </p>
      )}
      {err && <p className="text-rose-600 text-xs">{err}</p>}
    </div>
  )
}
