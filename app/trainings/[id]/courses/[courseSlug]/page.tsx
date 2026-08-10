import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarDays, Clock, MapPin, ShieldCheck } from 'lucide-react'
import { createAuthClient } from '@/lib/supabaseServer'
import TrainingCourseEnrollmentAction from '@/components/TrainingCourseEnrollmentAction'
import type { TrainingCourse } from '@/types'

export const dynamic = 'force-dynamic'

export default async function PublicTrainingCoursePage({ params }: { params: Promise<{ id: string; courseSlug: string }> }) {
  const { id, courseSlug } = await params
  const db = await createAuthClient()
  const { data: trainer } = await db.from('trainer_profiles').select('trainer_id, slug, full_name, location_city').eq('slug', id).maybeSingle()
  if (!trainer) notFound()
  const { data: course } = await db.from('training_courses').select('*, training_course_sessions(*)')
    .eq('trainer_id', trainer.trainer_id).eq('slug', courseSlug).eq('status', 'published').maybeSingle()
  if (!course) notFound()
  const sessions = (course.training_course_sessions ?? []).slice().sort((a: { starts_at: string }, b: { starts_at: string }) => a.starts_at.localeCompare(b.starts_at))

  return <div className="w-full py-8">
    <Link href={`/trainings/${trainer.slug}`} className="mb-6 inline-flex items-center gap-2 text-accent hover:underline"><ArrowLeft className="h-4 w-4" /> Wróć do profilu trenera</Link>
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <main className="space-y-6">
        <section className="card">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Kurs grupowy · {trainer.full_name}</p>
          <h1 className="mt-2 font-heading text-3xl font-bold">{course.name}</h1>
          {course.description && <p className="mt-4 whitespace-pre-wrap text-muted-foreground">{course.description}</p>}
          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <p><MapPin className="mr-2 inline h-4 w-4 text-accent" />{course.location || trainer.location_city || 'Miejsce do ustalenia'}</p>
            <p><CalendarDays className="mr-2 inline h-4 w-4 text-accent" />{sessions.length} spotkań</p>
            <p><ShieldCheck className="mr-2 inline h-4 w-4 text-accent" />Limit grupy: {course.capacity}</p>
            <p className="font-semibold">{Number(course.price) > 0 ? Number(course.price).toLocaleString('pl-PL', { style: 'currency', currency: course.currency }) : 'Bezpłatnie'}</p>
          </div>
        </section>
        {course.participant_message && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold">Komunikat trenera</h2><p className="mt-2 whitespace-pre-wrap text-sm">{course.participant_message}</p></section>}
        <section className="card"><h2 className="font-heading text-xl font-semibold">Harmonogram</h2><ol className="mt-4 divide-y divide-border">{sessions.map((session: { id: string; starts_at: string; duration_min: number; status: string; cancellation_reason?: string | null }) => <li key={session.id} className="flex items-start justify-between gap-4 py-3"><div><p className={session.status === 'cancelled' ? 'line-through text-muted-foreground' : 'font-medium'}>{new Date(session.starts_at).toLocaleString('pl-PL')}</p>{session.cancellation_reason && <p className="mt-1 text-xs text-red-700">{session.cancellation_reason}</p>}</div><span className="flex items-center gap-1 text-sm text-muted-foreground"><Clock className="h-4 w-4" /> {session.duration_min} min</span></li>)}</ol></section>
        {course.cancellation_policy && <section className="card"><h2 className="font-heading text-xl font-semibold">Zasady rezygnacji i zwrotów</h2><p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{course.cancellation_policy}</p></section>}
      </main>
      <aside><TrainingCourseEnrollmentAction course={course as TrainingCourse} /></aside>
    </div>
  </div>
}
