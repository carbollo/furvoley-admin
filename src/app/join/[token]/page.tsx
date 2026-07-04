import { prisma } from '@/lib/prisma'
import { runWithTenant } from '@/lib/multitenant/request'
import { notFound } from 'next/navigation'
import { redirect } from 'next/navigation'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { AutoCloseNotice } from './AutoCloseNotice'
import { JoinSignupForm } from './JoinSignupForm'
import { processJoinSignup } from './join-action'
import { getRegistrationFieldsConfig } from '@/lib/club-settings'
import { getEnabledRegistrationFields } from '@/lib/registration-fields'
import { isHexToken } from '@/lib/db-input-validation'
import '@/components/crm/crm-vars.css'

const fontJoin = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
})

export const dynamic = 'force-dynamic'

function Shell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode
  title: string
  subtitle?: React.ReactNode
}) {
  return (
    <div
      className={`fixed inset-0 z-[1] overflow-y-auto overflow-x-hidden ${fontJoin.className}`}
      style={{ background: '#F8F7F5' }}
    >
      <div className="flex min-h-[100dvh] w-full flex-col justify-center px-4 py-10 sm:px-6">
        <div className="mx-auto w-full max-w-xl shrink-0">
          <div
            className="rounded-2xl border bg-white px-8 py-10 md:px-10 md:py-12 w-full"
            style={{
              boxShadow:
                '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
              borderColor: 'rgba(0, 0, 0, 0.07)',
            }}
          >
            <h1
              className="text-[1.625rem] font-extrabold tracking-tight text-[#1c1917] mb-2"
              style={{ letterSpacing: '-0.5px' }}
            >
              {title}
            </h1>
            {subtitle ? (
              <p className="text-[15px] text-[#8c857d] mb-8 leading-relaxed">{subtitle}</p>
            ) : null}
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export default async function JoinPage(props: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ success?: string }>
}) {
  return runWithTenant(() => JoinPageImpl(props))
}

async function JoinPageImpl({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ success?: string }>
}) {
  const { token } = await params
  const { success } = await searchParams
  if (!isHexToken(token)) notFound()

  const link = await prisma.signupLink.findUnique({ where: { token } })
  if (!link) notFound()

  if (success === '1') {
    return (
      <Shell
        title="¡Inscripción recibida!"
        subtitle="Tu inscripción se ha enviado correctamente. En breve revisaremos tus datos."
      >
        <AutoCloseNotice />
      </Shell>
    )
  }

  const expired = !!(link.expiresAt && link.expiresAt < new Date())
  const unavailable = !link.isActive || expired || link.usesCount >= link.maxUses
  const registrationConfig = await getRegistrationFieldsConfig()
  const registrationFields = getEnabledRegistrationFields(registrationConfig)

  async function action(formData: FormData) {
    'use server'
    const tokenValue = String(formData.get('token'))
    await processJoinSignup(formData)
    redirect(`/join/${tokenValue}?success=1`)
  }

  return (
    <Shell
      title="Inscripción de socio"
      subtitle="Completa tus datos para inscribirte como socio del club."
    >
      {unavailable ? (
        <div
          className="rounded-xl px-5 py-4 text-[15px] font-medium leading-relaxed"
          style={{
            background: 'oklch(0.97 0.04 22)',
            color: '#b91c1c',
            border: '1px solid rgba(185,28,28,0.2)',
          }}
        >
          Este enlace no está disponible (caducado o ya utilizado).
        </div>
      ) : (
        <JoinSignupForm token={token} fields={registrationFields} action={action} />
      )}
    </Shell>
  )
}
