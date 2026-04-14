'use client'

import { useEffect, useState } from 'react'

export function AutoCloseNotice() {
  const [closedAttempted, setClosedAttempted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setClosedAttempted(true)
      window.close()
    }, 1800)

    return () => clearTimeout(timer)
  }, [])

  return (
    <p className="text-sm text-slate-500 mt-3">
      {closedAttempted
        ? 'Puedes cerrar esta pestaña.'
        : 'Esta ventana se cerrará automáticamente en unos segundos...'}
    </p>
  )
}

