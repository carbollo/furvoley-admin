import { formatMoney } from '@/lib/format-money'

/**
 * Texto único de los avisos de cobro.
 *
 * Antes había dos redacciones distintas —una en el cron y otra en el aviso
 * manual— y ninguna tenía en cuenta a quién le llega el mensaje. La mayoría de
 * los socios son menores y el WhatsApp acaba en el móvil del padre o la madre,
 * que recibía un «Hola Lucía, tienes cuotas pendientes» dirigido a su hija.
 *
 * También importa decir QUÉ paga el enlace: si el socio debe tres recibos y el
 * enlace solo cubre el más antiguo, callarlo hace que pague y siga apareciendo
 * como moroso.
 */
export type ReminderInvoice = {
  invoiceNumber: string
  pending: number
  dueDate: Date
  currency?: string
}

export function buildReminderMessage(input: {
  memberName: string
  clubName: string
  /** true si el mensaje va al teléfono del tutor, no al del socio. */
  toGuardian: boolean
  invoices: ReminderInvoice[]
  /** Enlace de pago; cubre SOLO la factura `linkCoversInvoiceNumber`. */
  payUrl?: string | null
  linkCoversInvoiceNumber?: string | null
}): string {
  const { memberName, clubName, toGuardian, invoices } = input
  const total = invoices.reduce((a, i) => a + i.pending, 0)
  const moneda = invoices[0]?.currency || 'EUR'
  const masAntigua = [...invoices].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0]

  const saludo = toGuardian
    ? `Hola, te escribimos de ${clubName} por la cuota de ${memberName}.`
    : `Hola ${memberName}, te escribimos de ${clubName}.`

  const cuerpo =
    invoices.length === 1
      ? `Tienes pendiente el recibo ${invoices[0].invoiceNumber} de ${formatMoney(invoices[0].pending, moneda)}, ` +
        `con vencimiento ${invoices[0].dueDate.toLocaleDateString('es-ES')}.`
      : `Hay ${invoices.length} recibos pendientes, ${formatMoney(total, moneda)} en total. ` +
        `El más antiguo venció el ${masAntigua.dueDate.toLocaleDateString('es-ES')}.`

  const partes = [saludo, cuerpo]

  if (input.payUrl) {
    // Con varios recibos, decir explícitamente que el enlace no los paga todos:
    // si no, el socio paga, cree haber terminado y sigue saliendo como moroso.
    const cubre = input.linkCoversInvoiceNumber
    partes.push(
      invoices.length > 1 && cubre
        ? `Puedes pagar el recibo ${cubre} aquí: ${input.payUrl}\n` +
          `Para el resto, escríbenos y te pasamos los enlaces.`
        : `Puedes pagarlo aquí: ${input.payUrl}`,
    )
  } else {
    partes.push('Ponte en contacto con el club para regularizarlo. Gracias.')
  }

  return partes.join('\n')
}
