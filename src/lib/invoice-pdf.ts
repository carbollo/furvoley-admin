import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export type InvoicePdfInput = {
  invoiceNumber: string
  kind: string
  issueDate: Date
  dueDate: Date
  subtotal: number
  taxAmount: number
  totalAmount: number
  paidAmount: number
  currency: string
  member: {
    name: string
    email?: string | null
    address?: string | null
    dni?: string | null
  }
  items: {
    description: string
    quantity: number
    unitAmount: number
    totalAmount: number
  }[]
  /**
   * Datos del emisor (club). Si se omite se usa solo el nombre genérico
   * "Furvoley" como cabecera por compatibilidad.
   */
  issuer?: {
    name: string
    legalName?: string | null
    taxId?: string | null
    addressLines?: string[]
    contactEmail?: string | null
    contactPhone?: string | null
    website?: string | null
  }
}

function fmt(n: number) {
  return n.toFixed(2)
}

export async function buildInvoicePdf(data: InvoicePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let y = 800
  const left = 50
  const line = 14

  const draw = (text: string, opts?: { bold?: boolean; size?: number }) => {
    const size = opts?.size ?? 11
    const f = opts?.bold ? fontBold : font
    page.drawText(text, { x: left, y, size, font: f, color: rgb(0.1, 0.1, 0.12) })
    y -= line * (size / 11)
  }

  const issuer = data.issuer
  const headerName = issuer?.name?.trim() || 'Furvoley'

  draw(`${headerName} — Factura`, { bold: true, size: 18 })
  y -= 6
  draw(`Nº ${data.invoiceNumber}`)
  draw(`Tipo: ${data.kind === 'OTHER' ? 'Cobro adicional' : 'Cuota / membresía'}`)
  y -= 8

  if (issuer) {
    draw('Datos del emisor', { bold: true, size: 12 })
    if (issuer.legalName) draw(issuer.legalName)
    if (issuer.taxId) draw(`CIF/NIF: ${issuer.taxId}`)
    if (issuer.addressLines && issuer.addressLines.length) {
      for (const lineText of issuer.addressLines) draw(lineText, { size: 10 })
    }
    const contactBits = [
      issuer.contactEmail || null,
      issuer.contactPhone || null,
      issuer.website || null,
    ].filter(Boolean) as string[]
    if (contactBits.length) draw(contactBits.join('  ·  '), { size: 10 })
    y -= 8
  }

  draw('Datos del socio', { bold: true, size: 12 })
  draw(data.member.name)
  if (data.member.dni) draw(`DNI/NIE: ${data.member.dni}`)
  if (data.member.email) draw(data.member.email)
  if (data.member.address) draw(data.member.address)
  y -= 8

  draw(`Fecha emisión: ${data.issueDate.toLocaleDateString('es-ES')}`)
  draw(`Vencimiento: ${data.dueDate.toLocaleDateString('es-ES')}`)
  y -= 12

  draw('Conceptos', { bold: true, size: 12 })
  y -= 4
  for (const item of data.items) {
    draw(
      `${item.description}  |  ${item.quantity} x ${fmt(item.unitAmount)} ${data.currency}  =  ${fmt(item.totalAmount)} ${data.currency}`,
      { size: 10 },
    )
  }
  y -= 10

  draw(`Base imponible: ${fmt(data.subtotal)} ${data.currency}`)
  if (data.taxAmount > 0) draw(`IVA / impuestos: ${fmt(data.taxAmount)} ${data.currency}`)
  draw(`Total: ${fmt(data.totalAmount)} ${data.currency}`, { bold: true })
  draw(`Pagado: ${fmt(data.paidAmount)} ${data.currency}`)
  draw(`Pendiente: ${fmt(Math.max(0, data.totalAmount - data.paidAmount))} ${data.currency}`, {
    bold: true,
  })

  y -= 20
  draw('Documento generado electrónicamente para su archivo.', { size: 9 })

  return pdf.save()
}
