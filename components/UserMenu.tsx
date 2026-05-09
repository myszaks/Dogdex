"use client"
import { useState } from 'react'
import useUser from '@/hooks/useUser'

export default function UserMenu() {
  const { user, role, isAdmin, logout } = useUser()
  const [open, setOpen] = useState(false)

  if (!user) return null

  const name = user.user_metadata?.full_name || user.email || ''
  const parts = name.trim().split(/\s+/)
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0])
    : name.slice(0, 2)

  return (
    <div className="relative">
      <button
        className="w-8 h-8 rounded-full bg-sky-600 text-white flex items-center justify-center font-semibold"
        onClick={() => setOpen(v => !v)}
      >
        {initials.toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded shadow p-2">
          <p className="text-xs text-slate-500 px-2 pb-1 border-b border-slate-100 mb-1">
            {user.email}<br/>
            <span className="font-medium text-slate-600">{role}</span>
          </p>
          <a href="/profile" className="block px-2 py-1 hover:bg-slate-100 text-black rounded">Profil</a>
          <a href="/settings" className="block px-2 py-1 hover:bg-slate-100 text-black rounded">Ustawienia</a>
          {isAdmin && (
            <a href="/admin/users" className="block px-2 py-1 hover:bg-slate-100 rounded text-sky-600">
              👥 Użytkownicy
            </a>
          )}
          <hr className="my-1 border-slate-100" />
          <button
            onClick={() => logout()}
            className="w-full text-left px-2 py-1 hover:bg-slate-100 rounded text-red-600"
          >
            Wyloguj
          </button>
        </div>
      )}
    </div>
  )
}
