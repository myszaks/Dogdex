'use client'

import { useState } from 'react'
import Link from 'next/link'
import { User, Shield, Settings2, ClipboardList, CalendarDays, Check } from 'lucide-react'

interface Props {
  email: string
  fullName: string
  company: string
  role: string
  createdAt: string
  registrationCount: number
}

const ROLE_CONFIG: Record<string, { label: string; className: string; Icon: React.ElementType }> = {
  admin:     { label: 'Administrator', className: 'bg-red-100 text-red-700',     Icon: Shield },
  organizer: { label: 'Organizator',   className: 'bg-blue-100 text-blue-700',   Icon: Settings2 },
  user:      { label: 'Użytkownik',    className: 'bg-secondary text-foreground', Icon: User },
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

  const roleCfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.user
  const RoleIcon = roleCfg.Icon

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        ← Strona główna
      </Link>
      <h1 className="page-title">Profil</h1>

      {/* Avatar + meta */}
      <div className="bg-card rounded-3xl border border-border p-6 shadow-sm flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center text-xl font-heading font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-heading font-semibold text-foreground text-lg truncate">{name || email}</p>
          <p className="text-sm text-muted-foreground truncate">{email}</p>
          <span className={`inline-flex items-center gap-1 mt-1.5 text-xs rounded-full px-2.5 py-0.5 font-semibold ${roleCfg.className}`}>
            <RoleIcon className="w-3 h-3" />
            {roleCfg.label}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-3xl border border-border p-5 text-center shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center mx-auto mb-2">
            <ClipboardList className="w-5 h-5 text-orange-600" />
          </div>
          <p className="text-2xl font-heading font-bold text-foreground">{registrationCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Zapisów na zawody</p>
          <Link href="/moje-zapisy" className="text-xs text-accent hover:text-orange-600 font-medium mt-1.5 inline-block transition-colors">
            Zobacz wszystkie →
          </Link>
        </div>
        <div className="bg-card rounded-3xl border border-border p-5 text-center shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mx-auto mb-2">
            <CalendarDays className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">Członek od</p>
          <p className="text-muted-foreground text-sm mt-1">{memberSince}</p>
        </div>
      </div>

      {/* Edit form */}
      <form onSubmit={handleSave} className="bg-card rounded-3xl border border-border p-6 shadow-sm space-y-4">
        <h2 className="font-heading font-semibold text-foreground">Dane osobowe</h2>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Imię i nazwisko</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={100}
            className="form-input"
            placeholder="Jan Kowalski"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Klub / organizacja <span className="text-muted-foreground font-normal">(opcjonalnie)</span>
          </label>
          <input
            type="text"
            value={org}
            onChange={e => setOrg(e.target.value)}
            maxLength={100}
            className="form-input"
            placeholder="np. Klub Agility Warszawa"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Adres e-mail</label>
          <input
            type="email"
            value={email}
            disabled
            className="form-input opacity-60 cursor-not-allowed"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
        )}
        {saved && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2">
            <Check className="w-4 h-4" />
            Zapisano zmiany
          </div>
        )}

        <button type="submit" disabled={saving} className="btn btn-primary w-full">
          {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
        </button>
      </form>

      <div className="text-center">
        <Link href="/settings" className="text-sm text-accent hover:text-orange-600 font-medium transition-colors inline-flex items-center gap-1">
          <Settings2 className="w-3.5 h-3.5" />
          Ustawienia konta (hasło, bezpieczeństwo)
        </Link>
      </div>
    </div>
  )
}

