import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LockKeyhole,
} from 'lucide-react'
import CompetitionFormatActions from '@/components/CompetitionFormatActions'
import CompetitionFormatPreview from '@/components/CompetitionFormatPreview'
import { requireRole } from '@/lib/getServerUser'
import {
  createAuthClient,
  createServerClient,
  hasServiceRoleKey,
} from '@/lib/supabaseServer'
import { formatDate, plForm } from '@/lib/utils'
import type { CompetitionFormatDefinition } from '@/types/competition'

interface Props {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

export default async function CompetitionFormatPreviewPage({ params }: Props) {
  const { id } = await params
  const { user, role } = await requireRole(['organizer', 'admin'])
  const supabase = await createAuthClient()

  const { data: format } = await supabase
    .from('competition_formats')
    .select('id, family_id, version, name, description, status, definition, is_system, created_by, published_at, created_at')
    .eq('id', id)
    .maybeSingle()

  if (!format) notFound()

  const usageClient = hasServiceRoleKey() ? createServerClient() : supabase
  const [
    { count: usageCount },
    { data: familyVersions },
  ] = await Promise.all([
    usageClient
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('competition_format_id', format.id),
    supabase
      .from('competition_formats')
      .select('id, version, status')
      .eq('family_id', format.family_id)
      .order('version', { ascending: false }),
  ])

  const newest = familyVersions?.[0] ?? null
  const existingDraft = familyVersions?.find(candidate => candidate.status === 'draft') ?? null
  const canManage = role === 'admin'
    || (format.created_by === user.id && !format.is_system)
  const canCreateVersion = format.status === 'published'
    && (role === 'admin' || canManage || format.is_system)
  const count = usageCount ?? 0

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link
        href="/organizer/formats"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Biblioteka formatów
      </Link>

      <header className="rounded-3xl bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className={format.status === 'published' ? 'badge badge-green' : 'badge'}>
                {format.status === 'published'
                  ? 'Opublikowany'
                  : format.status === 'draft'
                    ? 'Szkic'
                    : 'Archiwalny'}
              </span>
              <span className="badge">Wersja {format.version}</span>
              {format.is_system && <span className="badge badge-green">Dogdex</span>}
              {newest?.id === format.id && (
                <span className="badge">Najnowsza wersja</span>
              )}
            </div>
            <h1 className="page-title mt-4">{format.name}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {format.description || 'Ten format nie ma opisu.'}
            </p>
          </div>

          <CompetitionFormatActions
            formatId={format.id}
            status={format.status}
            usageCount={count}
            canManage={canManage}
            canCreateVersion={canCreateVersion}
            existingDraftId={existingDraft?.id}
            showPreview={false}
          />
        </div>

        <dl className="mt-6 grid gap-3 border-t border-sage-100 pt-5 sm:grid-cols-2 xl:grid-cols-4">
          <Meta
            Icon={CalendarDays}
            label="Użycie"
            value={plForm(count, 'wydarzenie', 'wydarzenia', 'wydarzeń')}
          />
          <Meta
            Icon={Clock3}
            label={format.published_at ? 'Data publikacji' : 'Data utworzenia'}
            value={formatDate(format.published_at ?? format.created_at)}
          />
          <Meta
            Icon={CheckCircle2}
            label="Najnowsza w rodzinie"
            value={newest ? `Wersja ${newest.version}${newest.id === format.id ? ' — ta wersja' : ''}` : `Wersja ${format.version}`}
          />
          <Meta
            Icon={LockKeyhole}
            label="Zasady"
            value={format.status === 'draft' ? 'Można edytować' : 'Tylko do odczytu'}
          />
        </dl>
      </header>

      {format.status === 'published' && (
        <div className="flex gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-900">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Ta wersja jest niezmienna. Wydarzenia, które jej używają, zachowają dokładnie
            te zasady nawet po utworzeniu kolejnej wersji.
          </p>
        </div>
      )}

      <CompetitionFormatPreview definition={format.definition as CompetitionFormatDefinition} />
    </div>
  )
}

function Meta({
  Icon,
  label,
  value,
}: {
  Icon: typeof CalendarDays
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-sage-50 px-4 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div>
        <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</dt>
        <dd className="mt-1 text-sm font-bold text-foreground">{value}</dd>
      </div>
    </div>
  )
}
