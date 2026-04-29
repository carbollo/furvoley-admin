import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { redirect } from 'next/navigation'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { submitSignupFromLink } from '@/app/actions/signup-links'
import { AutoCloseNotice } from './AutoCloseNotice'
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
              className="text-[1.625rem] font-extrabold tracking-tight text-[#111827] mb-2"
              style={{ letterSpacing: '-0.5px' }}
            >
              {title}
            </h1>
            {subtitle ? (
              <p className="text-[15px] text-[#6b7280] mb-8 leading-relaxed">{subtitle}</p>
            ) : null}
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border px-4 py-3 text-[15px] text-[#111827] placeholder:text-neutral-400 outline-none transition-[box-shadow,border-color] focus:ring-2 focus:ring-[oklch(0.62_0.14_240_/_0.35)] bg-white'
const labelCls = 'block text-[13px] font-semibold tracking-wide text-[#64748b] mb-2'

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ success?: string }>
}) {
  const { token } = await params
  const { success } = await searchParams

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

  async function action(formData: FormData) {
    'use server'
    const tokenValue = String(formData.get('token'))
    const name = String(formData.get('name') || '').trim()
    const dni = String(formData.get('dni') || '').trim()
    const birthDate = String(formData.get('birthDate') || '').trim()
    const phone = String(formData.get('phone') || '').trim()
    const email = String(formData.get('email') || '').trim()
    const address = String(formData.get('address') || '').trim()

    await submitSignupFromLink({
      token: tokenValue,
      name,
      dni,
      birthDate,
      phone,
      email,
      address,
    })
    redirect(`/join/${tokenValue}?success=1`)
  }

  const borderInput = '1px solid rgba(0, 0, 0, 0.1)'

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
        <form action={action} className="space-y-5">
          <input type="hidden" name="token" value={token} />
          <div>
            <label className={labelCls}>Nombre y apellidos</label>
            <input name="name" required className={inputCls} style={{ border: borderInput }} />
          </div>
          <div>
            <label className={labelCls}>DNI</label>
            <input name="dni" required className={inputCls} style={{ border: borderInput }} />
          </div>
          <div>
            <label className={labelCls}>Fecha de nacimiento</label>
            <input type="date" name="birthDate" required className={inputCls} style={{ border: borderInput }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="min-w-0">
              <label className={labelCls}>Teléfono</label>
              <input name="phone" className={inputCls} style={{ border: borderInput }} />
            </div>
            <div className="min-w-0">
              <label className={labelCls}>Email</label>
              <input type="email" name="email" className={inputCls} style={{ border: borderInput }} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Domicilio</label>
            <input name="address" className={inputCls} style={{ border: borderInput }} />
          </div>
          <button
            type="submit"
            className="mt-4 w-full rounded-xl py-3.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-95 active:opacity-90"
            style={{ background: 'oklch(0.52 0.18 240)', boxShadow: '0 1px 2px rgba(37,99,235,0.22)' }}
          >
            Enviar inscripción
          </button>
        </form>
      )}
    </Shell>
  )
}
