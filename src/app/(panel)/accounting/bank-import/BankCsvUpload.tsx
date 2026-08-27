'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { importBankCsv, previewBankCsv } from '@/app/actions/bank-import'
import type { BankCsvPreview } from '@/lib/bank-csv'

export function BankCsvUpload() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [delimiter, setDelimiter] = useState<'auto' | ';' | ','>('auto')
  /**
   * Paso intermedio: enseñar qué ha entendido antes de tocar nada.
   *
   * Si el banco exporta con cabeceras que el importador no conoce, se caía a
   * suponer Fecha=0, Concepto=1, Importe=2 y lo importaba igual. Con un banco
   * que ponga las columnas en otro orden, eso mete importes en el concepto y
   * fechas inventadas en la contabilidad, y nadie lo ve hasta mucho después.
   */
  const [preview, setPreview] = useState<BankCsvPreview | null>(null)
  const [contenido, setContenido] = useState('')
  const [nota, setNota] = useState<string | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null)
  const [cols, setCols] = useState({ date: 0, amount: 2, description: 1, reference: -1 })

  async function importarConfirmado() {
    if (!preview) return
    setLoading(true)
    setMsg(null)
    const res = await importBankCsv({
      content: contenido,
      fileName: nombreArchivo,
      note: nota,
      delimiter: delimiter === 'auto' ? 'auto' : delimiter,
      columnas: cols,
      saltarCabecera: preview.reconocido,
    })
    if (!res.success) {
      setMsg(res.error)
      setLoading(false)
      return
    }
    router.push(`/accounting/bank-import/${res.id}`)
    router.refresh()
  }

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

    const p = await previewBankCsv({
      content,
      delimiter: delimiter === 'auto' ? 'auto' : delimiter,
    })
    if (!p.ok) {
      setMsg(p.error || 'No se pudo leer el archivo.')
      setLoading(false)
      return
    }
    setContenido(content)
    setNombreArchivo(file?.name ?? null)
    setNota(note)
    setCols(p.detectado)
    setPreview(p)
    setLoading(false)
  }

  // Paso de confirmación: qué columna es cada cosa, con las primeras filas
  // delante para poder comprobarlo de un vistazo.
  if (preview) {
    const ETIQUETAS: { clave: 'date' | 'description' | 'amount' | 'reference'; texto: string; obligatoria: boolean }[] = [
      { clave: 'date', texto: 'Fecha', obligatoria: true },
      { clave: 'description', texto: 'Concepto', obligatoria: true },
      { clave: 'amount', texto: 'Importe', obligatoria: true },
      { clave: 'reference', texto: 'Referencia', obligatoria: false },
    ]
    const nombreCol = (i: number) =>
      preview.reconocido && preview.cabeceras[i]
        ? preview.cabeceras[i]
        : `Columna ${i + 1}`
    const repetida = ETIQUETAS.filter((e) => e.obligatoria).some((e, _i, arr) =>
      arr.some((o) => o.clave !== e.clave && cols[o.clave] === cols[e.clave]),
    )

    return (
      <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Comprueba antes de importar</h2>
          <p className="text-sm text-stone-600 mt-1">
            {preview.reconocido
              ? 'He reconocido las columnas de tu banco. Repásalas y corrige si algo no encaja.'
              : 'Tu banco usa cabeceras que no conozco, así que he supuesto el orden. Dime cuál es cada columna.'}
            {' '}Se importarán {preview.totalFilas} movimientos.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {ETIQUETAS.map((e) => (
            <label key={e.clave} className="block">
              <span className="block text-xs font-semibold text-stone-600 mb-1">
                {e.texto}{e.obligatoria ? '' : ' (opcional)'}
              </span>
              <select
                value={cols[e.clave]}
                onChange={(ev) => setCols((c) => ({ ...c, [e.clave]: Number(ev.target.value) }))}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              >
                {!e.obligatoria && <option value={-1}>— no la tengo —</option>}
                {preview.cabeceras.map((_, i) => (
                  <option key={i} value={i}>{nombreCol(i)}</option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full text-xs">
            <thead className="bg-stone-50 text-stone-600">
              <tr>
                {preview.cabeceras.map((_, i) => {
                  const rol = ETIQUETAS.find((e) => cols[e.clave] === i)
                  return (
                    <th key={i} className="p-2 text-left whitespace-nowrap">
                      <span className="block">{nombreCol(i)}</span>
                      {rol && (
                        <span className="mt-0.5 inline-block rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-800">
                          {rol.texto}
                        </span>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {preview.muestra.map((fila, i) => (
                <tr key={i} className="border-t border-stone-100">
                  {preview.cabeceras.map((_, c) => (
                    <td key={c} className="p-2 text-stone-700 whitespace-nowrap">{fila[c] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {repetida && (
          <p className="text-sm font-medium text-rose-600">
            Has puesto la misma columna en dos sitios. Cada dato tiene que venir de una columna distinta.
          </p>
        )}
        {msg && <p className="text-sm text-rose-600">{msg}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={loading || repetida}
            onClick={importarConfirmado}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {loading ? 'Importando…' : `Importar ${preview.totalFilas} movimientos`}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => { setPreview(null); setMsg(null) }}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            Elegir otro archivo
          </button>
        </div>
      </div>
    )
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
        {loading ? 'Leyendo…' : 'Revisar antes de importar'}
      </button>
    </form>
  )
}
