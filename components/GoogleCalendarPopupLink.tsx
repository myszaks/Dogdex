'use client'

import { CalendarPlus, ExternalLink } from 'lucide-react'

interface Props {
  href: string
  label: string
  className?: string
  presentation?: 'button' | 'date'
}

export default function GoogleCalendarPopupLink({ href, label, className, presentation = 'button' }: Props) {
  function openCalendar(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    const width = Math.min(760, window.screen.availWidth)
    const height = Math.min(820, window.screen.availHeight)
    const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2))
    const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2))
    const popup = window.open(
      href,
      'dogdex-google-calendar',
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    )
    if (!popup) {
      window.location.assign(href)
      return
    }
    try { popup.opener = null } catch { /* Browser controls opener isolation. */ }
    popup.focus()
  }

  if (presentation === 'date') {
    return (
      <a href={href} onClick={openCalendar} className={className}>
        <span className="font-semibold">{label}</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent">
          Dodaj <ExternalLink className="h-4 w-4" />
        </span>
      </a>
    )
  }

  return (
    <a href={href} onClick={openCalendar} className={className}>
      <CalendarPlus className="h-4 w-4" />
      {label}
    </a>
  )
}
