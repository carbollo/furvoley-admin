'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  createLedgerFromBankLine,
  getSuggestedTransactionsForLine,
  ignoreBankLine,
  reconcileBankLine,
  unlinkBankLine,
} from '@/app/actions/bank-import'

type Tx = {
  id: string
  type: string
  amount: number
  description: string
  date: string
  invoice: { invoiceNumber: string } | null
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
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onMatch(txId: string) {
    setBusy(true)
    setErr(null)
    try {
      await reconcileBankLine(line.id, txId)
      setSuggestions(null)
      router.refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onCreateLedger() {
    setBusy(true)
    setErr(null)
    try {
      await createLedgerFromBankLine(line.id)
      router.refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onIgnore() {
    setBusy(true)
    setErr(null)
    try {
      await ignoreBankLine(line.id)
      router.refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onUnlink() {
    setBusy(true)
    setErr(null)
    try {
      await unlinkBankLine(line.id)
      router.refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (line.status === 'MATCHED' && line.matchedTransaction) {
    return (
      <div className="text-sm space-y-1">
        <span className="text-emerald-700 font-medium">Vinculado</span>
        <p className="text-slate-600">
          {line.matchedTransaction.description} — €{line.matchedTransaction.amount.toFixed(2)} (
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
        <p className="text-slate-600">{line.matchedTransaction.description}</p>
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
    return <span className="text-slate-400 text-sm">Ignorado</span>
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={loadSuggestions}
          className="px-2 py-1 rounded bg-slate-100 text-slate-800 text-xs font-medium hover:bg-slate-200"
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
          className="px-2 py-1 rounded text-slate-500 text-xs hover:bg-slate-50"
        >
          Ignorar
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {isIn ? 'Ingreso' : 'Gasto'} esperado: €{abs.toFixed(2)}
      </p>
      {suggestions && suggestions.length > 0 && (
        <ul className="border border-slate-100 rounded-lg divide-y max-h-40 overflow-y-auto">
          {suggestions.map((t) => (
            <li key={t.id} className="p-2 flex justify-between gap-2 items-start">
              <div>
                <p className="text-xs font-medium text-slate-800">{t.description}</p>
                <p className="text-xs text-slate-500">
                  {new Date(t.date).toLocaleDateString('es-ES')} · €{t.amount.toFixed(2)} ·{' '}
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
        <p className="text-xs text-slate-500">No hay asientos cercanos por importe y fecha.</p>
      )}
      {err && <p className="text-rose-600 text-xs">{err}</p>}
    </div>
  )
}
