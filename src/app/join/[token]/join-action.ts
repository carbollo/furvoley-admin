import { getRegistrationFieldsConfig } from '@/lib/club-settings'
import { isHexToken } from '@/lib/db-input-validation'
import {
  mapRegistrationToMemberData,
  registrationValuesFromFormData,
  validateRegistrationSubmission,
} from '@/lib/registration-fields'
import { submitSignupFromLink } from '@/app/actions/signup-links'
import { runWithTenant } from '@/lib/multitenant/request'

export async function processJoinSignup(formData: FormData) {
  // /join está EXCLUIDO del middleware, y los server actions se ejecutan en una
  // petición aparte del render de la página, así que el tenant NO está activo aquí.
  // Lo activamos por host con runWithTenant (igual que createEvent/deleteEvent);
  // sin esto, prisma se ejecuta sin tenant y con TENANT_STRICT lanza.
  return runWithTenant(async () => {
    const tokenRaw = String(formData.get('token') || '').trim()
    if (!isHexToken(tokenRaw)) {
      throw new Error('Enlace no válido')
    }
    const token = tokenRaw
    const config = await getRegistrationFieldsConfig()
    const values = registrationValuesFromFormData(formData, config)
    const errors = validateRegistrationSubmission(values, config)
    const firstError = Object.values(errors)[0]
    if (firstError) {
      throw new Error(firstError)
    }
    const memberData = mapRegistrationToMemberData(values, config)
    if (!memberData.name) {
      throw new Error('Indica nombre y/o apellidos')
    }
    await submitSignupFromLink({
      token,
      ...memberData,
    })
  })
}
