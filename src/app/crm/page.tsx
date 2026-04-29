import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { Suspense } from 'react'
import CrmApp from '@/components/crm/CrmApp'

export default async function CrmPage() {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/login?callbackUrl=/crm')
  }
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    redirect('/')
  }
  return (
    <Suspense fallback={<div className="p-8 text-slate-600">Cargando CRM…</div>}>
      <CrmApp />
    </Suspense>
  )
}
