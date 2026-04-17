import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { redirect } from 'next/navigation'
import { submitSignupFromLink } from '@/app/actions/signup-links'
import { AutoCloseNotice } from './AutoCloseNotice'

export const dynamic = 'force-dynamic'

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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-xl bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-emerald-700 mb-2">Gracias por unirte al club</h1>
          <p className="text-slate-600">
            Tu inscripción se ha enviado correctamente. En breve revisaremos tus datos.
          </p>
          <AutoCloseNotice />
        </div>
      </div>
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

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h1 className="text-2xl font-bold mb-2">Inscripción de socio</h1>
        <p className="text-slate-600 mb-6">Completa tus datos para inscribirte como socio del club.</p>

        {unavailable ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-4">
            Este enlace no está disponible (caducado o ya utilizado).
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre y apellidos</label>
              <input name="name" required className="w-full border rounded-lg px-3 py-2 text-slate-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">DNI</label>
              <input name="dni" required className="w-full border rounded-lg px-3 py-2 text-slate-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de nacimiento</label>
              <input type="date" name="birthDate" required className="w-full border rounded-lg px-3 py-2 text-slate-900" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                <input name="phone" className="w-full border rounded-lg px-3 py-2 text-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input type="email" name="email" className="w-full border rounded-lg px-3 py-2 text-slate-900" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Domicilio</label>
              <input name="address" className="w-full border rounded-lg px-3 py-2 text-slate-900" />
            </div>
            <button className="w-full bg-blue-600 text-white rounded-lg py-2 font-medium">Enviar inscripción</button>
          </form>
        )}
      </div>
    </div>
  )
}

