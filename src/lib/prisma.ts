import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Seguridad SQL: no usar $queryRawUnsafe ni $executeRawUnsafe.
 * SQL nativo solo vía Prisma.$queryRaw(Prisma.sql`...`) con placeholders ${param}.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
})

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
