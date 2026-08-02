'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2, Clock, HelpCircle, XCircle } from 'lucide-react'
import {
  ROLE_REQUEST_LABELS,
  ROLE_REQUEST_STATUS_LABELS,
} from '@/lib/roles'
import type { RoleRequestKind, RoleRequestStatus } from '@/lib/roles'
import type { RoleUpgradeRequest } from '@/types'

type FormState = {
  requestedRole: RoleRequestKind
  fullName: string
  businessName: string
  city: string
  phone: string
  experience: string
  verificationLinks: string
  certificationUrls: string
  pricingAcknowledged: boolean
  termsAccepted: boolean
}

type Props = {
  email: string
  currentRole: string
  initialFullName: string
  initialBusinessName: string
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

function defaultRequestedRole(currentRole: string): RoleRequestKind {
  if (currentRole === 'organizer') return 'trainer'
  if (currentRole === 'trainer') return 'organizer'
  return 'organizer'
}

function roleOptions(currentRole: string, activeRole?: RoleRequestKind): RoleRequestKind[] {
  const options: RoleRequestKind[] = currentRole === 'organizer'
    ? ['trainer']
    : currentRole === 'trainer'
      ? ['organizer']
      : ['organizer', 'trainer', 'organizer_trainer']

  if (activeRole && !options.includes(activeRole)) options.unshift(activeRole)
  return options
}

function toLines(value: unknown): string {
  return Array.isArray(value) ? value.filter(Boolean).join('\n') : ''
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

export default function RoleRequestClient({
  email,
  currentRole,
  initialFullName,
  initialBusinessName,
}: Props) {
  const [requests, setRequests] = useState<RoleUpgradeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({
    requestedRole: defaultRequestedRole(currentRole),
    fullName: initialFullName,
    businessName: initialBusinessName,
    city: '',
    phone: '',
    experience: '',
    verificationLinks: '',
    certificationUrls: '',
    pricingAcknowledged: false,
    termsAccepted: false,
  })

  const alreadyHasBothRoles = currentRole === 'admin' || currentRole === 'organizer_trainer'
  const activeRequest = requests.find(request => request.status === 'pending' || request.status === 'needs_info') ?? null
  const options = roleOptions(currentRole, activeRequest?.requested_role)

  async function loadRequests() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/role-requests')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Nie udało się pobrać wniosków')

      const loadedRequests = (json.requests ?? []) as RoleUpgradeRequest[]
      setRequests(loadedRequests)

      const active = loadedRequests.find(request => request.status === 'pending' || request.status === 'needs_info')
      if (active) {
        setEditingRequestId(active.id)
        setForm({
          requestedRole: active.requested_role,
          fullName: active.full_name ?? initialFullName,
          businessName: active.business_name ?? initialBusinessName,
          city: active.city ?? '',
          phone: active.phone ?? '',
          experience: active.experience ?? '',
          verificationLinks: toLines(active.verification_links),
          certificationUrls: toLines(active.certification_urls),
          pricingAcknowledged: active.pricing_acknowledged,
          termsAccepted: active.terms_accepted,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się pobrać wniosków')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    const payload = {
      id: editingRequestId ?? undefined,
      requestedRole: form.requestedRole,
      fullName: form.fullName,
      businessName: form.businessName,
      city: form.city,
      phone: form.phone,
      experience: form.experience,
      verificationLinks: form.verificationLinks,
      certificationUrls: form.certificationUrls,
      pricingAcknowledged: form.pricingAcknowledged,
      termsAccepted: form.termsAccepted,
    }

    try {
      const res = await fetch('/api/role-requests', {
        method: editingRequestId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Nie udało się zapisać wniosku')

      setSuccess(editingRequestId ? 'Wniosek zaktualizowany i wrócił do weryfikacji.' : 'Wniosek wysłany do weryfikacji.')
      await loadRequests()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać wniosku')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="section-title mb-2 text-2xl">Role i dostęp</h2>
        <p className="text-muted-foreground text-sm">
          Rozdzielamy role organizatora i trenera. Wybierz dostęp, którego potrzebujesz, i podaj dane do weryfikacji.
        </p>
      </div>

      {alreadyHasBothRoles ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-emerald-800">
          Masz już pełny dostęp organizatora i trenera. Nie musisz składać kolejnego wniosku.
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          aria-describedby={error ? 'role-request-error' : undefined}
          className="bg-card rounded-3xl p-6 shadow-sm space-y-6"
        >
          <div>
            <h2 className="font-heading font-semibold text-foreground mb-3">Zakres dostępu</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {options.map(option => (
                <label
                  key={option}
                  htmlFor={`role-request-${option}`}
                  className={`rounded-2xl border p-4 cursor-pointer transition-colors ${
                    form.requestedRole === option
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <input
                    id={`role-request-${option}`}
                    type="radio"
                    name="requestedRole"
                    value={option}
                    checked={form.requestedRole === option}
                    onChange={() => update('requestedRole', option)}
                    className="sr-only"
                  />
                  <span className="font-semibold text-sm text-foreground">{ROLE_REQUEST_LABELS[option]}</span>
                </label>
              ))}
            </div>
          </div>

          {activeRequest?.status === 'needs_info' && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-800">
              <p className="font-semibold mb-1">Admin poprosił o uzupełnienie:</p>
              <p>{activeRequest.admin_notes || 'Uzupełnij dane w formularzu i wyślij wniosek ponownie.'}</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="role-request-full-name" className="block text-sm font-medium text-foreground mb-1.5">Imię i nazwisko *</label>
              <input
                id="role-request-full-name"
                value={form.fullName}
                onChange={event => update('fullName', event.target.value)}
                className="form-input"
                required
                maxLength={120}
              />
            </div>
            <div>
              <label htmlFor="role-request-email" className="block text-sm font-medium text-foreground mb-1.5">E-mail</label>
              <input id="role-request-email" value={email} className="form-input opacity-60 cursor-not-allowed" disabled />
            </div>
            <div>
              <label htmlFor="role-request-business-name" className="block text-sm font-medium text-foreground mb-1.5">Klub / firma</label>
              <input
                id="role-request-business-name"
                value={form.businessName}
                onChange={event => update('businessName', event.target.value)}
                className="form-input"
                maxLength={160}
                placeholder="np. Klub Agility Warszawa"
              />
            </div>
            <div>
              <label htmlFor="role-request-city" className="block text-sm font-medium text-foreground mb-1.5">Miasto</label>
              <input
                id="role-request-city"
                value={form.city}
                onChange={event => update('city', event.target.value)}
                className="form-input"
                maxLength={120}
                placeholder="np. Warszawa"
              />
            </div>
            <div>
              <label htmlFor="role-request-phone" className="block text-sm font-medium text-foreground mb-1.5">Telefon kontaktowy</label>
              <input
                id="role-request-phone"
                value={form.phone}
                onChange={event => update('phone', event.target.value)}
                className="form-input"
                maxLength={40}
                placeholder="+48 000 000 000"
              />
            </div>
          </div>

          <div>
            <label htmlFor="role-request-experience" className="block text-sm font-medium text-foreground mb-1.5">Doświadczenie / działalność *</label>
            <textarea
              id="role-request-experience"
              value={form.experience}
              onChange={event => update('experience', event.target.value)}
              className="form-input min-h-[140px] resize-y"
              required
              maxLength={3000}
              placeholder="Opisz doświadczenie w organizacji zawodów, prowadzeniu treningów, pracy z psami lub link do dotychczasowej działalności."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="role-request-verification-links" className="block text-sm font-medium text-foreground mb-1.5">Linki weryfikacyjne</label>
              <textarea
                id="role-request-verification-links"
                value={form.verificationLinks}
                onChange={event => update('verificationLinks', event.target.value)}
                className="form-input min-h-[110px] resize-y"
                placeholder="Strona klubu, social media, profil wydarzeń..."
              />
            </div>
            <div>
              <label htmlFor="role-request-certification-urls" className="block text-sm font-medium text-foreground mb-1.5">Certyfikaty / uprawnienia</label>
              <textarea
                id="role-request-certification-urls"
                value={form.certificationUrls}
                onChange={event => update('certificationUrls', event.target.value)}
                className="form-input min-h-[110px] resize-y"
                placeholder="Linki do certyfikatów, licencji, dokumentów..."
              />
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-sm text-orange-900">
            Platforma może pobierać prowizję od płatności/rezerwacji lub abonament za narzędzia organizatora i trenera.
            Konkretne warunki potwierdzimy przed aktywacją płatnych funkcji.
          </div>

          <div className="space-y-3">
            <label htmlFor="role-request-pricing-acknowledged" className="flex items-start gap-3 text-sm text-foreground">
              <input
                id="role-request-pricing-acknowledged"
                type="checkbox"
                checked={form.pricingAcknowledged}
                onChange={event => update('pricingAcknowledged', event.target.checked)}
                className="mt-1"
                required
              />
              <span>Rozumiem, że korzystanie z funkcji organizatora lub trenera może wiązać się z prowizją albo subskrypcją.</span>
            </label>
            <label htmlFor="role-request-terms-accepted" className="flex items-start gap-3 text-sm text-foreground">
              <input
                id="role-request-terms-accepted"
                type="checkbox"
                checked={form.termsAccepted}
                onChange={event => update('termsAccepted', event.target.checked)}
                className="mt-1"
                required
              />
              <span>Wyrażam zgodę na weryfikację podanych informacji przez administratora Dogdex.</span>
            </label>
          </div>

          {error && <div id="role-request-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
          {success && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">{success}</div>}

          <button type="submit" disabled={saving || loading} className="btn btn-primary w-full">
            {saving ? 'Zapisywanie…' : editingRequestId ? 'Zaktualizuj wniosek' : 'Wyślij wniosek'}
          </button>
        </form>
      )}

      <div className="bg-card rounded-3xl p-6 shadow-sm">
        <h2 className="font-heading font-semibold text-foreground mb-4">Historia wniosków</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Ładowanie…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nie masz jeszcze żadnych wniosków.</p>
        ) : (
          <div className="space-y-3">
            {requests.map(request => {
              const StatusIcon = STATUS_ICONS[request.status]
              return (
                <div key={request.id} className="rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{ROLE_REQUEST_LABELS[request.requested_role]}</p>
                      <p className="text-xs text-muted-foreground mt-1">Wysłano: {formatDate(request.created_at)}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[request.status]}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {ROLE_REQUEST_STATUS_LABELS[request.status]}
                    </span>
                  </div>
                  {request.admin_notes && (
                    <p className="text-sm text-muted-foreground mt-3">Notatka admina: {request.admin_notes}</p>
                  )}
                  {request.rejection_reason && (
                    <p className="text-sm text-red-700 mt-3">Powód odrzucenia: {request.rejection_reason}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
