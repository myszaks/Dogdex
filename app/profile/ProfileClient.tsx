'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Props {
  email: string
  fullName: string
  company: string
  role: string
  createdAt: string
  registrationCount: number
}

const ROLE_LABEL: Record<string, string> = {
  admin: '🛡️ Administrator',
  organizer: '⚙️ Organizator',
  user: '👤 Użytkownik',
}

export default function ProfileClient({ email, fullName, company, role, createdAt, registrationCount }: Props) {
  const [name, setName] = useState(fullName)
  const [org, setOrg] = useState(company)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initials = (() => {
    const n = name || email
    const parts = n.trim().split(/\s+/)
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : n.slice(0, 2).toUpperCase()
  })()

  const memberSince = (() => {
    try {
      return new Intl.DateTimeFormat('pl-PL', { year: 'numeric', month: 'long' }).format(new Date(createdAt))
    } catch {
      return '—'
    }
  })()

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name, company: org }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Błąd zapisu')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="page-title">👤 Profil</h1>

      {/* Avatar + meta */}
      <div className="card flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-sky-600 text-white flex items-center justify-center text-2xl font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 truncate">{name || email}</p>
          <p className="text-sm text-slate-500 truncate">{email}</p>
          <span className="inline-block mt-1 text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5 font-medium">
            {ROLE_LABEL[role] ?? role}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-sky-600">{registrationCount}</p>
          <p className="text-sm text-slate-500 mt-1">Zapisów na zawody</p>
          <Link href="/moje-zapisy" className="text-xs text-sky-600 hover:underline mt-1 inline-block">
            Zobacz wszystkie →
          </Link>
        </div>
        <div className="card text-center">
          <p className="text-sm font-medium text-slate-700">Członek od</p>
          <p className="text-slate-500 text-sm mt-1">{memberSince}</p>
        </div>
      </div>

      {/* Edit form */}
      <form onSubmit={handleSave} className="card space-y-4">
        <h2 className="font-semibold text-slate-800">Dane osobowe</h2>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Imię i nazwisko</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={100}
            className="input w-full"
            placeholder="Jan Kowalski"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Klub / organizacja <span className="text-slate-400 font-normal">(opcjonalnie)</span></label>
          <input
            type="text"
            value={org}
            onChange={e => setOrg(e.target.value)}
            maxLength={100}
            className="input w-full"
            placeholder="np. Klub Agility Warszawa"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Adres e-mail</label>
          <input
            type="email"
            value={email}
            disabled
            className="input w-full opacity-60 cursor-not-allowed"
          />
          <p className="text-xs text-slate-400 mt-1">Zmiana e-maila odbywa się przez ustawienia konta.</p>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {saved && <p className="text-green-600 text-sm">✓ Zapisano zmiany</p>}

        <button type="submit" disabled={saving} className="btn btn-primary w-full">
          {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
        </button>
      </form>

      <div className="text-center">
        <Link href="/settings" className="text-sm text-sky-600 hover:underline">
          ⚙️ Ustawienia konta (hasło, bezpieczeństwo)
        </Link>
      </div>
    </div>
  )
}
