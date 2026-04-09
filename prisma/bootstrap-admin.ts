import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is required')
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@furvoley.com'
  const adminPasswordRaw = process.env.ADMIN_PASSWORD || 'admin123'
  const adminPassword = await bcrypt.hash(adminPasswordRaw, 10)

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: 'ADMIN',
      password: adminPassword,
      name: 'Administrador',
    },
    create: {
      name: 'Administrador',
      email: adminEmail,
      password: adminPassword,
      role: 'ADMIN',
    },
  })

  console.log(`Admin ready: ${adminEmail}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

