"use client"
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import useUser from '@/hooks/useUser'

export default function UserMenu() {
  const { user, role, isAdmin, logout } = useUser()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!user) return null

  const name = user.user_metadata?.full_name || user.email || ''
  const parts = name.trim().split(/\s+/)
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0])
    : name.slice(0, 2)

  return (
    <div className="relative" ref={ref}>
      <button
        className="w-8 h-8 rounded-full bg-sky-600 text-white flex items-center justify-center font-semibold"
        onClick={() => setOpen(v => !v)}
        aria-label="Menu użytkownika"
      >
        {initials.toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-slate-100 p-2 z-[200]">
          <p className="text-xs text-slate-500 px-2 pb-2 border-b border-slate-100 mb-1">
            {user.email}<br/>
            <span className="font-medium text-slate-600">{role}</span>
          </p>
          <Link href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 text-slate-700 rounded-lg text-sm">
            👤 Profil
          </Link>
          <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 text-slate-700 rounded-lg text-sm">
            ⚙️ Ustawienia
          </Link>          
          {isAdmin && (
            <Link href="/admin/users" onClick={() => setOpen(false)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 text-sky-600 rounded-lg text-sm">
              🛡️ Użytkownicy
            </Link>
          )}
          <hr className="my-1 border-slate-100" />
          <button
            onClick={() => { setOpen(false); logout() }}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 hover:bg-red-50 rounded-lg text-red-600 text-sm"
          >
            🚪 Wyloguj
          </button>
        </div>
      )}
    </div>
  )
}
