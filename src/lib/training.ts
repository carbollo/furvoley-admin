/**
 * Módulo de entrenamiento (estilo 360Player, construido con nuestro código).
 * Tipos de campo soportados por la pizarra táctica y saneado del diagrama que se
 * persiste en TrainingExercise.diagram (Json). El saneado evita guardar JSON
 * gigante o malformado que llegue por la red.
 */

export const COURT_TYPES = [
  'volleyball',
  'football',
  'futsal',
  'basketball',
  'tennis',
  'handball',
  'blank',
] as const

export type CourtType = (typeof COURT_TYPES)[number]

export const COURT_LABELS: Record<CourtType, string> = {
  volleyball: 'Voleibol',
  football: 'Fútbol',
  futsal: 'Fútbol sala',
  basketball: 'Baloncesto',
  tennis: 'Tenis',
  handball: 'Balonmano',
  blank: 'En blanco',
}

export function isCourtType(v: unknown): v is CourtType {
  return typeof v === 'string' && (COURT_TYPES as readonly string[]).includes(v)
}

export const TOKEN_KINDS = ['playerA', 'playerB', 'ball', 'cone', 'label'] as const
export type TokenKind = (typeof TOKEN_KINDS)[number]

// Límites de tamaño del diagrama (defensa: no persistir estructuras enormes).
const MAX_TOKENS = 60
const MAX_SLIDES = 40
const MAX_ID_LEN = 48
const MAX_LABEL_LEN = 40

export type DiagramToken = { id: string; kind: TokenKind; label: string }
export type DiagramSlide = { id: string; positions: Record<string, { x: number; y: number }> }
export type Diagram = {
  courtType: CourtType
  transitionMs: number
  tokens: DiagramToken[]
  slides: DiagramSlide[]
}

function clamp01(n: unknown): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0.5
  return Math.min(1, Math.max(0, v))
}

function shortStr(v: unknown, max: number): string {
  return String(v ?? '').slice(0, max)
}

/**
 * Sanea un diagrama arbitrario (de la red) a una estructura válida y acotada.
 * Devuelve null si no hay nada aprovechable (para guardar `null` en la BD).
 */
export function sanitizeDiagram(input: unknown): Diagram | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>

  const courtType: CourtType = isCourtType(raw.courtType) ? raw.courtType : 'volleyball'

  let transitionMs = Number(raw.transitionMs)
  if (!Number.isFinite(transitionMs)) transitionMs = 900
  transitionMs = Math.min(5000, Math.max(200, Math.round(transitionMs)))

  const tokensIn = Array.isArray(raw.tokens) ? raw.tokens.slice(0, MAX_TOKENS) : []
  const tokens: DiagramToken[] = []
  const validIds = new Set<string>()
  for (const t of tokensIn) {
    if (!t || typeof t !== 'object') continue
    const tk = t as Record<string, unknown>
    const id = shortStr(tk.id, MAX_ID_LEN)
    if (!id || validIds.has(id)) continue
    const kind = (TOKEN_KINDS as readonly string[]).includes(String(tk.kind))
      ? (tk.kind as TokenKind)
      : 'playerA'
    tokens.push({ id, kind, label: shortStr(tk.label, MAX_LABEL_LEN) })
    validIds.add(id)
  }

  const slidesIn = Array.isArray(raw.slides) ? raw.slides.slice(0, MAX_SLIDES) : []
  const slides: DiagramSlide[] = []
  const slideIds = new Set<string>()
  for (const s of slidesIn) {
    if (!s || typeof s !== 'object') continue
    const sl = s as Record<string, unknown>
    let id = shortStr(sl.id, MAX_ID_LEN)
    if (!id || slideIds.has(id)) id = `s${slides.length + 1}`
    slideIds.add(id)
    const positions: Record<string, { x: number; y: number }> = {}
    const posIn = sl.positions && typeof sl.positions === 'object' ? (sl.positions as Record<string, unknown>) : {}
    for (const tokenId of Object.keys(posIn)) {
      if (!validIds.has(tokenId)) continue // solo posiciones de fichas existentes
      const p = posIn[tokenId]
      if (!p || typeof p !== 'object') continue
      const pp = p as Record<string, unknown>
      positions[tokenId] = { x: clamp01(pp.x), y: clamp01(pp.y) }
    }
    slides.push({ id, positions })
  }

  if (tokens.length === 0 && slides.length === 0) {
    // Diagrama vacío: guardamos al menos el tipo de campo para conservar la elección.
    return { courtType, transitionMs, tokens: [], slides: [] }
  }

  return { courtType, transitionMs, tokens, slides }
}

/** Normaliza una lista de etiquetas separadas por coma. */
export function normalizeTags(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const tags = input
    .split(',')
    .map((t) => t.trim().slice(0, MAX_LABEL_LEN)) // acota cada etiqueta como las del diagrama
    .filter(Boolean)
    .slice(0, 12)
  return tags.length ? tags.join(', ') : null
}

/** Convierte "a, b, c" en ['a','b','c'] de forma robusta. */
export function parseTags(input: unknown): string[] {
  if (typeof input !== 'string') return []
  return input.split(',').map((t) => t.trim()).filter(Boolean)
}
