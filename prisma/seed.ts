import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is required for seeding')
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  const adminEmail = 'admin@furvoley.com'
  const adminPassword = await bcrypt.hash('admin123', 10)

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail }
  })

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: 'Administrador',
        email: adminEmail,
        password: adminPassword,
        role: 'ADMIN'
      }
    })
    console.log('Admin user created: admin@furvoley.com / admin123')
  } else {
    console.log('Admin user already exists')
  }

  await prisma.user.updateMany({
    where: { role: 'PLAYER' },
    data: { role: 'MEMBER' },
  })

  const { ensureDefaultWorkflows } = await import('../src/lib/ensure-default-workflows')
  const wf = await ensureDefaultWorkflows()
  if (wf.wd1.created) {
    console.log('WD-1 workflow created:', wf.wd1.id)
  } else {
    console.log('WD-1 workflow already present')
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
