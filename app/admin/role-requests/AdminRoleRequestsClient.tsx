'use client'

import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Clock,
  HelpCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import {
  ROLE_LABELS,
  ROLE_REQUEST_LABELS,
  ROLE_REQUEST_STATUS_LABELS,
} from '@/lib/roles'
import type { RoleRequestStatus } from '@/lib/roles'
import type { RoleUpgradeRequest } from '@/types'

type AdminRoleRequest = RoleUpgradeRequest & {
  user_email?: string | null
}

const STATUS_STYLES: Record<RoleRequestStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  needs_info: 'bg-blue-50 text-blue-700 border-blue-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
}

const STATUS_ICONS: Record<RoleRequestStatus, React.ElementType> = {
  pending: Clock,
  needs_info: HelpCircle,
  approved: CheckCircle2,
  rejected: XCircle,
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function asLinks(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

export default function AdminRoleRequestsClient() {
  const [requests, setRequests] = useState<AdminRoleRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})

  async function loadRequests() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/role-requests')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Nie udało się pobrać wniosków')
      setRequests(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się pobrać wniosków')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
  }, [])

  async function decide(id: string, status: 'approved' | 'needs_info' | 'rejected') {
    setSaving(id)
    setError(null)
    try {
      const res = await fetch('/api/admin/role-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status,
          adminNotes: notes[id] ?? '',
          rejectionReason: reasons[id] ?? '',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Nie udało się zapisać decyzji')
      await loadRequests()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać decyzji')
    } finally {
      setSaving(null)
    }
  }

  const pendingCount = requests.filter(request => request.status === 'pending' || request.status === 'needs_info').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Wnioski o role</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Akceptuj osobno dostęp organizatora, trenera albo rolę łączoną.
          </p>
        </div>
        <button onClick={loadRequests} disabled={loading} className="btn btn-secondary">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Odśwież
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Aktywne</p>
          <p className="text-2xl font-heading font-bold text-foreground">{pendingCount}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Zatwierdzone</p>
          <p className="text-2xl font-heading font-bold text-emerald-600">
            {requests.filter(request => request.status === 'approved').length}
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Odrzucone</p>
          <p className="text-2xl font-heading font-bold text-red-600">
            {requests.filter(request => request.status === 'rejected').length}
          </p>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

      {loading ? (
        <p className="text-slate-500">Ładowanie…</p>
      ) : requests.length === 0 ? (
        <div className="bg-card rounded-3xl border border-border p-8 text-center text-muted-foreground">
          Nie ma jeszcze żadnych wniosków.
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(request => {
            const StatusIcon = STATUS_ICONS[request.status]
            const editable = request.status === 'pending' || request.status === 'needs_info'
            const currentRole = request.profiles?.role
            const verificationLinks = asLinks(request.verification_links)
            const certificationUrls = asLinks(request.certification_urls)

            return (
              <section key={request.id} className="bg-card rounded-3xl border border-border p-5 shadow-sm space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Wniosek</p>
                    <h2 className="font-heading font-semibold text-xl text-foreground mt-1">
                      {ROLE_REQUEST_LABELS[request.requested_role]}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatDate(request.created_at)}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[request.status]}`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    {ROLE_REQUEST_STATUS_LABELS[request.status]}
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-secondary/50 p-4">
                    <p className="text-xs text-muted-foreground mb-2">Użytkownik</p>
                    <p className="font-semibold text-foreground">{request.full_name}</p>
                    <p className="text-sm text-muted-foreground">{request.user_email || 'Brak e-maila'}</p>
                    {request.business_name && <p className="text-sm text-muted-foreground">{request.business_name}</p>}
                    {request.city && <p className="text-sm text-muted-foreground">{request.city}</p>}
                    {request.phone && <p className="text-sm text-muted-foreground">{request.phone}</p>}
                    <p className="text-xs text-muted-foreground mt-3">
                      Aktualna rola: {currentRole && currentRole in ROLE_LABELS ? ROLE_LABELS[currentRole as keyof typeof ROLE_LABELS] : currentRole || 'user'}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-secondary/50 p-4">
                    <p className="text-xs text-muted-foreground mb-2">Potwierdzenia</p>
                    <p className="text-sm text-foreground">
                      Koszty platformy: {request.pricing_acknowledged ? 'potwierdzone' : 'brak potwierdzenia'}
                    </p>
                    <p className="text-sm text-foreground">
                      Zgoda na weryfikację: {request.terms_accepted ? 'tak' : 'nie'}
                    </p>
                    {request.reviewed_at && (
                      <p className="text-xs text-muted-foreground mt-3">Ostatnia decyzja: {formatDate(request.reviewed_at)}</p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Doświadczenie / działalność</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{request.experience}</p>
                </div>

                {(verificationLinks.length > 0 || certificationUrls.length > 0) && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {verificationLinks.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Linki weryfikacyjne</p>
                        <div className="space-y-1">
                          {verificationLinks.map(link => (
                            <a key={link} href={link} target="_blank" rel="noreferrer" className="block text-sm text-accent hover:underline break-all">
                              {link}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {certificationUrls.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Certyfikaty / dokumenty</p>
                        <div className="space-y-1">
                          {certificationUrls.map(link => (
                            <a key={link} href={link} target="_blank" rel="noreferrer" className="block text-sm text-accent hover:underline break-all">
                              {link}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {(request.admin_notes || request.rejection_reason) && (
                  <div className="rounded-2xl border border-border p-4 text-sm">
                    {request.admin_notes && <p className="text-muted-foreground">Notatka: {request.admin_notes}</p>}
                    {request.rejection_reason && <p className="text-red-700">Powód odrzucenia: {request.rejection_reason}</p>}
                  </div>
                )}

                {editable && (
                  <div className="space-y-3 border-t border-border pt-4">
                    <textarea
                      value={notes[request.id] ?? request.admin_notes ?? ''}
                      onChange={event => setNotes(prev => ({ ...prev, [request.id]: event.target.value }))}
                      className="form-input min-h-[90px] resize-y"
                      placeholder="Notatka do akceptacji albo prośba o uzupełnienie informacji"
                    />
                    <textarea
                      value={reasons[request.id] ?? ''}
                      onChange={event => setReasons(prev => ({ ...prev, [request.id]: event.target.value }))}
                      className="form-input min-h-[70px] resize-y"
                      placeholder="Powód odrzucenia (wymagany tylko przy odrzuceniu)"
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => decide(request.id, 'approved')}
                        disabled={saving === request.id}
                        className="btn btn-primary"
                      >
                        Zatwierdź
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(request.id, 'needs_info')}
                        disabled={saving === request.id}
                        className="btn btn-secondary"
                      >
                        Poproś o informacje
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(request.id, 'rejected')}
                        disabled={saving === request.id}
                        className="px-4 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-sm font-semibold transition-colors"
                      >
                        Odrzuć
                      </button>
                      {saving === request.id && <span className="text-sm text-muted-foreground py-2">Zapisywanie…</span>}
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
