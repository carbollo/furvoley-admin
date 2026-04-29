import { AppShell } from '@/components/AppShell'

export default function PanelLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <AppShell>{children}</AppShell>
}
