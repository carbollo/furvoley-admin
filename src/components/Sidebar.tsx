import Link from 'next/link'
import { Users, CreditCard, Calculator, Home } from 'lucide-react'

export function Sidebar() {
  return (
    <div className="w-64 bg-slate-900 text-white min-h-screen p-4 flex flex-col">
      <div className="text-2xl font-bold mb-8 text-center text-blue-400">Furvoley Admin</div>
      <nav className="flex-1 space-y-2">
        <Link href="/" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
          <Home size={20} />
          <span>Dashboard</span>
        </Link>
        <Link href="/members" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
          <Users size={20} />
          <span>Socios</span>
        </Link>
        <Link href="/payments" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
          <CreditCard size={20} />
          <span>Cobros</span>
        </Link>
        <Link href="/accounting" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
          <Calculator size={20} />
          <span>Contabilidad</span>
        </Link>
      </nav>
      <div className="text-xs text-slate-500 text-center mt-auto">
        &copy; 2026 Furvoley
      </div>
    </div>
  )
}
