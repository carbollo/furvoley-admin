/**
 * Traducción de la contabilidad al idioma del tesorero.
 *
 * Las pantallas contables rotulaban las pestañas con jerga del Plan General
 * Contable en mayúsculas (DIARIO, MAYOR, BALANCES) y dentro imprimían los enums
 * de la base de datos tal cual: «POSTED · INVOICE», «5720000 · Bancos c/c ·
 * ASSET». El usuario es un padre voluntario: si la pantalla donde podría
 * comprobar que todo está bien contabilizado está en un idioma que no habla, no
 * la abre nunca y los errores no se detectan.
 */

export const ESTADO_ASIENTO: Record<string, string> = {
  POSTED: 'Contabilizado',
  REVERSED: 'Anulado',
  DRAFT: 'Borrador',
}

export const ORIGEN_ASIENTO: Record<string, string> = {
  MANUAL: 'Registrado a mano',
  INVOICE: 'De una factura',
  INVOICE_PAYMENT: 'Cobro de factura',
  BANK_CSV_IMPORT: 'Del extracto bancario',
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  WHOP: 'Cobro online',
  STRIPE: 'Cobro online',
}

/** Naturaleza de una cuenta, dicha como se la explicarías a alguien. */
export const NATURALEZA_CUENTA: Record<string, string> = {
  ASSET: 'Lo que tenemos',
  LIABILITY: 'Lo que debemos',
  EQUITY: 'Fondos del club',
  INCOME: 'Ingresos',
  EXPENSE: 'Gastos',
}

/** Pestañas de la sección contable, con una línea que explica para qué sirve. */
export const PESTANAS_CONTABLES = [
  { id: 'COBROS', label: 'Facturas', ayuda: 'Lo que has emitido y lo que te han pagado.' },
  { id: 'DIARIO', label: 'Movimientos', ayuda: 'Todo lo que ha entrado y salido, por orden de fecha.' },
  { id: 'MAYOR', label: 'Saldos', ayuda: 'Cuánto hay en cada sitio: banco, caja, cada tipo de gasto.' },
  { id: 'CUENTAS', label: 'Categorías', ayuda: 'Las casillas donde se clasifica cada movimiento.' },
  { id: 'BALANCES', label: 'Resultado', ayuda: 'Ingresos menos gastos, y de qué se compone.' },
] as const

export function etiqueta(dicc: Record<string, string>, valor: unknown): string {
  const v = String(valor || '').trim()
  return dicc[v] || v
}
