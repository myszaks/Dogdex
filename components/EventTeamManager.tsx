'use client'

import { useState } from 'react'
import { Loader2, Mail, ShieldCheck, Trash2, UserRoundPlus } from 'lucide-react'
import {
  EVENT_TEAM_PERMISSIONS,
  EVENT_TEAM_PERMISSION_LABELS,
  type EventTeamPermission,
} from '@/lib/eventPermissions'

interface TeamMember {
  id: string
  email: string
  user_id: string | null
  fullName?: string | null
  permissions: EventTeamPermission[]
  status: 'pending' | 'active'
}

export default function EventTeamManager({
  eventSlug,
  owner,
  initialMembers,
}: {
  eventSlug: string
  owner: { email: string; fullName: string | null }
  initialMembers: TeamMember[]
}) {
  const [members, setMembers] = useState(initialMembers)
  const [email, setEmail] = useState('')
  const [permissions, setPermissions] = useState<EventTeamPermission[]>(['registrations'])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function toggle(permission: EventTeamPermission) {
    setPermissions(current => current.includes(permission)
      ? current.filter(item => item !== permission)
      : [...current, permission])
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventSlug)}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, permissions }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Nie udało się zapisać dostępu')
      setMembers(current => {
        const next = current.filter(member => member.id !== data.id && member.email !== data.email)
        return [...next, data].sort((a, b) => a.email.localeCompare(b.email))
      })
      setEmail('')
      setMessage({ type: 'success', text: 'Dostęp został zapisany, a zaproszenie wysłane e-mailem.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Nie udało się zapisać dostępu' })
    } finally {
      setSaving(false)
    }
  }

  async function updateMember(member: TeamMember, nextPermissions: EventTeamPermission[]) {
    if (nextPermissions.length === 0) return
    setMessage(null)
    const response = await fetch(`/api/events/${encodeURIComponent(eventSlug)}/team/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: nextPermissions }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMessage({ type: 'error', text: data.error ?? 'Nie udało się zmienić uprawnień' })
      return
    }
    setMembers(current => current.map(item => item.id === member.id ? { ...item, ...data } : item))
  }

  async function removeMember(member: TeamMember) {
    if (!window.confirm(`Usunąć dostęp dla ${member.email}?`)) return
    const response = await fetch(`/api/events/${encodeURIComponent(eventSlug)}/team/${member.id}`, { method: 'DELETE' })
    const data = await response.json()
    if (!response.ok) {
      setMessage({ type: 'error', text: data.error ?? 'Nie udało się usunąć dostępu' })
      return
    }
    setMembers(current => current.filter(item => item.id !== member.id))
    setMessage({ type: 'success', text: 'Dostęp został usunięty.' })
  }

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-heading text-lg font-semibold">Właściciel wydarzenia</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {owner.fullName ? `${owner.fullName} · ` : ''}{owner.email}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">Ma pełny dostęp, zarządza ustawieniami wydarzenia i składem zespołu.</p>
          </div>
        </div>
      </section>

      <form onSubmit={invite} className="card p-6">
        <div className="flex items-center gap-2">
          <UserRoundPlus className="h-5 w-5 text-accent" />
          <h2 className="font-heading text-lg font-semibold">Dodaj osobę do zespołu</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Podaj adres używany w Dogdex. Osoba bez konta otrzyma dostęp automatycznie po rejestracji tym samym adresem.
        </p>
        <label className="mt-5 block text-sm font-medium" htmlFor="team-email">Adres e-mail</label>
        <div className="relative mt-2 max-w-xl">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="team-email"
            type="email"
            required
            value={email}
            onChange={event => setEmail(event.target.value)}
            className="input w-full pl-10"
            placeholder="sekretariat@klub.pl"
          />
        </div>
        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Zakres dostępu</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {EVENT_TEAM_PERMISSIONS.map(permission => (
              <label htmlFor={`invite-permission-${permission}`} key={permission} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4 hover:bg-secondary/50">
                <input
                  id={`invite-permission-${permission}`}
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={permissions.includes(permission)}
                  onChange={() => toggle(permission)}
                />
                <span>
                  <span className="block text-sm font-semibold">{EVENT_TEAM_PERMISSION_LABELS[permission]}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{permissionDescription(permission)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" disabled={saving || permissions.length === 0} className="btn btn-primary mt-5">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Wyślij zaproszenie
        </button>
      </form>

      {message && (
        <p className={`rounded-2xl px-4 py-3 text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {message.text}
        </p>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">Zespół operacyjny</h2>
          <p className="mt-1 text-sm text-muted-foreground">Każda osoba widzi wyłącznie narzędzia potrzebne do swojej pracy.</p>
        </div>
        {members.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted-foreground">Nie dodano jeszcze nikogo do zespołu.</div>
        ) : members.map(member => (
          <article key={member.id} className="card p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{member.fullName || member.email}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${member.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {member.status === 'active' ? 'Aktywny dostęp' : 'Oczekuje na logowanie'}
                  </span>
                </div>
                {member.fullName && <p className="mt-1 text-sm text-muted-foreground">{member.email}</p>}
              </div>
              <button type="button" onClick={() => removeMember(member)} className="btn btn-ghost btn-sm text-red-600">
                <Trash2 className="h-4 w-4" /> Usuń dostęp
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {EVENT_TEAM_PERMISSIONS.map(permission => {
                const checked = member.permissions.includes(permission)
                return (
                  <label htmlFor={`member-${member.id}-${permission}`} key={permission} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium ${checked ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground'}`}>
                    <input
                      id={`member-${member.id}-${permission}`}
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() => updateMember(member, checked
                        ? member.permissions.filter(item => item !== permission)
                        : [...member.permissions, permission])}
                    />
                    {EVENT_TEAM_PERMISSION_LABELS[permission]}
                  </label>
                )
              })}
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}

function permissionDescription(permission: EventTeamPermission) {
  if (permission === 'registrations') return 'Lista uczestników, lista rezerwowa, grafik i komunikaty.'
  if (permission === 'checkin') return 'Oznaczanie obecności i obsługa odprawy.'
  if (permission === 'results') return 'Kolejność startowa, wyniki i transmisja na żywo.'
  return 'Płatności, zwroty i rozliczenie wydarzenia.'
}
