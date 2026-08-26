'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Botón de envío que pregunta antes de ejecutar la acción de servidor.
 *
 * Las pantallas de contabilidad usan formularios con server actions, así que no
 * pueden llamar al diálogo del CRM. Antes borraban de un clic: un movimiento
 * contable con su asiento, o una importación bancaria entera con horas de
 * conciliación dentro, sin decir siquiera cuál.
 *
 * El diálogo nombra lo que se va a borrar y el botón nombra la acción, porque un
 * «¿Estás seguro?» con «Aceptar» se acepta sin leerlo.
 */
export function ConfirmSubmitButton({
  title,
  message,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  className,
  ariaLabel,
  children,
}: {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  className?: string
  /** Obligatorio cuando el botón solo lleva un icono. */
  ariaLabel?: string
  children: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const cancelarRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!abierto) return
    cancelarRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); setAbierto(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierto])

  function ejecutar() {
    setAbierto(false)
    // Se envía el formulario que contiene al botón, con sus inputs ocultos.
    btnRef.current?.form?.requestSubmit()
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        aria-label={ariaLabel}
        onClick={() => setAbierto(true)}
      >
        {children}
      </button>

      {abierto && (
        <div
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setAbierto(false) }}
          className="fixed inset-0 z-[1300] flex items-center justify-center p-5"
          style={{ background: 'rgba(15,23,42,0.5)' }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmar-titulo"
            className="w-full max-w-md rounded-2xl bg-white p-6 text-left shadow-2xl"
          >
            <h2 id="confirmar-titulo" className="text-lg font-bold text-stone-900">
              {title}
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-600">
              {message}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                ref={cancelarRef}
                type="button"
                onClick={() => setAbierto(false)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={ejecutar}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
