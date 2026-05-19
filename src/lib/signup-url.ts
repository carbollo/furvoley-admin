/** URL pública `/join/{token}` para enlaces de inscripción. */
export function signupUrlFromToken(token: string, baseUrl?: string) {
  const base = (baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
    /\/+$/,
    '',
  )
  return `${base}/join/${token}`
}
