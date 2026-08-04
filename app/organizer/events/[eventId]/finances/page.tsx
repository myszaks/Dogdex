import { notFound } from 'next/navigation'
import { getEventAccess } from '@/lib/eventAccess'
import { createAuthClient } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

export default async function EventFinancesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const access = await getEventAccess(eventId)
  if (!access?.can('finance')) notFound()
  const supabase = await createAuthClient()
  const { data: registrations } = await supabase
    .from('registrations')
    .select('id, participants(owner_name, owner_email, dog_name)')
    .eq('event_id', access.event.id)
  const ids = (registrations ?? []).map(registration => registration.id)
  const { data: payments } = ids.length
    ? await supabase
        .from('event_payments')
        .select('id, registration_id, amount, refunded_amount, currency, status, payer_email, created_at, receipt_url, reconciliation_status')
        .in('registration_id', ids)
        .order('created_at', { ascending: false })
    : { data: [] }
  const registrationMap = new Map((registrations ?? []).map(registration => [registration.id, registration.participants]))
  const completed = (payments ?? []).filter(payment => ['completed', 'partially_refunded', 'refunded'].includes(payment.status))
  const gross = completed.reduce((sum, payment) => sum + Number(payment.amount), 0)
  const refunded = completed.reduce((sum, payment) => sum + Number(payment.refunded_amount ?? 0), 0)
  const currency = payments?.[0]?.currency ?? 'PLN'

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Wpłaty brutto" value={money(gross, currency)} />
        <Metric label="Zwroty" value={money(refunded, currency)} />
        <Metric label="Po zwrotach" value={money(gross - refunded, currency)} />
      </div>
      <section className="card overflow-hidden">
        <div className="border-b border-border p-5">
          <h2 className="font-heading text-xl font-semibold">Płatności za wydarzenie</h2>
          <p className="mt-1 text-sm text-muted-foreground">Historia wpłat oraz ich aktualny stan.</p>
        </div>
        {payments?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                <tr><th className="px-5 py-3">Uczestnik</th><th className="px-5 py-3">Kwota</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Data</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map(payment => {
                  const participantValue = registrationMap.get(payment.registration_id)
                  const participant = Array.isArray(participantValue) ? participantValue[0] : participantValue
                  return (
                    <tr key={payment.id}>
                      <td className="px-5 py-4"><span className="block font-medium">{participant?.dog_name ?? payment.payer_email}</span><span className="text-xs text-muted-foreground">{participant?.owner_name ?? payment.payer_email}</span></td>
                      <td className="px-5 py-4 font-medium">{money(Number(payment.amount) - Number(payment.refunded_amount ?? 0), payment.currency)}</td>
                      <td className="px-5 py-4">{paymentStatus(payment.status)}</td>
                      <td className="px-5 py-4 text-muted-foreground">{new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(payment.created_at))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="p-8 text-center text-sm text-muted-foreground">To wydarzenie nie ma jeszcze płatności.</p>}
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 font-heading text-2xl font-bold">{value}</p></div>
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(value)
}

function paymentStatus(status: string) {
  const labels: Record<string, string> = { pending: 'Oczekuje', completed: 'Opłacona', failed: 'Nieudana', partially_refunded: 'Częściowo zwrócona', refunded: 'Zwrócona' }
  return labels[status] ?? status
}
