import { PDFDocument, StandardFonts, type PDFPage, type PDFFont, rgb } from 'pdf-lib'
import type { InvoicePdfTemplateId } from '@/lib/club-settings'
import { normalizeInvoicePdfTemplate } from '@/lib/club-settings'

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
  /** Datos del emisor (ClubSettings / administrador). */
  issuer?: {
    name: string
    legalName?: string | null
    taxId?: string | null
    addressLines?: string[]
    contactEmail?: string | null
    contactPhone?: string | null
    website?: string | null
  }
  /** Hex corporativo (#rrggbb); plantilla Modern. */
  primaryColor?: string | null
  /** CLASSIC | MODERN | COMPACT */
  template?: InvoicePdfTemplateId | string | null
}

const PLACEHOLDER = '\u2014'

function hexToRgb(hexRaw: string | null | undefined) {
  const hex = String(hexRaw || '#2c5282').replace('#', '').trim()
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  const valid = /^[0-9a-fA-F]{6}$/.test(full)
  const n = Number.parseInt(valid ? full : '2c5282', 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

function fmtEuro(n: number) {
  return n.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function kindLabel(kind: string): string {
  return kind === 'OTHER' ? 'Cobro adicional' : 'Cuota / membresía'
}

type FiscalDraft = {
  tradeName: string
  razonSocial: string
  taxLine: string
  addressLines: string[]
  contactLine: string | null
  taxIncomplete: boolean
  addressIncomplete: boolean
}

function fiscalDraft(issuer: InvoicePdfInput['issuer'] | undefined): FiscalDraft {
  const tradeName = issuer?.name?.trim() || 'Emisor'
  const razonSocial = issuer?.legalName?.trim() || tradeName
  const tid = issuer?.taxId?.trim()
  const taxIncomplete = !tid
  const taxLine = tid ? tid : `${PLACEHOLDER} Pendiente ${PLACEHOLDER}`
  let addressLines =
    issuer?.addressLines?.map((x) => x.trim()).filter(Boolean) ?? []
  const addressIncomplete = addressLines.length === 0
  if (addressIncomplete) {
    addressLines = [`${PLACEHOLDER} Domicilio fiscal (Configuración del club) ${PLACEHOLDER}`]
  }
  const contactBits = [
    issuer?.contactEmail?.trim() || null,
    issuer?.contactPhone?.trim() || null,
    issuer?.website?.trim() || null,
  ].filter(Boolean) as string[]
  const contactLine = contactBits.length > 0 ? contactBits.join('  ·  ') : null
  return {
    tradeName,
    razonSocial,
    taxLine,
    addressLines,
    contactLine,
    taxIncomplete,
    addressIncomplete,
  }
}

type DrawCtx = {
  page: PDFPage
  font: PDFFont
  fontBold: PDFFont
  left: number
  right: number
  gray: ReturnType<typeof rgb>
}

function wrapLines(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    const wwid = font.widthOfTextAtSize(next, size)
    if (wwid <= maxW) cur = next
    else if (cur) {
      lines.push(cur)
      cur = w
    } else lines.push(w)
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

function drawFiscalCard(ctx: DrawCtx, yTop: number, draft: FiscalDraft): number {
  const { page, font, fontBold, left, right, gray } = ctx
  const pad = 8
  const title = 'Datos fiscales del emisor (configuraci\u00F3n del administrador)'
  let y = yTop - 14
  page.drawText(title, {
    x: left,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.18),
  })
  y -= 13
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 0.55,
    color: gray,
  })
  y -= 10
  page.drawText('Nombre comercial', { x: left, y, size: 8, font, color: gray })
  y -= 12
  page.drawText(draft.tradeName, {
    x: left,
    y,
    size: 10,
    font: fontBold,
    color: rgb(0.09, 0.09, 0.11),
  })
  y -= pad + 6
  page.drawText('Raz\u00F3n social', { x: left, y, size: 8, font, color: gray })
  y -= 12
  for (const ln of wrapLines(fontBold, draft.razonSocial, 11, right - left)) {
    page.drawText(ln, { x: left, y, size: 11, font: fontBold, color: rgb(0.09, 0.09, 0.11) })
    y -= 13
  }
  page.drawText('Identificaci\u00F3n fiscal (NIF / CIF / VAT)', {
    x: left,
    y,
    size: 8,
    font,
    color: draft.taxIncomplete ? rgb(0.78, 0.38, 0.06) : gray,
  })
  y -= 12
  page.drawText(draft.taxLine, {
    x: left,
    y,
    size: 11,
    font: fontBold,
    color: draft.taxIncomplete ? rgb(0.78, 0.38, 0.06) : rgb(0.09, 0.09, 0.11),
  })
  y -= pad + 4
  page.drawText('Domicilio fiscal', {
    x: left,
    y,
    size: 8,
    font,
    color: draft.addressIncomplete ? rgb(0.78, 0.38, 0.06) : gray,
  })
  y -= 12
  for (const al of draft.addressLines) {
    page.drawText(al, {
      x: left,
      y,
      size: 10,
      font,
      color: draft.addressIncomplete ? rgb(0.78, 0.38, 0.06) : rgb(0.12, 0.12, 0.15),
    })
    y -= 12
  }
  if (draft.contactLine) {
    y -= 6
    page.drawText(`Contacto: ${draft.contactLine}`, {
      x: left,
      y,
      size: 9,
      font,
      color: gray,
    })
    y -= 13
  }
  return y
}

function totalsBlock(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  left: number,
  gray: ReturnType<typeof rgb>,
  y: number,
  data: InvoicePdfInput,
) {
  page.drawText(`Base imponible   ${fmtEuro(data.subtotal)} ${data.currency}`, {
    x: left,
    y,
    size: 10,
    font,
    color: gray,
  })
  let yy = y - 13
  if (data.taxAmount > 0) {
    page.drawText(`Cuota tributaria / IVA    ${fmtEuro(data.taxAmount)} ${data.currency}`, {
      x: left,
      y: yy,
      size: 10,
      font,
      color: gray,
    })
    yy -= 13
  }
  // La retención no se guarda como campo: es lo que falta para que la base más
  // el impuesto den el total. Sin imprimirla, el PDF enseñaba «Base 100 + IVA 21
  // = TOTAL 106» y no había forma de cuadrarlo leyéndolo.
  const retencion = Number((data.subtotal + data.taxAmount - data.totalAmount).toFixed(2))
  if (retencion > 0.005) {
    page.drawText(`Retención    -${fmtEuro(retencion)} ${data.currency}`, {
      x: left,
      y: yy,
      size: 10,
      font,
      color: gray,
    })
    yy -= 13
  }
  page.drawText(`TOTAL   ${fmtEuro(data.totalAmount)} ${data.currency}`, {
    x: left,
    y: yy,
    size: 13,
    font: fontBold,
    color: rgb(0.08, 0.08, 0.1),
  })
  yy -= 14
  page.drawText(`Pagado    ${fmtEuro(data.paidAmount)} ${data.currency}`, {
    x: left,
    y: yy,
    size: 11,
    font,
    color: gray,
  })
  yy -= 12
  const pendiente = Math.max(0, data.totalAmount - data.paidAmount)
  page.drawText(`Pendiente    ${fmtEuro(pendiente)} ${data.currency}`, {
    x: left,
    y: yy,
    size: 12,
    font: fontBold,
    color:
      pendiente > 0.005 ? rgb(0.73, 0.18, 0.12) : rgb(0.12, 0.55, 0.35),
  })
  yy -= 22
  page.drawText('Documento generado electr\u00F3nicamente seg\u00FAn configuraci\u00F3n fiscal del club.', {
    x: left,
    y: yy,
    size: 8,
    font,
    color: gray,
  })
  return yy
}

async function layoutClassic(data: InvoicePdfInput, draft: FiscalDraft): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const left = 50
  const right = 595.28 - left
  const gray = rgb(0.45, 0.45, 0.48)

  let y = 800
  page.drawText('FACTURA', { x: left, y, size: 20, font: fontBold, color: rgb(0.08, 0.08, 0.1) })
  y -= 26
  page.drawText(`N\u00BA ${data.invoiceNumber}`, { x: left, y, size: 12, font: fontBold, color: gray })
  page.drawText(kindLabel(data.kind), { x: left + 200, y, size: 12, font, color: gray })
  y -= 22

  y = drawFiscalCard({ page, font, fontBold, left, right, gray }, y, draft)
  y -= 16

  page.drawText('Cliente / socio', {
    x: left,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.18),
  })
  y -= 13
  page.drawText(data.member.name, { x: left, y, size: 11, font, color: rgb(0.1, 0.1, 0.12) })
  y -= 12
  if (data.member.dni) {
    page.drawText(`DNI/NIE: ${data.member.dni}`, { x: left, y, size: 10, font, color: gray })
    y -= 12
  }
  if (data.member.email) {
    page.drawText(data.member.email, { x: left, y, size: 10, font, color: gray })
    y -= 12
  }
  if (data.member.address) {
    for (const line of wrapLines(font, data.member.address, 10, right - left)) {
      page.drawText(line, { x: left, y, size: 10, font, color: gray })
      y -= 12
    }
  }
  y -= 8
  page.drawText(`Emisi\u00F3n: ${data.issueDate.toLocaleDateString('es-ES')}`, {
    x: left,
    y,
    size: 10,
    font,
    color: gray,
  })
  page.drawText(`Vencimiento: ${data.dueDate.toLocaleDateString('es-ES')}`, {
    x: left + 200,
    y,
    size: 10,
    font,
    color: gray,
  })
  y -= 18

  page.drawText('Detalle', { x: left, y, size: 12, font: fontBold, color: rgb(0.15, 0.15, 0.18) })
  y -= 12
  for (const item of data.items) {
    const txt = `${item.description} \u00B7 ${item.quantity} \u00D7 ${fmtEuro(item.unitAmount)} ${data.currency} = ${fmtEuro(item.totalAmount)} ${data.currency}`
    for (const ln of wrapLines(font, txt, 10, right - left)) {
      page.drawText(ln, { x: left, y, size: 10, font })
      y -= 12
    }
    y -= 4
  }
  y -= 10
  totalsBlock(page, font, fontBold, left, gray, y, data)
  return pdf.save()
}

async function layoutModern(data: InvoicePdfInput, draft: FiscalDraft, accent: ReturnType<typeof rgb>) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const left = 50
  const right = 595.28 - left
  const barH = 56
  const gray = rgb(0.52, 0.52, 0.54)
  const white = rgb(1, 1, 1)
  const h = 841.89

  page.drawRectangle({ x: 0, y: h - barH, width: 595.28, height: barH, color: accent })
  const titleFactura = 'FACTURA'
  const titleW = fontBold.widthOfTextAtSize(titleFactura, 22)
  page.drawText(titleFactura, {
    x: right - titleW,
    y: h - barH + 32,
    size: 22,
    font: fontBold,
    color: white,
  })
  page.drawText(draft.tradeName, {
    x: left,
    y: h - barH + 34,
    size: 16,
    font: fontBold,
    color: white,
  })

  page.drawText(data.invoiceNumber, {
    x: right - fontBold.widthOfTextAtSize(data.invoiceNumber, 11),
    y: h - barH + 14,
    size: 11,
    font,
    color: white,
  })

  let y = h - barH - 22
  /** Columna datos documento */
  const boxTop = y
  const boxH = 100
  const boxBottom = boxTop - boxH
  const split = left + 245
  page.drawRectangle({
    x: left,
    y: boxBottom,
    width: split - left - 6,
    height: boxH,
    borderColor: gray,
    borderWidth: 0.6,
    color: rgb(0.99, 0.99, 0.993),
  })
  page.drawText('Documento', { x: left + 10, y: boxTop - 18, font: fontBold, size: 10, color: gray })
  let yd = boxTop - 34
  page.drawText(`Tipo   ${kindLabel(data.kind)}`, { x: left + 10, y: yd, font, size: 9 })
  yd -= 13
  page.drawText(`Emisi\u00F3n   ${data.issueDate.toLocaleDateString('es-ES')}`, {
    x: left + 10,
    y: yd,
    font,
    size: 9,
  })
  yd -= 13
  page.drawText(`Vencimiento   ${data.dueDate.toLocaleDateString('es-ES')}`, {
    x: left + 10,
    y: yd,
    font,
    size: 9,
  })

  page.drawRectangle({
    x: split,
    y: boxBottom,
    width: right - split,
    height: boxH,
    borderColor: accent,
    borderWidth: 1,
    color: rgb(0.994, 0.996, 1),
  })
  let fy = boxTop - 16
  page.drawText('Emisor fiscal', { x: split + 10, y: fy, font: fontBold, size: 10, color: accent })
  fy -= 14
  for (const ln of wrapLines(fontBold, draft.razonSocial, 9.5, right - split - 20)) {
    page.drawText(ln, {
      x: split + 10,
      y: fy,
      font,
      size: 9,
      color: rgb(0.12, 0.12, 0.14),
    })
    fy -= 11
  }
  page.drawText(`${draft.taxLine}`, {
    x: split + 10,
    y: fy,
    font: fontBold,
    size: 9,
    color: draft.taxIncomplete ? rgb(0.78, 0.38, 0.06) : rgb(0.1, 0.1, 0.12),
  })
  fy -= 12
  for (const line of draft.addressLines.slice(0, 3)) {
    page.drawText(line, {
      x: split + 10,
      y: fy,
      font,
      size: 8,
      color: rgb(0.35, 0.35, 0.37),
    })
    fy -= 10
  }
  if (draft.contactLine) {
    fy -= 2
    for (const ln of wrapLines(font, draft.contactLine, 8, right - split - 20)) {
      page.drawText(ln, {
        x: split + 10,
        y: fy,
        font,
        size: 8,
        color: gray,
      })
      fy -= 9
    }
  }

  y = boxBottom - 24
  page.drawText('Cliente / socio', { x: left, y, font: fontBold, size: 11, color: gray })
  y -= 14
  page.drawText(data.member.name, { x: left, y, font, size: 10 })
  y -= 12
  if (data.member.dni) {
    page.drawText(`DNI/NIE   ${data.member.dni}`, { x: left, y, font, size: 9, color: gray })
    y -= 11
  }
  if (data.member.email) {
    page.drawText(data.member.email, { x: left, y, font, size: 9, color: gray })
    y -= 11
  }
  if (data.member.address) {
    for (const ln of wrapLines(font, data.member.address, 9, right - left)) {
      page.drawText(ln, { x: left, y, font, size: 9, color: gray })
      y -= 11
    }
  }
  y -= 10
  page.drawText('Conceptos', { x: left, y, font: fontBold, size: 11, color: gray })
  y -= 12
  for (const item of data.items) {
    const txt = `${item.description} \u2014 ${item.quantity} x ${fmtEuro(item.unitAmount)} = ${fmtEuro(item.totalAmount)} ${data.currency}`
    for (const ln of wrapLines(font, txt, 9.5, right - left)) {
      page.drawText(ln, { x: left, y, font, size: 9.5 })
      y -= 12
    }
    y -= 2
  }
  y -= 8
  totalsBlock(page, font, fontBold, left, gray, y, data)
  return pdf.save()
}

async function layoutCompact(data: InvoicePdfInput, draft: FiscalDraft): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const left = 44
  const right = 595.28 - left
  const gray = rgb(0.52, 0.52, 0.54)
  let y = 812

  page.drawText('FACTURA (compacto)', {
    x: left,
    y,
    font: fontBold,
    size: 14,
    color: rgb(0.06, 0.06, 0.07),
  })
  page.drawText(data.invoiceNumber, {
    x: right - fontBold.widthOfTextAtSize(data.invoiceNumber, 11),
    y: y + 4,
    font: fontBold,
    size: 11,
    color: gray,
  })
  y -= 20
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: rgb(0.86, 0.87, 0.89) })
  y -= 10

  y = drawFiscalCard({ page, font, fontBold, left, right, gray }, y, draft)
  y -= 14

  page.drawText('Cliente', {
    x: left,
    y,
    size: 9,
    font: fontBold,
    color: gray,
  })
  y -= 14
  const clientLine =
    `${data.member.name}${data.member.dni ? ` · ${data.member.dni}` : ''}` +
    `${data.member.email ? ` · ${data.member.email}` : ''}`
  page.drawText(clientLine.slice(0, 120), { x: left, y, font, size: 9 })
  y -= 20
  page.drawText(`${kindLabel(data.kind)} · emisi\u00F3n ${data.issueDate.toLocaleDateString('es-ES')} · vencimiento ${data.dueDate.toLocaleDateString('es-ES')}`, {
    x: left,
    y,
    font,
    size: 8,
    color: gray,
  })
  y -= 22
  /** Tabla líneas simple */
  page.drawText('Descripci\u00F3n', {
    x: left,
    y,
    font: fontBold,
    size: 8,
    color: gray,
  })
  page.drawText('Cant.', {
    x: left + 300,
    y,
    font: fontBold,
    size: 8,
    color: gray,
  })
  page.drawText('Importe', {
    x: right - 70,
    y,
    font: fontBold,
    size: 8,
    color: gray,
  })
  page.drawLine({ start: { x: left, y: y - 3 }, end: { x: right, y: y - 3 }, thickness: 0.4, color: gray })
  y -= 14
  for (const item of data.items) {
    const descLines = wrapLines(font, item.description, 8, 266)
    const amt = `${fmtEuro(item.totalAmount)} ${data.currency}`
    let lineY = y

    page.drawText(String(item.quantity), { x: left + 294, y: lineY, font, size: 8 })
    page.drawText(amt, {
      x: right - font.widthOfTextAtSize(amt, 8),
      y: lineY,
      font,
      size: 8,
    })
    if (descLines.length === 0) {
      page.drawText('(sin descripci\u00F3n)', { x: left, y: lineY, font, size: 8 })
      y = lineY - 16
    } else {
      page.drawText(descLines[0]!, { x: left, y: lineY, font, size: 8 })
      lineY -= 10
      for (let i = 1; i < descLines.length; i++) {
        page.drawText(descLines[i]!, { x: left, y: lineY, font, size: 8 })
        lineY -= 10
      }
      y = lineY - 6
    }
    if (y < 220) break
  }

  y -= 12
  totalsBlock(page, font, fontBold, left, gray, y, data)
  return pdf.save()
}

export async function buildInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const draft = fiscalDraft(input.issuer)
  const tmpl = normalizeInvoicePdfTemplate(
    typeof input.template === 'string' ? input.template : '',
  )
  const accent = hexToRgb(input.primaryColor)
  if (tmpl === 'MODERN') return layoutModern(input, draft, accent)
  if (tmpl === 'COMPACT') return layoutCompact(input, draft)
  return layoutClassic(input, draft)
}
