import { redirect } from 'next/navigation'

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/api/invoices/${id}/pdf`)
}

