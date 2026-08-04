'use client'

import { useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'
import useUser from '@/hooks/useUser'
import { formatDate } from '@/lib/utils'

interface Announcement { id: string; title: string; body: string; created_at: string }

export default function EventAnnouncementsHistory({ eventId }: { eventId: string }) {
  const { user } = useUser()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  useEffect(() => {
    if (!user) {
      return
    }
    fetch(`/api/events/${eventId}/announcements`)
      .then(response => response.ok ? response.json() : [])
      .then(data => setAnnouncements(Array.isArray(data) ? data : []))
      .catch(() => setAnnouncements([]))
  }, [eventId, user])

  if (!user || announcements.length === 0) return null

  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-foreground"><Megaphone className="h-5 w-5 text-accent" />Komunikaty organizatora</h2>
      <div className="mt-4 space-y-3">
        {announcements.map(announcement => (
          <article key={announcement.id} className="rounded-2xl bg-secondary/70 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <p className="font-semibold text-foreground">{announcement.title}</p>
              <time className="shrink-0 text-xs text-muted-foreground">{formatDate(announcement.created_at)}</time>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{announcement.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
