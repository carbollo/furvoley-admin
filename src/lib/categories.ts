/**
 * Categorías deportivas basadas en EDAD (no en año de nacimiento fijo).
 * Al estar definidas por edad mínima/máxima, el rango de años de nacimiento
 * se recalcula solo cada temporada: no hay que reeditar nada al cambiar de año.
 */

export type CategoryRule = {
  id: string
  name: string
  minAge: number | null
  maxAge: number | null
  defaultGroupId?: string | null
  isActive?: boolean
}

/** Edad cumplida a partir de una fecha de nacimiento, respecto a `ref` (hoy por defecto). */
export function ageFromBirthDate(birthDate: Date, ref: Date = new Date()): number {
  let age = ref.getFullYear() - birthDate.getFullYear()
  const monthDiff = ref.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birthDate.getDate())) {
    age--
  }
  return age
}

/**
 * Rango de AÑOS DE NACIMIENTO que cubre la categoría esta temporada.
 * Ej.: minAge 12 / maxAge 13 en 2026 → nacidos entre 2013 (13) y 2014 (12).
 */
export function categoryBirthYearWindow(
  rule: Pick<CategoryRule, 'minAge' | 'maxAge'>,
  ref: Date = new Date(),
): { fromYear: number | null; toYear: number | null } {
  const currentYear = ref.getFullYear()
  // edad máxima → año de nacimiento más antiguo; edad mínima → año más reciente
  const fromYear = rule.maxAge != null ? currentYear - rule.maxAge : null
  const toYear = rule.minAge != null ? currentYear - rule.minAge : null
  return { fromYear, toYear }
}

/** ¿Una edad encaja en la categoría? */
export function ageMatchesCategory(age: number, rule: Pick<CategoryRule, 'minAge' | 'maxAge'>): boolean {
  if (rule.minAge != null && age < rule.minAge) return false
  if (rule.maxAge != null && age > rule.maxAge) return false
  return true
}

/** Primera categoría activa cuyo rango de edad encaja con la fecha de nacimiento. */
export function matchCategoryForBirthDate(
  categories: CategoryRule[],
  birthDate: Date,
  ref: Date = new Date(),
): CategoryRule | null {
  const age = ageFromBirthDate(birthDate, ref)
  for (const c of categories) {
    if (c.isActive === false) continue
    if (ageMatchesCategory(age, c)) return c
  }
  return null
}
