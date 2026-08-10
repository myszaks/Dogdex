'use client'

import { useState } from 'react'
import { Loader2, Mail, ShieldCheck, Trash2, UserRoundPlus } from 'lucide-react'
import { BUSINESS_PERMISSION_GROUPS, BUSINESS_PERMISSION_LABELS, type BusinessPermission } from '@/lib/businessPermissions'

interface BusinessMember {
  id: string
  email: string
  user_id: string | null
  fullName: string | null
  role_title: string | null
  permissions: BusinessPermission[]
  status: 'pending' | 'active' | 'disabled'
}

export default function BusinessTeamManager({ profile, initialMembers }: { profile: { id: string; name: string }; initialMembers: BusinessMember[] }) {
  const [members, setMembers] = useState(initialMembers)
  const [email, setEmail] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [permissions, setPermissions] = useState<BusinessPermission[]>(['events.registrations', 'customers.view'])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const toggle = (current: BusinessPermission[], permission: BusinessPermission) => current.includes(permission) ? current.filter(value => value !== permission) : [...current, permission]

  async function invite(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(null)
    try {
      const response = await fetch('/api/business-team', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileId: profile.id, email, roleTitle, permissions }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Nie udało się dodać osoby')
      setMembers(current => [...current.filter(member => member.id !== data.id), data].sort((a, b) => a.email.localeCompare(b.email)))
      setEmail(''); setRoleTitle(''); setMessage({ type: 'success', text: 'Osoba została dodana do zespołu profilu.' })
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Nie udało się dodać osoby' }) } finally { setSaving(false) }
  }

  async function patchMember(member: BusinessMember, patch: Record<string, unknown>) {
    setMessage(null)
    const response = await fetch(`/api/business-team/${member.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) })
    const data = await response.json()
    if (!response.ok) { setMessage({ type: 'error', text: data.error ?? 'Nie udało się zapisać zmian' }); return }
    setMembers(current => current.map(value => value.id === member.id ? { ...value, ...data } : value))
  }

  async function removeMember(member: BusinessMember) {
    if (!window.confirm(`Usunąć ${member.email} z zespołu i odwołać dostęp?`)) return
    const response = await fetch(`/api/business-team/${member.id}`, { method: 'DELETE' })
    const data = await response.json()
    if (!response.ok) { setMessage({ type: 'error', text: data.error ?? 'Nie udało się usunąć osoby' }); return }
    setMembers(current => current.filter(value => value.id !== member.id)); setMessage({ type: 'success', text: 'Dostęp został odwołany.' })
  }

  return <div className="space-y-6">
    <header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{profile.name}</p><h1 className="mt-2 font-heading text-3xl font-bold text-primary">Zespół profilu</h1><p className="mt-2 max-w-3xl text-muted-foreground">Jedno zaproszenie może dawać dostęp do wydarzeń, treningów, klientów lub finansów. Uprawnienia konkretnego wydarzenia nadal mogą być zawężone osobno.</p></header>
    <section className="card flex items-start gap-3 p-5"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div className="text-sm text-muted-foreground"><p className="font-semibold text-foreground">Zasada najmniejszych uprawnień</p><p className="mt-1">Podgląd płatności i wykonywanie zwrotów są celowo osobnymi uprawnieniami.</p></div></section>
    <form onSubmit={invite} className="card space-y-5 p-6">
      <div className="flex items-center gap-2"><UserRoundPlus className="h-5 w-5 text-accent" /><h2 className="font-heading text-lg font-semibold">Dodaj osobę</h2></div>
      <div className="grid gap-4 md:grid-cols-2"><label htmlFor="business-team-email"><span className="form-label">Adres e-mail</span><span className="relative block"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input id="business-team-email" type="email" required className="input w-full pl-10" value={email} onChange={event => setEmail(event.target.value)} placeholder="recepcja@klub.pl" /></span></label><label htmlFor="business-team-role"><span className="form-label">Rola w zespole (opcjonalnie)</span><input id="business-team-role" className="input w-full" value={roleTitle} onChange={event => setRoleTitle(event.target.value)} placeholder="np. recepcja, trener prowadzący" /></label></div>
      <PermissionPicker selected={permissions} onToggle={permission => setPermissions(current => toggle(current, permission))} prefix="business-invite" />
      <button className="btn btn-primary" disabled={saving || permissions.length === 0}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Wyślij zaproszenie</button>
    </form>
    {message && <p role="status" className={`rounded-2xl px-4 py-3 text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</p>}
    <section className="space-y-3"><h2 className="font-heading text-xl font-semibold">Osoby w zespole</h2>{members.length === 0 ? <div className="card p-8 text-center text-sm text-muted-foreground">Nie dodano jeszcze nikogo do zespołu.</div> : members.map(member => <article key={member.id} className={`card p-5 ${member.status === 'disabled' ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{member.fullName || member.email}</h3><span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{member.status === 'active' ? 'Aktywny' : member.status === 'pending' ? 'Oczekuje na konto' : 'Wyłączony'}</span></div>{member.fullName && <p className="text-sm text-muted-foreground">{member.email}</p>}<input aria-label="Rola w zespole" className="input mt-3 max-w-sm" defaultValue={member.role_title ?? ''} onBlur={event => void patchMember(member, { roleTitle: event.target.value })} placeholder="Rola w zespole" /></div><div className="flex gap-2"><button type="button" className="btn btn-secondary btn-sm" onClick={() => void patchMember(member, { status: member.status === 'disabled' ? 'active' : 'disabled' })}>{member.status === 'disabled' ? 'Włącz' : 'Wyłącz'}</button><button type="button" className="btn btn-ghost btn-sm text-red-600" onClick={() => void removeMember(member)}><Trash2 className="h-4 w-4" /> Usuń</button></div></div>
      <PermissionPicker selected={member.permissions} onToggle={permission => { const next = toggle(member.permissions, permission); if (next.length > 0) void patchMember(member, { permissions: next }) }} prefix={`business-${member.id}`} />
    </article>)}</section>
  </div>
}

function PermissionPicker({ selected, onToggle, prefix }: { selected: BusinessPermission[]; onToggle: (permission: BusinessPermission) => void; prefix: string }) {
  return <div className="space-y-4">{BUSINESS_PERMISSION_GROUPS.map(group => <fieldset key={group.label}><legend className="text-sm font-semibold">{group.label}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{group.permissions.map(permission => <label key={permission} htmlFor={`${prefix}-${permission}`} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 text-sm hover:bg-secondary/50"><input id={`${prefix}-${permission}`} type="checkbox" checked={selected.includes(permission)} onChange={() => onToggle(permission)} className="h-4 w-4 accent-primary" /><span>{BUSINESS_PERMISSION_LABELS[permission]}</span></label>)}</div></fieldset>)}</div>
}
