import nodemailer from 'nodemailer'
import type { FormField } from '@/types'

/**
 * Email notifications via Nodemailer + Gmail SMTP.
 * Requires env vars: SMTP_USER, SMTP_PASS
 * Optional: SMTP_FROM (default: SMTP_USER)
 *
 * Gmail App Password: myaccount.google.com/apppasswords
 * .env.local example:
 *   SMTP_USER=twoj@gmail.com
 *   SMTP_PASS=xxxx xxxx xxxx xxxx
 *   SMTP_FROM=Dogdex <twoj@gmail.com>
 */

interface RegistrationEmailPayload {
  to: string
  ownerName: string
  dogName: string
  eventTitle: string
  eventDate?: string | null
  eventLocation?: string | null
  status: 'confirmed' | 'pending'
  formFields?: FormField[]
  formData?: Record<string, unknown>
}

function formatFieldValue(field: FormField, val: unknown): string {
  if (Array.isArray(val)) {
    if (field.type === 'multidate') {
      return val.map(d => {
        try { return new Intl.DateTimeFormat('pl-PL').format(new Date(d as string)) } catch { return String(d) }
      }).join(', ')
    }
    return val.join(', ')
  }
  if (field.type === 'checkbox') return val ? 'Tak' : 'Nie'
  return String(val)
}

function buildFormDataRows(fields?: FormField[], data?: Record<string, unknown>): string {
  if (!fields?.length || !data || !Object.keys(data).length) return ''
  const rows = fields
    .filter(f => data[f.id] !== undefined && data[f.id] !== null && data[f.id] !== '')
    .map(f => `<tr><td style="padding:8px;color:#64748b">${f.label}:</td><td style="padding:8px">${formatFieldValue(f, data[f.id])}</td></tr>`)
    .join('')
  if (!rows) return ''
  return `<p style="margin:16px 0 4px;font-weight:600;color:#0f172a">Dodatkowe informacje:</p>
    <table style="border-collapse:collapse;width:100%;margin-bottom:16px">${rows}</table>`
}

export async function sendRegistrationEmail(payload: RegistrationEmailPayload): Promise<void> {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Email] SMTP_USER/SMTP_PASS not set — skipping email to', payload.to)
    }
    return
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user, pass },
  })

  const statusText =
    payload.status === 'confirmed'
      ? '✅ Twój zapis został potwierdzony!'
      : '📝 Twój zapis został przyjęty i oczekuje na potwierdzenie.'

  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#0369a1">🐾 Dogdex</h2>
      <p>Cześć, <strong>${payload.ownerName}</strong>!</p>
      <p>${statusText}</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b">Wydarzenie:</td><td style="padding:8px;font-weight:600">${payload.eventTitle}</td></tr>
        ${payload.eventDate ? `<tr><td style="padding:8px;color:#64748b">Data:</td><td style="padding:8px">${payload.eventDate}</td></tr>` : ''}
        ${payload.eventLocation ? `<tr><td style="padding:8px;color:#64748b">Lokalizacja:</td><td style="padding:8px">${payload.eventLocation}</td></tr>` : ''}
        <tr><td style="padding:8px;color:#64748b">Pies:</td><td style="padding:8px">${payload.dogName}</td></tr>
      </table>
      ${buildFormDataRows(payload.formFields, payload.formData)}
      ${payload.status === 'pending' ? '<p style="color:#92400e;background:#fef3c7;padding:12px;border-radius:8px">Poczekaj na potwierdzenie od organizatora.</p>' : ''}
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Wiadomość wysłana automatycznie przez Dogdex.</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Dogdex <${user}>`,
      to: payload.to,
      subject: payload.status === 'confirmed'
        ? `✅ Zapis potwierdzony – ${payload.eventTitle}`
        : `📝 Przyjęto zapis – ${payload.eventTitle}`,
      html,
    })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Email] Błąd wysyłki maila:', err)
    }
  }
}

// ---------------------------------------------------------------------------
// Event change notifications
// ---------------------------------------------------------------------------

interface EventChangeEmailPayload {
  to: string
  ownerName: string
  dogName: string
  eventTitle: string
  changedFields: string[]
  newStartAt: string | null
  newLocation: string | null
}

function changeFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    start_at: 'Data i godzina rozpoczęcia',
    end_at: 'Data zakończenia',
    location: 'Lokalizacja',
    title: 'Tytuł wydarzenia',
  }
  return labels[field] ?? field
}

export async function sendEventChangeEmail(payload: EventChangeEmailPayload): Promise<void> {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) return

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user, pass },
  })

  const changedList = payload.changedFields
    .map(f => `<li>${changeFieldLabel(f)}</li>`)
    .join('')

  const isSignificant =
    payload.changedFields.includes('start_at') || payload.changedFields.includes('location')

  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#0369a1">🐾 Dogdex – Zmiana w wydarzeniu</h2>
      <p>Cześć, <strong>${payload.ownerName}</strong>!</p>
      <p>Organizator wprowadził zmiany w wydarzeniu, na które jesteś zapisany/-a z psem <strong>${payload.dogName}</strong>.</p>

      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b">Wydarzenie:</td><td style="padding:8px;font-weight:600">${payload.eventTitle}</td></tr>
        ${payload.newStartAt ? `<tr><td style="padding:8px;color:#64748b">Nowa data:</td><td style="padding:8px">${payload.newStartAt}</td></tr>` : ''}
        ${payload.newLocation ? `<tr><td style="padding:8px;color:#64748b">Nowa lokalizacja:</td><td style="padding:8px">${payload.newLocation}</td></tr>` : ''}
      </table>

      <p style="font-weight:600;margin-bottom:4px">Zmienione informacje:</p>
      <ul style="margin:0;padding-left:20px;color:#334155">${changedList}</ul>

      ${isSignificant ? '<p style="color:#92400e;background:#fef3c7;padding:12px;border-radius:8px;margin-top:16px">⚠️ Zmieniła się data lub lokalizacja – sprawdź szczegóły wydarzenia.</p>' : ''}

      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Wiadomość wysłana automatycznie przez Dogdex.</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Dogdex <${user}>`,
      to: payload.to,
      subject: `⚠️ Zmiana w wydarzeniu – ${payload.eventTitle}`,
      html,
    })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Email] Błąd wysyłki maila o zmianie:', err)
    }
  }
}

// ---------------------------------------------------------------------------
// Schedule notifications (time slot assignment)
// ---------------------------------------------------------------------------

interface ScheduleEmailPayload {
  to: string
  ownerName: string
  dogName: string
  eventTitle: string
  eventDate?: string | null
  eventLocation?: string | null
  slotDate: string
  slotTime: string
  slotLabel?: string | null
}

export async function sendScheduleEmail(payload: ScheduleEmailPayload): Promise<void> {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Email] SMTP_USER/SMTP_PASS not set — skipping schedule email to', payload.to)
    }
    return
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user, pass },
  })

  // Format date e.g. "14 czerwca 2025"
  let formattedDate = payload.slotDate
  try {
    formattedDate = new Intl.DateTimeFormat('pl-PL', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(payload.slotDate))
  } catch { /* keep original */ }

  // Format time e.g. "09:30"
  const formattedTime = payload.slotTime.slice(0, 5)

  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#0369a1">🐾 Dogdex – Twój termin startu</h2>
      <p>Cześć, <strong>${payload.ownerName}</strong>!</p>
      <p>Organizator przypisał Ci termin startu na wydarzeniu <strong>${payload.eventTitle}</strong>.</p>
      <div style="background:#f0f9ff;border-left:4px solid #0369a1;padding:16px;border-radius:4px;margin:16px 0">
        <p style="margin:0;font-size:24px;font-weight:700;color:#0369a1">${formattedTime}</p>
        <p style="margin:4px 0 0;color:#334155">${formattedDate}</p>
        ${payload.slotLabel ? `<p style="margin:4px 0 0;color:#64748b;font-size:14px">${payload.slotLabel}</p>` : ''}
      </div>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b">Wydarzenie:</td><td style="padding:8px;font-weight:600">${payload.eventTitle}</td></tr>
        ${payload.eventDate ? `<tr><td style="padding:8px;color:#64748b">Termin eventu:</td><td style="padding:8px">${payload.eventDate}</td></tr>` : ''}
        ${payload.eventLocation ? `<tr><td style="padding:8px;color:#64748b">Miejsce:</td><td style="padding:8px">${payload.eventLocation}</td></tr>` : ''}
        <tr><td style="padding:8px;color:#64748b">Pies:</td><td style="padding:8px">${payload.dogName}</td></tr>
      </table>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Wiadomość wysłana automatycznie przez Dogdex.</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Dogdex <${user}>`,
      to: payload.to,
      subject: `📅 Twój termin startu – ${payload.eventTitle} – ${formattedTime} ${formattedDate}`,
      html,
    })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Email] Błąd wysyłki grafiku:', err)
    }
  }
}
