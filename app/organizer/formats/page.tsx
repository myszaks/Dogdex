import Link from 'next/link'
import { Calculator, Edit3, Plus } from 'lucide-react'
import { createAuthClient } from '@/lib/supabaseServer'
import { requireRole } from '@/lib/getServerUser'

export const dynamic = 'force-dynamic'

export default async function CompetitionFormatsPage() {
  const { user, role } = await requireRole(['organizer', 'admin'])
  const supabase = await createAuthClient()
  let query = supabase
    .from('competition_formats')
    .select('id, name, description, version, status, is_system, created_by, updated_at')
    .order('updated_at', { ascending: false })
  if (role !== 'admin') {
    query = query.or(`created_by.eq.${user.id},and(is_system.eq.true,status.eq.published)`)
  }
  const { data: formats } = await query

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Silnik zawodów</p>
          <h1 className="page-title mt-2">Formaty wyników i live</h1>
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
          {(formats ?? []).map(format => (
            <article key={format.id} className="rounded-3xl border border-border bg-card p-6 shadow-sm">
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
              <div className="mt-5 border-t border-sage-100 pt-4">
                {format.status === 'draft' && (role === 'admin' || format.created_by === user.id) ? (
                  <Link href={`/organizer/formats/${format.id}/edit`} className="btn btn-secondary btn-sm">
                    <Edit3 className="h-4 w-4" />
                    Edytuj szkic
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Opublikowana wersja jest niezmienna.
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
