'use client'

import type { RegistrationFieldDef } from '@/lib/registration-fields'
import { RegistrationFieldsForm } from '@/components/registration/RegistrationFieldsForm'

export function JoinSignupForm({
  token,
  fields,
  action,
}: {
  token: string
  fields: RegistrationFieldDef[]
  action: (formData: FormData) => void | Promise<void>
}) {
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <RegistrationFieldsForm fields={fields} variant="join" />
      <button
        type="submit"
        className="mt-4 w-full rounded-xl py-3.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-95 active:opacity-90"
        style={{ background: 'oklch(0.52 0.18 240)', boxShadow: '0 1px 2px rgba(230,65,62,0.22)' }}
      >
        Enviar inscripción
      </button>
    </form>
  )
}
