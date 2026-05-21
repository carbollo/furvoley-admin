import { getRegistrationFieldsConfig } from '@/lib/club-settings'
import {
  mapRegistrationToMemberData,
  registrationValuesFromFormData,
  validateRegistrationSubmission,
} from '@/lib/registration-fields'
import { submitSignupFromLink } from '@/app/actions/signup-links'

export async function processJoinSignup(formData: FormData) {
  const token = String(formData.get('token') || '').trim()
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
}
