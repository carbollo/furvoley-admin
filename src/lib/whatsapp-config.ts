import { prisma } from '@/lib/prisma'

export async function getWhatsAppConfig() {
  return prisma.whatsAppConfig.upsert({
    where: { isDefault: true },
    update: {},
    create: { isDefault: true, linkedSessionId: null },
  })
}

export async function setLinkedWhatsAppSessionId(sessionId: string | null) {
  return prisma.whatsAppConfig.upsert({
    where: { isDefault: true },
    update: { linkedSessionId: sessionId },
    create: { isDefault: true, linkedSessionId: sessionId },
  })
}
