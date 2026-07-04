import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { ageFromBirthDate } from '@/lib/categories'

export const dynamic = 'force-dynamic'

const AGE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '0-7', min: 0, max: 7 },
  { label: '8-11', min: 8, max: 11 },
  { label: '12-15', min: 12, max: 15 },
  { label: '16-19', min: 16, max: 19 },
  { label: '20-29', min: 20, max: 29 },
  { label: '30+', min: 30, max: 200 },
]

/** Normaliza el género leído de los campos de registro (registrationExtra). */
function normalizeGender(raw: unknown): 'Masculino' | 'Femenino' | 'Otro' | null {
  const v = String(raw ?? '').trim().toLowerCase()
  if (!v) return null
  if (['m', 'masculino', 'hombre', 'varon', 'varón', 'chico', 'male'].includes(v)) return 'Masculino'
  if (['f', 'femenino', 'mujer', 'chica', 'female'].includes(v)) return 'Femenino'
  return 'Otro'
}

const GENDER_KEYS = ['genero', 'género', 'gender', 'sexo', 'sex']

/**
 * Datos demográficos para el dashboard de administración (roadmap · 5.1):
 * distribución por edad, género y altas por mes del año en curso.
 */
export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const members = await prisma.member.findMany({
    select: { birthDate: true, registrationExtra: true, joinedAt: true, status: true },
  })

  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1)

  const ages = AGE_BUCKETS.map((b) => ({ label: b.label, count: 0 }))
  let sinFechaNacimiento = 0
  let ageSum = 0
  let ageCount = 0
  const gender = new Map<string, number>()
  const altasPorMes: number[] = Array(12).fill(0)

  for (const m of members) {
    // Edad
    if (m.birthDate) {
      const age = ageFromBirthDate(m.birthDate, now)
      const idx = AGE_BUCKETS.findIndex((b) => age >= b.min && age <= b.max)
      if (idx >= 0) {
        ages[idx].count++
        ageSum += age
        ageCount++
      } else {
        sinFechaNacimiento++
      }
    } else {
      sinFechaNacimiento++
    }

    // Género (desde los campos personalizados del formulario de registro)
    let g: string | null = null
    const extra = m.registrationExtra as Record<string, unknown> | null
    if (extra && typeof extra === 'object') {
      for (const key of Object.keys(extra)) {
        if (GENDER_KEYS.includes(key.trim().toLowerCase())) {
          g = normalizeGender(extra[key])
          if (g) break
        }
      }
    }
    const label = g ?? 'Sin datos'
    gender.set(label, (gender.get(label) ?? 0) + 1)

    // Altas de este año
    if (m.joinedAt >= yearStart) {
      altasPorMes[m.joinedAt.getMonth()]++
    }
  }

  return NextResponse.json({
    total: members.length,
    activos: members.filter((m) => m.status === 'ACTIVE').length,
    avgAge: ageCount > 0 ? Number((ageSum / ageCount).toFixed(1)) : null,
    ages,
    sinFechaNacimiento,
    gender: [...gender.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    altasPorMes,
    altasEsteAno: altasPorMes.reduce((a, b) => a + b, 0),
  })
}
