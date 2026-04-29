import './crm-vars.css'
import { Plus_Jakarta_Sans } from 'next/font/google'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
})

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${plusJakarta.className} min-h-screen w-full bg-[#F8F7F5] text-[#1a1a1a]`}
    >
      {children}
    </div>
  )
}
