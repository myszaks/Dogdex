'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Loader2, Mail, ShieldCheck, Trash2, UserRoundPlus } from 'lucide-react'
import {
  EVENT_TEAM_PERMISSIONS,
  EVENT_TEAM_PERMISSION_LABELS,
  type EventTeamPermission,
} from '@/lib/eventPermissions'

interface OrganizerTeamMember {
  id: string
  email: string
  user_id: string | null
  fullName: string | null
  default_permissions: EventTeamPermission[]
  auto_assign_new_events: boolean
  status: 'pending' | 'active'
}

export default function OrganizerTeamManager({ initialMembers }: { initialMembers: OrganizerTeamMember[] }) {
  const [members, setMembers] = useState(initialMembers)
  const [email, setEmail] = useState('')
  const [permissions, setPermissions] = useState<EventTeamPermission[]>(['registrations'])
  const [autoAssign, setAutoAssign] = useState(true)
  const [assignExisting, setAssignExisting] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function toggleInvitePermission(permission: EventTeamPermission) {
    setPermissions(current => current.includes(permission)
      ? current.filter(item => item !== permission)
      : [...current, permission])
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/organizer-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          defaultPermissions: permissions,
          autoAssignNewEvents: autoAssign,
          assignExistingEvents: assignExisting,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Nie udało się dodać osoby do zespołu')
      setMembers(current => [...current.filter(member => member.id !== data.id), data]
        .sort((a, b) => a.email.localeCompare(b.email)))
      setEmail('')
      setMessage({ type: 'success', text: 'Osoba została dodana do stałego zespołu.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Nie udało się dodać osoby' })
    } finally {
      setSaving(false)
    }
  }

  async function patchMember(member: OrganizerTeamMember, patch: Record<string, unknown>) {
    setMessage(null)
    const response = await fetch(`/api/organizer-team/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await response.json()
    if (!response.ok) {
      setMessage({ type: 'error', text: data.error ?? 'Nie udało się zapisać zmian' })
      return
    }
    setMembers(current => current.map(item => item.id === member.id ? { ...item, ...data } : item))
  }

  async function toggleMemberPermission(member: OrganizerTeamMember, permission: EventTeamPermission) {
    const next = member.default_permissions.includes(permission)
      ? member.default_permissions.filter(item => item !== permission)
      : [...member.default_permissions, permission]
    if (next.length === 0) {
      setMessage({ type: 'error', text: 'Osoba musi mieć co najmniej jeden domyślny zakres pracy.' })
      return
    }
    await patchMember(member, { defaultPermissions: next })
  }

  async function removeMember(member: OrganizerTeamMember) {
    if (!window.confirm(`Usunąć ${member.email} ze stałego zespołu i odwołać przypisania utworzone z tego zespołu?`)) return
    const response = await fetch(`/api/organizer-team/${member.id}`, { method: 'DELETE' })
    const data = await response.json()
    if (!response.ok) {
      setMessage({ type: 'error', text: data.error ?? 'Nie udało się usunąć osoby' })
      return
    }
    setMembers(current => current.filter(item => item.id !== member.id))
    setMessage({ type: 'success', text: 'Osoba została usunięta, a jej dostępy odwołane.' })
  }

  return (
    <div className="space-y-6 py-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Współpraca</p>
        <h1 className="mt-2 font-heading text-3xl font-bold text-primary">Stały zespół organizatora</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Zapraszaj osoby raz, ustawiaj domyślny zakres pracy i automatycznie dodawaj je do nowych wydarzeń.
          Uprawnienia konkretnego wydarzenia nadal możesz zmienić w jego zakładce Zespół.
        </p>
      </div>

      <section className="card flex items-start gap-3 p-5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Bezpieczny model hybrydowy</p>
          <p className="mt-1">Zmiana domyślnych uprawnień nie nadpisuje istniejących wyjątków per wydarzenie.</p>
          <Link href="/organizer" className="mt-2 inline-flex font-semibold text-primary hover:underline">Przejdź do wydarzeń</Link>
        </div>
      </section>

      <form onSubmit={invite} className="card p-6">
        <div className="flex items-center gap-2">
          <UserRoundPlus className="h-5 w-5 text-accent" />
          <h2 className="font-heading text-lg font-semibold">Dodaj osobę do stałego zespołu</h2>
        </div>
        <label className="mt-5 block text-sm font-medium" htmlFor="organizer-team-email">Adres e-mail</label>
        <div className="relative mt-2 max-w-xl">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input id="organizer-team-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} className="input w-full pl-10" placeholder="sekretariat@klub.pl" />
        </div>

        <PermissionPicker selected={permissions} onToggle={toggleInvitePermission} prefix="organizer-invite" />

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ToggleCard id="organizer-team-auto-assign" checked={autoAssign} onChange={setAutoAssign} title="Dodawaj do nowych wydarzeń" description="Nowe wydarzenia otrzymają ten zespół automatycznie." />
          <ToggleCard id="organizer-team-assign-existing" checked={assignExisting} onChange={setAssignExisting} title="Dodaj do istniejących wydarzeń" description="Nie nadpisze osób, które mają już indywidualne ustawienia." />
        </div>
        <button type="submit" disabled={saving || permissions.length === 0} className="btn btn-primary mt-5">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Dodaj do zespołu
        </button>
      </form>

      {message && <p role="status" className={`rounded-2xl px-4 py-3 text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</p>}

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">Osoby w zespole</h2>
          <p className="mt-1 text-sm text-muted-foreground">Domyślne ustawienia są używane przy nowych przypisaniach.</p>
        </div>
        {members.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted-foreground">Nie dodano jeszcze nikogo do stałego zespołu.</div>
        ) : members.map(member => (
          <article key={member.id} className="card p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{member.fullName || member.email}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${member.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {member.status === 'active' ? 'Aktywny' : 'Oczekuje na konto'}
                  </span>
                </div>
                {member.fullName && <p className="mt-1 text-sm text-muted-foreground">{member.email}</p>}
              </div>
              <button type="button" onClick={() => removeMember(member)} className="btn btn-ghost btn-sm text-red-600"><Trash2 className="h-4 w-4" /> Usuń</button>
            </div>

            <PermissionPicker selected={member.default_permissions} onToggle={permission => toggleMemberPermission(member, permission)} prefix={`organizer-member-${member.id}`} />
            <label htmlFor={`organizer-member-${member.id}-auto-assign`} className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-secondary/40 p-4">
              <input id={`organizer-member-${member.id}-auto-assign`} type="checkbox" checked={member.auto_assign_new_events} onChange={event => patchMember(member, { autoAssignNewEvents: event.target.checked })} className="mt-1" />
              <span><span className="block text-sm font-semibold">Automatycznie dodawaj do nowych wydarzeń</span><span className="mt-1 block text-xs text-muted-foreground">Wykorzysta powyższe uprawnienia jako ustawienie początkowe.</span></span>
            </label>
          </article>
        ))}
      </section>
    </div>
  )
}

function PermissionPicker({ selected, onToggle, prefix }: { selected: EventTeamPermission[]; onToggle: (permission: EventTeamPermission) => void; prefix: string }) {
  return (
    <fieldset className="mt-5">
      <legend className="text-sm font-medium">Domyślny zakres pracy</legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {EVENT_TEAM_PERMISSIONS.map(permission => (
          <label htmlFor={`${prefix}-${permission}`} key={permission} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border p-4 hover:bg-secondary/50">
            <input id={`${prefix}-${permission}`} type="checkbox" checked={selected.includes(permission)} onChange={() => onToggle(permission)} className="h-4 w-4 accent-primary" />
            <span className="text-sm font-semibold">{EVENT_TEAM_PERMISSION_LABELS[permission]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function ToggleCard({ id, checked, onChange, title, description }: { id: string; checked: boolean; onChange: (checked: boolean) => void; title: string; description: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4">
      <input id={id} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-1" />
      <span><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span></span>
    </label>
  )
}
