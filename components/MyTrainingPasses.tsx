'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, CreditCard, History, Loader2, Snowflake } from 'lucide-react'
import type { TrainingCommercePayment, TrainingPass, TrainingPassRequest } from '@/types'

const labels: Record<string, string> = {
  pending: 'oczekuje', active: 'aktywny', frozen: 'zamrożony', used: 'wykorzystany', expired: 'wygasł', cancelled: 'anulowany',
  unpaid: 'nieopłacona', paid: 'opłacona', manual: 'opłacona poza Stripe', refunded: 'zwrócona', completed: 'opłacona', failed: 'nieudana',
  approved: 'zaakceptowany', rejected: 'odrzucony',
}

export default function MyTrainingPasses() {
  const [passes, setPasses] = useState<TrainingPass[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [drafts, setDrafts] = useState<Record<string, { requestType: 'freeze' | 'extend'; requestedDays: string; reason: string }>>({})
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    const response = await fetch('/api/training-passes?mine=1')
    const data = await response.json()
    setPasses(Array.isArray(data?.passes) ? data.passes : [])
  }
  useEffect(() => {
    fetch('/api/training-passes?mine=1').then(response => response.json())
      .then(data => setPasses(Array.isArray(data?.passes) ? data.passes : [])).catch(() => {})
  }, [])

  async function checkout(id: string) {
    setLoading(id); setMessage(null)
    const response = await fetch(`/api/training-passes/${id}/checkout`, { method: 'POST' })
    const data = await response.json(); setLoading(null)
    if (response.ok && data.checkoutUrl) window.location.assign(data.checkoutUrl)
    else setMessage(data.error ?? 'Nie udało się rozpocząć płatności')
  }

  async function cancel(id: string) {
    if (!window.confirm('Anulować karnet? Niewykorzystana płatność zostanie zwrócona przez Stripe.')) return
    setLoading(id); setMessage(null)
    const response = await fetch(`/api/training-passes/${id}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Rezygnacja właściciela' }) })
    const data = await response.json(); setLoading(null)
    if (response.ok) await load()
    else setMessage(data.error ?? 'Nie udało się anulować karnetu')
  }

  async function submitRequest(passId: string, draft: { requestType: 'freeze' | 'extend'; requestedDays: string; reason: string }) {
    setLoading(passId); setMessage(null)
    const response = await fetch('/api/training-pass-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passId, requestType: draft.requestType, requestedDays: Number(draft.requestedDays), reason: draft.reason }) })
    const data = await response.json(); setLoading(null)
    if (response.ok) { setMessage('Wniosek został wysłany do trenera.'); await load() }
    else setMessage(data.error ?? 'Nie udało się wysłać wniosku')
  }

  async function cancelRequest(requestId: string, passId: string) {
    setLoading(passId); setMessage(null)
    const response = await fetch('/api/training-pass-requests', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId, action: 'cancel' }) })
    const data = await response.json(); setLoading(null)
    if (response.ok) { setMessage('Wniosek został wycofany.'); await load() }
    else setMessage(data.error ?? 'Nie udało się wycofać wniosku')
  }

  if (passes.length === 0) return null
  return <section className="mb-8"><h2 className="mb-4 font-heading text-xl font-semibold">Moje karnety</h2>{message && <p role="status" className="mb-3 rounded-xl bg-secondary px-4 py-3 text-sm">{message}</p>}<div className="space-y-3">{passes.map(pass => {
    const canCancel = pass.status === 'pending' || (['active', 'frozen'].includes(pass.status) && pass.entries_remaining === pass.entries_total)
    const payment = first(pass.training_commerce_payments)
    const refund = first(payment?.training_commerce_refunds)
    const requests = pass.training_pass_requests?.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)) ?? []
    const pendingTypes = new Set(requests.filter(request => request.status === 'pending').map(request => request.request_type))
    const canRequestFreeze = pass.status === 'active' && !pendingTypes.has('freeze')
    const canRequestExtend = ['active', 'frozen', 'expired'].includes(pass.status) && !pendingTypes.has('extend')
    const storedDraft = drafts[pass.id] ?? { requestType: 'freeze' as const, requestedDays: '30', reason: '' }
    const draft = storedDraft.requestType === 'freeze' && !canRequestFreeze
      ? { ...storedDraft, requestType: 'extend' as const }
      : storedDraft.requestType === 'extend' && !canRequestExtend
        ? { ...storedDraft, requestType: 'freeze' as const }
        : storedDraft
    const history = [
      ...(pass.training_pass_usages ?? []).map(usage => ({ id: usage.id, createdAt: usage.created_at, title: usage.status === 'reversed' ? 'Cofnięto wykorzystanie wejścia' : `Wykorzystano ${usage.entries_used} wejście`, detail: usageDetail(usage), tone: usage.status === 'reversed' ? 'text-muted-foreground' : '' })),
      ...(pass.training_pass_adjustments ?? []).map(adjustment => ({ id: adjustment.id, createdAt: adjustment.created_at, title: adjustmentLabel(adjustment.action, adjustment.entries_delta), detail: adjustment.note ?? adjustmentDateDetail(adjustment), tone: '' })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return <article key={pass.id} className="card"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-accent">{labels[pass.status] ?? pass.status}</p><h3 className="font-semibold">{pass.training_pass_products?.name ?? 'Karnet'}</h3><p className="mt-1 text-sm text-muted-foreground">{pass.dogs?.name ?? 'Pies'}</p></div><CreditCard className="h-5 w-5 text-accent" /></div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary" style={{ width: `${Math.round((pass.entries_remaining / pass.entries_total) * 100)}%` }} /></div><p className="mt-2 text-sm text-muted-foreground">Pozostało {pass.entries_remaining} z {pass.entries_total} wejść{pass.expires_at ? ` · ważny do ${new Date(pass.expires_at).toLocaleDateString('pl-PL')}` : ''} · płatność: {labels[pass.payment_status] ?? pass.payment_status}</p>
      {refund && payment && <RefundStatus payment={payment} />}
      <div className="mt-4 flex flex-wrap gap-2">{pass.status === 'pending' && ['unpaid', 'pending'].includes(pass.payment_status) && <button className="btn btn-primary btn-sm flex-1" disabled={loading === pass.id} onClick={() => checkout(pass.id)}>{loading === pass.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Zapłać</button>}{canCancel && <button className="btn btn-secondary btn-sm flex-1 text-red-700" disabled={loading === pass.id} onClick={() => cancel(pass.id)}>{pass.payment_status === 'paid' ? 'Zwróć karnet' : 'Anuluj'}</button>}<button className="btn btn-secondary btn-sm" onClick={() => setExpanded(current => ({ ...current, [pass.id]: !current[pass.id] }))}><ChevronDown className={`h-4 w-4 transition-transform ${expanded[pass.id] ? 'rotate-180' : ''}`} /> Szczegóły</button></div>
      {expanded[pass.id] && <div className="mt-5 space-y-5 border-t border-border pt-5">
        {(pass.training_pass_products?.cancellation_policy || pass.training_pass_products?.freeze_policy) && <div><h4 className="font-semibold">Zasady karnetu</h4>{pass.training_pass_products.cancellation_policy && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground"><strong>Rezygnacja:</strong> {pass.training_pass_products.cancellation_policy}</p>}{pass.training_pass_products.freeze_policy && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground"><strong>Zamrożenie:</strong> {pass.training_pass_products.freeze_policy}</p>}</div>}
        {(canRequestFreeze || canRequestExtend) && <div><h4 className="flex items-center gap-2 font-semibold"><Snowflake className="h-4 w-4 text-accent" /> Wniosek do trenera</h4><p className="mt-1 text-xs text-muted-foreground">Zmiana zacznie obowiązywać dopiero po akceptacji trenera.</p><div className="mt-3 grid gap-3 sm:grid-cols-[12rem_8rem_1fr]"> <label htmlFor={`pass-request-type-${pass.id}`}><span className="form-label">Rodzaj</span><select id={`pass-request-type-${pass.id}`} className="form-input" value={draft.requestType} onChange={event => setDrafts(current => ({ ...current, [pass.id]: { ...draft, requestType: event.target.value as 'freeze' | 'extend' } }))}>{canRequestFreeze && <option value="freeze">Zamrożenie</option>}{canRequestExtend && <option value="extend">Przedłużenie</option>}</select></label>{draft.requestType === 'extend' && <label htmlFor={`pass-request-days-${pass.id}`}><span className="form-label">Liczba dni</span><input id={`pass-request-days-${pass.id}`} type="number" min="1" max="730" className="form-input" value={draft.requestedDays} onChange={event => setDrafts(current => ({ ...current, [pass.id]: { ...draft, requestedDays: event.target.value } }))} /></label>}<label htmlFor={`pass-request-reason-${pass.id}`}><span className="form-label">Uzasadnienie</span><input id={`pass-request-reason-${pass.id}`} className="form-input" minLength={3} maxLength={1000} value={draft.reason} onChange={event => setDrafts(current => ({ ...current, [pass.id]: { ...draft, reason: event.target.value } }))} /></label></div><button className="btn btn-secondary btn-sm mt-3" disabled={loading === pass.id || draft.reason.trim().length < 3} onClick={() => submitRequest(pass.id, draft)}>Wyślij wniosek</button></div>}
        {requests.length > 0 && <div><h4 className="font-semibold">Wnioski</h4><div className="mt-2 space-y-2">{requests.map(request => <RequestRow key={request.id} request={request} onCancel={() => cancelRequest(request.id, pass.id)} />)}</div></div>}
        <div><h4 className="flex items-center gap-2 font-semibold"><History className="h-4 w-4 text-accent" /> Historia wejść i zmian</h4>{history.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Brak operacji na karnecie.</p> : <ol className="mt-2 divide-y divide-border">{history.map(item => <li key={item.id} className="py-2 text-sm"><div className="flex justify-between gap-3"><span className={item.tone}>{item.title}</span><time className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('pl-PL')}</time></div>{item.detail && <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>}</li>)}</ol>}</div>
        {payment && <div><h4 className="font-semibold">Płatność</h4><p className="mt-1 text-sm text-muted-foreground">{Number(payment.amount).toLocaleString('pl-PL', { style: 'currency', currency: payment.currency })} · {labels[payment.status] ?? payment.status}{payment.completed_at ? ` · ${new Date(payment.completed_at).toLocaleString('pl-PL')}` : ''}</p>{payment.receipt_url && <a href={payment.receipt_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-accent underline">Otwórz potwierdzenie Stripe</a>}</div>}
      </div>}
    </article>
  })}</div></section>
}

function first<T>(value: T | T[] | null | undefined): T | undefined { return Array.isArray(value) ? value[0] : value ?? undefined }
function relationName(value: { name: string } | Array<{ name: string }> | null | undefined) { return first(value)?.name }
function usageDetail(usage: NonNullable<TrainingPass['training_pass_usages']>[number]) {
  const booking = first(usage.training_bookings)
  const session = first(usage.training_course_sessions)
  if (booking) return `${relationName(booking.training_types) ?? 'Trening indywidualny'} · ${new Date(booking.scheduled_at).toLocaleString('pl-PL')}`
  if (session) return `${relationName(session.training_courses) ?? 'Zajęcia grupowe'} · ${new Date(session.starts_at).toLocaleString('pl-PL')}`
  return usage.note ?? 'Operacja ręczna trenera'
}
function adjustmentLabel(action: string, delta: number) { return ({ extend: 'Przedłużono ważność', freeze: 'Zamrożono karnet', unfreeze: 'Wznowiono karnet', balance: `Skorygowano saldo (${delta > 0 ? '+' : ''}${delta})`, transfer: 'Trener przeniósł karnet na innego psa', refund: 'Zlecono zwrot' } as Record<string, string>)[action] ?? action }
function adjustmentDateDetail(adjustment: NonNullable<TrainingPass['training_pass_adjustments']>[number]) { return adjustment.next_expires_at ? `Nowa data ważności: ${new Date(adjustment.next_expires_at).toLocaleDateString('pl-PL')}` : null }
function RequestRow({ request, onCancel }: { request: TrainingPassRequest; onCancel: () => void }) { return <div className="rounded-xl bg-secondary px-3 py-2 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span>{request.request_type === 'freeze' ? 'Zamrożenie' : `Przedłużenie o ${request.requested_days} dni`} · <strong>{labels[request.status] ?? request.status}</strong></span>{request.status === 'pending' && <button className="text-xs text-red-700 underline" onClick={onCancel}>Wycofaj</button>}</div><p className="mt-1 text-xs text-muted-foreground">{request.reason}</p>{request.response_note && <p className="mt-1 text-xs">Odpowiedź trenera: {request.response_note}</p>}</div> }
function RefundStatus({ payment }: { payment: TrainingCommercePayment }) { const refund = first(payment.training_commerce_refunds); if (!refund) return null; const text = ({ pending: 'Zwrot jest przetwarzany przez Stripe.', requires_action: 'Zwrot wymaga działania trenera.', succeeded: 'Zwrot został wykonany.', failed: 'Zwrot nie powiódł się.', canceled: 'Zwrot został anulowany.' } as Record<string, string>)[refund.status] ?? refund.status; return <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${refund.status === 'succeeded' ? 'bg-emerald-50 text-emerald-800' : ['failed', 'requires_action'].includes(refund.status) ? 'bg-red-50 text-red-700' : 'bg-secondary'}`}>{text}{refund.error_message ? ` — ${refund.error_message}` : ''}</p> }
