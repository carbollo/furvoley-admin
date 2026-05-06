import { prisma } from '@/lib/prisma'

export async function getTaxConfig() {
  return prisma.taxConfig.upsert({
    where: { isDefault: true },
    update: {},
    create: {
      isDefault: true,
      vatRateIncome: 21,
      vatRateExpense: 21,
      applyOnInvoices: true,
      applyOnIncome: true,
      applyOnExpense: true,
    },
  })
}
