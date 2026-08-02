import Link from 'next/link'
import { Calculator, CalendarDays, CheckCircle2, Clock3, Plus } from 'lucide-react'
import CompetitionFormatActions from '@/components/CompetitionFormatActions'
import {
  createAuthClient,
  createServerClient,
  hasServiceRoleKey,
} from '@/lib/supabaseServer'
import { requireRole } from '@/lib/getServerUser'
import { formatDate, plForm } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function CompetitionFormatsPage() {
  const { user, role } = await requireRole(['organizer', 'admin'])
  const supabase = await createAuthClient()
  let query = supabase
    .from('competition_formats')
    .select('id, family_id, name, description, version, status, is_system, created_by, published_at, created_at, updated_at')
    .order('updated_at', { ascending: false })
  if (role !== 'admin') {
    query = query.or(`created_by.eq.${user.id},and(is_system.eq.true,status.eq.published)`)
  }
  const { data: formats } = await query
  const formatIds = (formats ?? []).map(format => format.id)
  const usageClient = hasServiceRoleKey() ? createServerClient() : supabase
  const { data: usingEvents } = formatIds.length > 0
    ? await usageClient
        .from('events')
        .select('competition_format_id')
        .in('competition_format_id', formatIds)
    : { data: [] }

  const usageByFormat = new Map<string, number>()
  for (const event of usingEvents ?? []) {
    if (!event.competition_format_id) continue
    usageByFormat.set(
      event.competition_format_id,
      (usageByFormat.get(event.competition_format_id) ?? 0) + 1,
    )
  }

  const latestByFamily = new Map<string, { id: string; version: number }>()
  const draftByFamily = new Map<string, string>()
  for (const format of formats ?? []) {
    const latest = latestByFamily.get(format.family_id)
    if (!latest || format.version > latest.version) {
      latestByFamily.set(format.family_id, { id: format.id, version: format.version })
    }
    if (format.status === 'draft') draftByFamily.set(format.family_id, format.id)
  }

  return (
    <div className="w-full space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Silnik zawodów</p>
          <h1 className="page-title mt-2">Formaty wyników</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Twórz wersjonowane reguły prób, obliczeń, rankingów i widoków.
          </p>
        </div>
        <Link href="/organizer/formats/new" className="btn btn-primary">
          <Plus className="h-4 w-4" />
          Nowy format
        </Link>
      </div>

      {(formats ?? []).length === 0 ? (
        <div className="rounded-3xl border border-dashed border-sage-300 bg-sage-50 p-14 text-center">
          <Calculator className="mx-auto h-10 w-10 text-accent" />
          <h2 className="mt-4 font-heading text-xl font-bold">Brak formatów</h2>
          <p className="mt-2 text-sm text-muted-foreground">Utwórz pierwszy format i przypnij go do nowego wydarzenia.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(formats ?? []).map(format => {
            const usageCount = usageByFormat.get(format.id) ?? 0
            const latest = latestByFamily.get(format.family_id)
            const existingDraftId = draftByFamily.get(format.family_id)
            const canManage = role === 'admin'
              || (format.created_by === user.id && !format.is_system)
            const canCreateVersion = format.status === 'published'
              && (role === 'admin' || canManage || format.is_system)

            return (
            <article
              key={format.id}
              className={`rounded-3xl border bg-card p-6 shadow-sm ${
                format.status === 'archived'
                  ? 'border-sage-200 bg-sage-50/60 opacity-80'
                  : 'border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading text-lg font-bold text-foreground">{format.name}</h2>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Wersja {format.version} · {format.status === 'published' ? 'opublikowany' : format.status === 'draft' ? 'szkic' : 'archiwalny'}
                  </p>
                </div>
                {format.is_system && <span className="badge badge-green">Dogdex</span>}
              </div>
              <p className="mt-4 min-h-10 text-sm text-muted-foreground">
                {format.description || 'Bez opisu.'}
              </p>
              <dl className="mt-5 grid gap-2 border-t border-sage-100 pt-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-accent" />
                  <span>{plForm(usageCount, 'wydarzenie używa', 'wydarzenia używają', 'wydarzeń używa')} tej wersji</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock3 className="h-3.5 w-3.5 text-accent" />
                  <span>
                    {format.published_at
                      ? `Opublikowano ${formatDate(format.published_at)}`
                      : `Utworzono ${formatDate(format.created_at)}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                  <span>
                    {latest?.id === format.id
                      ? 'To jest najnowsza wersja'
                      : `Najnowsza jest wersja ${latest?.version ?? format.version}`}
                  </span>
                </div>
              </dl>
              <div className="mt-5">
                <CompetitionFormatActions
                  formatId={format.id}
                  status={format.status}
                  usageCount={usageCount}
                  canManage={canManage}
                  canCreateVersion={canCreateVersion}
                  existingDraftId={existingDraftId === format.id ? null : existingDraftId}
                  compact
                />
              </div>
            </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
