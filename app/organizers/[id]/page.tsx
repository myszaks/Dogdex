import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarDays, ExternalLink, MapPin, Star, UserRound } from 'lucide-react'
import { createServerClient } from '@/lib/supabaseServer'
import { effectiveEventStatus } from '@/lib/eventStatus'
import { isOrganizerRole } from '@/lib/roles'
import type { DogEvent, EventReview, OrganizerProfile } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const dynamic = 'force-dynamic'

export default async function OrganizerPublicProfilePage({ params }: Props) {
  const { id } = await params
  const supabase = createServerClient()
  const { data: storedProfile } = await supabase
    .from('organizer_profiles')
    .select('*')
    .eq(UUID_RE.test(id) ? 'organizer_id' : 'slug', id)
    .maybeSingle()

  let profile = storedProfile as OrganizerProfile | null
  if (profile && !profile.is_active) notFound()
  if (!profile && UUID_RE.test(id)) {
    const { data: account } = await supabase
      .from('profiles')
      .select('id, full_name, company, role, created_at')
      .eq('id', id)
      .maybeSingle()
    if (account && isOrganizerRole(account.role)) {
      profile = {
        id: account.id,
        organizer_id: account.id,
        slug: account.id,
        display_name: account.full_name || account.company || 'Organizator Dogdex',
        organization_name: account.company,
        bio: null,
        profile_image_url: null,
        location_city: null,
        website_url: null,
        is_active: true,
        created_at: account.created_at,
        updated_at: account.created_at,
      }
    }
  }
  if (!profile) notFound()

  const [{ data: events }, { data: reviews }] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .eq('created_by', profile.organizer_id)
      .neq('status', 'draft')
      .order('start_at', { ascending: false })
      .limit(12),
    supabase
      .from('event_reviews')
      .select('id, event_id, organizer_id, user_id, author_name, rating, comment, created_at, updated_at, events(id, slug, title)')
      .eq('organizer_id', profile.organizer_id)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const organizerReviews = (reviews ?? []) as unknown as EventReview[]
  const rating = organizerReviews.length
    ? Math.round((organizerReviews.reduce((sum, review) => sum + Number(review.rating), 0) / organizerReviews.length) * 10) / 10
    : null

  return (
    <div className="w-full space-y-8 py-6">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-accent hover:underline">
        <ArrowLeft className="h-4 w-4" /> Wróć do wydarzeń
      </Link>

      <section className="overflow-hidden rounded-3xl bg-card shadow-sm">
        <div className="h-28 bg-[radial-gradient(circle_at_20%_20%,rgba(255,128,36,0.35),transparent_35%),linear-gradient(135deg,#1E3932,#10231f)]" />
        <div className="px-6 pb-7 sm:px-8">
          <div className="-mt-12 flex flex-col gap-5 sm:flex-row sm:items-end">
            <div className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-secondary text-primary shadow-sm">
              {profile.profile_image_url ? (
                <Image src={profile.profile_image_url} alt={profile.display_name} fill unoptimized className="object-cover" />
              ) : <UserRound className="h-12 w-12" />}
            </div>
            <div className="min-w-0 flex-1 sm:pb-1">
              <h1 className="font-heading text-3xl font-bold text-primary">{profile.display_name}</h1>
              {profile.organization_name && <p className="mt-1 font-medium text-muted-foreground">{profile.organization_name}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {rating ?? '—'} <span className="font-normal text-muted-foreground">({organizerReviews.length})</span>
                </span>
                {profile.location_city && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{profile.location_city}</span>}
              </div>
            </div>
            {profile.website_url && (
              <a href={profile.website_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                Strona organizatora <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
          {profile.bio && <p className="mt-6 max-w-3xl whitespace-pre-wrap leading-7 text-muted-foreground">{profile.bio}</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-5 font-heading text-2xl font-semibold text-primary">Wydarzenia organizatora</h2>
        {(events ?? []).length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(events as DogEvent[]).map(event => {
              const status = effectiveEventStatus(event)
              const href = status === 'finished' || status === 'cancelled'
                ? `/archive/${event.slug}`
                : `/events/${event.slug}`
              return (
                <Link key={event.id} href={href} className="card p-5 transition-shadow hover:shadow-md">
                  <h3 className="font-heading text-lg font-semibold text-foreground">{event.title}</h3>
                  {event.start_at && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4 text-accent" />{new Date(event.start_at).toLocaleDateString('pl-PL')}</p>}
                  {event.location && <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4 text-accent" />{event.location}</p>}
                </Link>
              )
            })}
          </div>
        ) : <div className="card p-6 text-muted-foreground">Brak publicznych wydarzeń.</div>}
      </section>

      <section>
        <h2 className="mb-5 font-heading text-2xl font-semibold text-primary">Opinie uczestników</h2>
        {organizerReviews.length ? (
          <div className="space-y-4">
            {organizerReviews.map(review => {
              const event = Array.isArray(review.events) ? review.events[0] : review.events
              return (
                <article key={review.id} className="card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{review.author_name}</p>
                      {event && <Link href={`/archive/${event.slug}`} className="mt-1 text-xs text-accent hover:underline">{event.title}</Link>}
                    </div>
                    <span className="inline-flex items-center gap-1 font-semibold"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{review.rating}/5</span>
                  </div>
                  {review.comment && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{review.comment}</p>}
                  <p className="mt-3 text-xs text-muted-foreground">{new Date(review.created_at).toLocaleDateString('pl-PL')}</p>
                </article>
              )
            })}
          </div>
        ) : <div className="card p-6 text-muted-foreground">Ten organizator nie ma jeszcze opinii.</div>}
      </section>
    </div>
  )
}
