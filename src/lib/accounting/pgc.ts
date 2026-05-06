import { prisma } from '@/lib/prisma'

export const BASE_PGC_ACCOUNTS = [
  { code: '5700000', name: 'Caja, euros', level: 3, nature: 'ASSET' },
  { code: '5720000', name: 'Bancos c/c', level: 3, nature: 'ASSET' },
  { code: '4300000', name: 'Clientes', level: 3, nature: 'ASSET' },
  { code: '7000000', name: 'Ventas y servicios', level: 3, nature: 'INCOME' },
  { code: '7050000', name: 'Prestaciones de servicios', level: 3, nature: 'INCOME' },
  { code: '6000000', name: 'Compras', level: 3, nature: 'EXPENSE' },
  { code: '6290000', name: 'Otros servicios', level: 3, nature: 'EXPENSE' },
  { code: '6400000', name: 'Sueldos y salarios', level: 3, nature: 'EXPENSE' },
  { code: '4720000', name: 'HP IVA soportado', level: 3, nature: 'ASSET' },
  { code: '4751000', name: 'HP acreedora por retenciones', level: 3, nature: 'LIABILITY' },
  { code: '4770000', name: 'HP IVA repercutido', level: 3, nature: 'LIABILITY' },
] as const

export async function ensureBasePgcAccounts() {
  for (const a of BASE_PGC_ACCOUNTS) {
    await prisma.accountChart.upsert({
      where: { code: a.code },
      update: { name: a.name, level: a.level, nature: a.nature, isActive: true },
      create: {
        code: a.code,
        name: a.name,
        level: a.level,
        nature: a.nature,
        isActive: true,
      },
    })
  }
}
