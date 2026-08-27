'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { importBankCsv } from '@/app/actions/bank-import'

export function BankCsvUpload() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [delimiter, setDelimiter] = useState<'auto' | ';' | ','>('auto')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    const fd = new FormData(e.currentTarget)
    const file = fd.get('file') as File | null
    const note = String(fd.get('note') || '').trim() || null

    let content = String(fd.get('paste') || '').trim()
    if (file && file.size > 0) {
      content = await file.text()
    }

    if (!content) {
      setMsg('Pega el CSV o elige un archivo.')
      setLoading(false)
      return
    }

    const res = await importBankCsv({
      content,
      fileName: file?.name ?? null,
      note,
      delimiter: delimiter === 'auto' ? 'auto' : delimiter,
    })

    if (!res.success) {
      setMsg(res.error)
      setLoading(false)
      return
    }

    // Los avisos se guardan en la propia importación y se pintan en el detalle:
    // aquí morían en el router.push, así que el tesorero nunca llegaba a saber
    // que se habían omitido filas o que el extracto venía repetido.
    router.push(`/accounting/bank-import/${res.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-semibold text-stone-900">Importar extracto (CSV)</h2>
      <p className="text-sm text-stone-600">
        Se detectan columnas por cabecera (fecha, importe, concepto, referencia). Delimitador
        automático entre <code className="bg-stone-100 px-1 rounded">;</code> y{' '}
        <code className="bg-stone-100 px-1 rounded">,</code>. Importes con formato europeo (1.234,56)
        soportados.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Archivo .csv</label>
          <input
            name="file"
            type="file"
            accept=".csv,.txt"
            className="block w-full text-sm text-stone-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Delimitador</label>
          <select
            value={delimiter}
            onChange={(e) => setDelimiter(e.target.value as 'auto' | ';' | ',')}
            className="w-full border rounded-lg px-3 py-2 text-stone-900 bg-white"
          >
            <option value="auto">Automático</option>
            <option value=";">Punto y coma (;)</option>
            <option value=",">Coma (,)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          O pega aquí el contenido del CSV
        </label>
        <textarea
          name="paste"
          rows={6}
          className="w-full border rounded-lg px-3 py-2 text-stone-900 font-mono text-xs"
          placeholder={'Fecha;Concepto;Importe\n01/01/2026;Abono cuota;150,00\n'}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Nota (opcional)</label>
        <input
          name="note"
          type="text"
          className="w-full border rounded-lg px-3 py-2 text-stone-900"
          placeholder="Ej. Extracto enero 2026"
        />
      </div>

      {msg && <p className="text-sm text-rose-600">{msg}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
      >
        {loading ? 'Importando…' : 'Importar movimientos'}
      </button>
    </form>
  )
}
