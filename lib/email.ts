import nodemailer from 'nodemailer'
import type { FormField } from '@/types'
import { plForm } from '@/lib/utils'
import { formatEmailDate, formatEmailDateTime } from '@/lib/emailDate'

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

function escHtml(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

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
  if (typeof val === 'boolean') return val ? 'Tak' : 'Nie'
  if (field.type === 'checkbox' && typeof val === 'string') {
    const normalized = val.trim().toLowerCase()
    if (normalized === 'true') return 'Tak'
    if (normalized === 'false') return 'Nie'
  }
  if (Array.isArray(val)) {
    if (field.type === 'multidate') {
      return val.map(d => {
        return escHtml(formatEmailDate(String(d), { weekday: false }))
      }).join(', ')
    }
    return val.map(v => escHtml(formatFieldValue(field, v))).join(', ')
  }
  return escHtml(String(val))
}

function buildFormDataRows(fields?: FormField[], data?: Record<string, unknown>): string {
  if (!fields?.length || !data || !Object.keys(data).length) return ''
  const rows = fields
    .filter(f => data[f.id] !== undefined && data[f.id] !== null && data[f.id] !== '')
    .map(f => `<tr><td style="padding:8px;color:#64748b">${escHtml(f.label)}:</td><td style="padding:8px">${formatFieldValue(f, data[f.id])}</td></tr>`)
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
      <p>Cześć, <strong>${escHtml(payload.ownerName)}</strong>!</p>
      <p>${statusText}</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b">Wydarzenie:</td><td style="padding:8px;font-weight:600">${escHtml(payload.eventTitle)}</td></tr>
        ${payload.eventDate ? `<tr><td style="padding:8px;color:#64748b">Data:</td><td style="padding:8px">${escHtml(formatEmailDateTime(payload.eventDate))}</td></tr>` : ''}
        ${payload.eventLocation ? `<tr><td style="padding:8px;color:#64748b">Lokalizacja:</td><td style="padding:8px">${escHtml(payload.eventLocation)}</td></tr>` : ''}
        <tr><td style="padding:8px;color:#64748b">Pies:</td><td style="padding:8px">${escHtml(payload.dogName)}</td></tr>
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
    .map(f => `<li>${escHtml(changeFieldLabel(f))}</li>`)
    .join('')

  const isSignificant =
    payload.changedFields.includes('start_at') || payload.changedFields.includes('location')

  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#0369a1">🐾 Dogdex – Zmiana w wydarzeniu</h2>
      <p>Cześć, <strong>${escHtml(payload.ownerName)}</strong>!</p>
      <p>Organizator wprowadził zmiany w wydarzeniu, na które jesteś zapisany/-a z psem <strong>${escHtml(payload.dogName)}</strong>.</p>

      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b">Wydarzenie:</td><td style="padding:8px;font-weight:600">${escHtml(payload.eventTitle)}</td></tr>
        ${payload.newStartAt ? `<tr><td style="padding:8px;color:#64748b">Nowa data:</td><td style="padding:8px">${escHtml(formatEmailDateTime(payload.newStartAt))}</td></tr>` : ''}
        ${payload.newLocation ? `<tr><td style="padding:8px;color:#64748b">Nowa lokalizacja:</td><td style="padding:8px">${escHtml(payload.newLocation)}</td></tr>` : ''}
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

interface ScheduleSlot {
  slotDate: string
  slotTime: string
  slotLabel?: string | null
  dogName?: string | null
}

interface ScheduleEmailPayload {
  to: string
  ownerName: string
  dogNames: string[]
  eventTitle: string
  eventDate?: string | null
  eventLocation?: string | null
  slots: ScheduleSlot[]
}

function formatSlotDate(date: string): string {
  return formatEmailDate(date, { weekday: true })
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

  const sortedSlots = [...payload.slots].sort(
    (a, b) => a.slotDate.localeCompare(b.slotDate) || a.slotTime.localeCompare(b.slotTime)
  )

  const multiDog = payload.dogNames.length > 1

  const slotsHtml = sortedSlots.map(s => {
    const time = s.slotTime.slice(0, 5)
    const date = formatSlotDate(s.slotDate)
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">
          <span style="font-size:18px;font-weight:700;color:#0369a1">${escHtml(time)}</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155">
          ${escHtml(date)}
          ${s.slotLabel ? `<br><span style="color:#64748b;font-size:13px">${escHtml(s.slotLabel)}</span>` : ''}
        </td>
        ${multiDog ? `<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0369a1;font-weight:600">${escHtml(s.dogName ?? '')}</td>` : ''}
      </tr>`
  }).join('')

  const isMultiple = sortedSlots.length > 1
  const subjectSlot = isMultiple
    ? plForm(sortedSlots.length, 'termin', 'terminy', 'terminów')
    : `${sortedSlots[0].slotTime.slice(0, 5)} ${formatSlotDate(sortedSlots[0].slotDate)}`

  const dogLabel = multiDog
    ? `Psy: ${payload.dogNames.map(d => escHtml(d)).join(', ')}`
    : `Pies: ${escHtml(payload.dogNames[0] ?? '')}`

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#0369a1">🐾 Dogdex – ${isMultiple ? 'Twoje terminy startów' : 'Twój termin startu'}</h2>
      <p>Cześć, <strong>${escHtml(payload.ownerName)}</strong>!</p>
      <p>Organizator przypisał Ci ${isMultiple ? 'terminy startów' : 'termin startu'} na wydarzeniu
         <strong>${escHtml(payload.eventTitle)}</strong>.</p>

      <table style="border-collapse:collapse;width:100%;margin:16px 0;background:#f0f9ff;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#0369a1">
            <th style="padding:10px 12px;text-align:left;color:#fff;font-size:13px">Godzina</th>
            <th style="padding:10px 12px;text-align:left;color:#fff;font-size:13px">Data</th>
            ${multiDog ? '<th style="padding:10px 12px;text-align:left;color:#fff;font-size:13px">Pies</th>' : ''}
          </tr>
        </thead>
        <tbody>${slotsHtml}</tbody>
      </table>

      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b">Wydarzenie:</td><td style="padding:8px;font-weight:600">${escHtml(payload.eventTitle)}</td></tr>
        ${payload.eventLocation ? `<tr><td style="padding:8px;color:#64748b">Miejsce:</td><td style="padding:8px">${escHtml(payload.eventLocation)}</td></tr>` : ''}
        <tr><td style="padding:8px;color:#64748b">${multiDog ? 'Psy' : 'Pies'}:</td><td style="padding:8px">${payload.dogNames.map(d => escHtml(d)).join(', ')}</td></tr>
      </table>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Wiadomość wysłana automatycznie przez Dogdex.</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Dogdex <${user}>`,
      to: payload.to,
      subject: `📅 ${isMultiple ? 'Twoje terminy startów' : 'Twój termin startu'} – ${escHtml(payload.eventTitle)} – ${subjectSlot}`,
      html,
    })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Email] Błąd wysyłki grafiku:', err)
    }
  }
}

// ---------------------------------------------------------------------------
// Cancellation notification to organizer
// ---------------------------------------------------------------------------

interface CancellationEmailPayload {
  to: string           // organizer email
  ownerName: string
  dogName: string
  eventTitle: string
  eventDate?: string | null
  eventLocation?: string | null
  previousStatus: string
}

export async function sendCancellationEmailToOrganizer(payload: CancellationEmailPayload): Promise<void> {
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  if (!smtpUser || !smtpPass) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Email] SMTP not configured — skipping cancellation email to', payload.to)
    }
    return
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  })

  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#dc2626">🐾 Dogdex – Rezygnacja z eventu</h2>
      <p>Uczestnik zrezygnował z udziału w Twoim wydarzeniu.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b">Wydarzenie:</td><td style="padding:8px;font-weight:600">${escHtml(payload.eventTitle)}</td></tr>
        ${payload.eventDate ? `<tr><td style="padding:8px;color:#64748b">Data:</td><td style="padding:8px">${escHtml(formatEmailDateTime(payload.eventDate))}</td></tr>` : ''}
        ${payload.eventLocation ? `<tr><td style="padding:8px;color:#64748b">Lokalizacja:</td><td style="padding:8px">${escHtml(payload.eventLocation)}</td></tr>` : ''}
        <tr><td style="padding:8px;color:#64748b">Właściciel:</td><td style="padding:8px">${escHtml(payload.ownerName)}</td></tr>
        <tr><td style="padding:8px;color:#64748b">Pies:</td><td style="padding:8px">${escHtml(payload.dogName)}</td></tr>
        <tr><td style="padding:8px;color:#64748b">Poprzedni status:</td><td style="padding:8px">${payload.previousStatus === 'confirmed' ? 'Potwierdzony' : 'Oczekujący'}</td></tr>
      </table>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Wiadomość wysłana automatycznie przez Dogdex.</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Dogdex <${smtpUser}>`,
      to: payload.to,
      subject: `❌ Rezygnacja: ${payload.dogName} (${payload.ownerName}) – ${payload.eventTitle}`,
      html,
    })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Email] Błąd wysyłki rezygnacji:', err)
    }
  }
}

// ---------------------------------------------------------------------------
// Cancellation request notification to organizer (new approval flow)
// ---------------------------------------------------------------------------

interface CancellationRequestEmailPayload {
  to: string           // organizer email
  ownerName: string
  dogName: string
  eventTitle: string
  eventDate?: string | null
  eventLocation?: string | null
  cancelledDates: string[] | null  // null = full cancellation
}

export async function sendCancellationRequestEmailToOrganizer(
  payload: CancellationRequestEmailPayload
): Promise<void> {
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  if (!smtpUser || !smtpPass) return

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  })

  const datesHtml = payload.cancelledDates
    ? payload.cancelledDates.map(d => {
        return `<li>${escHtml(formatEmailDate(d))}</li>`
      }).join('')
    : null

  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#ea580c">🐾 Dogdex – Wniosek o rezygnację</h2>
      <p>Uczestnik złożył wniosek o rezygnację z Twojego wydarzenia i oczekuje na Twoją akceptację.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b">Wydarzenie:</td><td style="padding:8px;font-weight:600">${escHtml(payload.eventTitle)}</td></tr>
        ${payload.eventDate ? `<tr><td style="padding:8px;color:#64748b">Data:</td><td style="padding:8px">${escHtml(formatEmailDateTime(payload.eventDate))}</td></tr>` : ''}
        ${payload.eventLocation ? `<tr><td style="padding:8px;color:#64748b">Lokalizacja:</td><td style="padding:8px">${escHtml(payload.eventLocation)}</td></tr>` : ''}
        <tr><td style="padding:8px;color:#64748b">Właściciel:</td><td style="padding:8px">${escHtml(payload.ownerName)}</td></tr>
        <tr><td style="padding:8px;color:#64748b">Pies:</td><td style="padding:8px">${escHtml(payload.dogName)}</td></tr>
      </table>
      ${datesHtml
        ? `<p style="font-weight:600;margin-bottom:4px">Terminy do anulowania:</p><ul style="margin:0;padding-left:20px;color:#334155">${datesHtml}</ul>`
        : `<p style="color:#dc2626;background:#fef2f2;padding:12px;border-radius:8px">Uczestnik chce anulować <strong>całe zgłoszenie</strong>.</p>`
      }
      <p style="margin-top:16px">Zaloguj się do panelu organizatora, aby zaakceptować lub odrzucić wniosek.</p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Wiadomość wysłana automatycznie przez Dogdex.</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Dogdex <${smtpUser}>`,
      to: payload.to,
      subject: `⚠️ Wniosek o rezygnację: ${payload.dogName} (${payload.ownerName}) – ${payload.eventTitle}`,
      html,
    })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Email] Błąd wysyłki wniosku o rezygnację:', err)
    }
  }
}

// ---------------------------------------------------------------------------
// Cancellation result email to participant (accepted / rejected)
// ---------------------------------------------------------------------------

interface CancellationResultEmailPayload {
  to: string           // participant email
  ownerName: string
  dogName: string
  eventTitle: string
  eventDate?: string | null
  cancelledDates: string[] | null
  accepted: boolean
}

export async function sendCancellationResultEmail(
  payload: CancellationResultEmailPayload
): Promise<void> {
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  if (!smtpUser || !smtpPass) return

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  })

  const datesHtml = payload.cancelledDates
    ? payload.cancelledDates.map(d => {
        return `<li>${escHtml(formatEmailDate(d))}</li>`
      }).join('')
    : null

  const heading = payload.accepted
    ? '✅ Wniosek o rezygnację zaakceptowany'
    : '❌ Wniosek o rezygnację odrzucony'

  const bodyText = payload.accepted
    ? payload.cancelledDates
      ? 'Organizator zaakceptował Twój wniosek o rezygnację z wybranych terminów.'
      : 'Organizator zaakceptował Twój wniosek. Twoje zgłoszenie zostało anulowane.'
    : 'Organizator odrzucił Twój wniosek o rezygnację. Twoje zgłoszenie pozostaje aktywne.'

  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:${payload.accepted ? '#16a34a' : '#dc2626'}">🐾 Dogdex – ${escHtml(heading)}</h2>
      <p>Cześć, <strong>${escHtml(payload.ownerName)}</strong>!</p>
      <p>${escHtml(bodyText)}</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b">Wydarzenie:</td><td style="padding:8px;font-weight:600">${escHtml(payload.eventTitle)}</td></tr>
        ${payload.eventDate ? `<tr><td style="padding:8px;color:#64748b">Data:</td><td style="padding:8px">${escHtml(formatEmailDateTime(payload.eventDate))}</td></tr>` : ''}
        <tr><td style="padding:8px;color:#64748b">Pies:</td><td style="padding:8px">${escHtml(payload.dogName)}</td></tr>
      </table>
      ${datesHtml
        ? `<p style="font-weight:600;margin-bottom:4px">Terminy, których dotyczył wniosek:</p><ul style="margin:0;padding-left:20px;color:#334155">${datesHtml}</ul>`
        : ''
      }
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Wiadomość wysłana automatycznie przez Dogdex.</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Dogdex <${smtpUser}>`,
      to: payload.to,
      subject: payload.accepted
        ? `✅ Rezygnacja zaakceptowana – ${payload.eventTitle}`
        : `❌ Wniosek o rezygnację odrzucony – ${payload.eventTitle}`,
      html,
    })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Email] Błąd wysyłki wyniku rezygnacji:', err)
    }
  }
}

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------

interface ContactEmailPayload {
  name: string
  email: string
  subject: string
  message: string
}

/** Sends the contact form message to the app support inbox. Throws on SMTP error. */
export async function sendContactEmail(payload: ContactEmailPayload): Promise<void> {
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  if (!smtpUser || !smtpPass) return

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  })

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#0369a1;margin-bottom:4px">📨 Nowa wiadomość kontaktowa</h2>
      <p style="color:#64748b;margin-top:0">Dogdex – formularz kontaktowy</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <tr style="background:#f8fafc">
          <td style="padding:10px 14px;color:#64748b;width:100px;font-size:13px">Od:</td>
          <td style="padding:10px 14px;font-weight:600">${escHtml(payload.name)}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0">E-mail:</td>
          <td style="padding:10px 14px;border-top:1px solid #e2e8f0">
            <a href="mailto:${escHtml(payload.email)}" style="color:#0369a1">${escHtml(payload.email)}</a>
          </td>
        </tr>
        <tr style="background:#f8fafc">
          <td style="padding:10px 14px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0">Temat:</td>
          <td style="padding:10px 14px;font-weight:600;border-top:1px solid #e2e8f0">${escHtml(payload.subject)}</td>
        </tr>
      </table>
      <div style="background:#f0f9ff;border-left:4px solid #0369a1;padding:16px;border-radius:4px;white-space:pre-wrap;line-height:1.6;color:#0f172a">
        ${escHtml(payload.message)}
      </div>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px">
        Możesz odpowiedzieć bezpośrednio na tę wiadomość — odpowiedź trafi do ${escHtml(payload.email)}
      </p>
    </div>
  `

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? `Dogdex <${smtpUser}>`,
    to: process.env.CONTACT_EMAIL ?? 'dogdexpro@gmail.com',
    replyTo: `${payload.name} <${payload.email}>`,
    subject: `[Dogdex] ${escHtml(payload.subject)} – ${escHtml(payload.name)}`,
    html,
  })
}

/** Sends an auto-reply confirmation to the user who submitted the contact form. */
export async function sendContactConfirmation(payload: Pick<ContactEmailPayload, 'name' | 'email' | 'subject'>): Promise<void> {
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  if (!smtpUser || !smtpPass) return

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  })

  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#0369a1">🐾 Dogdex – Potwierdzenie wiadomości</h2>
      <p>Cześć, <strong>${escHtml(payload.name)}</strong>!</p>
      <p>Dziękujemy za kontakt. Otrzymaliśmy Twoją wiadomość i odpowiemy najszybciej jak to możliwe.</p>
      <div style="background:#f0f9ff;border-left:4px solid #0369a1;padding:12px 16px;border-radius:4px;margin:16px 0">
        <p style="margin:0;color:#64748b;font-size:13px">Temat:</p>
        <p style="margin:4px 0 0;font-weight:600;color:#0f172a">${escHtml(payload.subject)}</p>
      </div>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Wiadomość wysłana automatycznie przez Dogdex. Prosimy na nią nie odpowiadać.</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Dogdex <${smtpUser}>`,
      to: payload.email,
      subject: `✅ Otrzymaliśmy Twoją wiadomość – Dogdex`,
      html,
    })
  } catch {
    // Confirmation is non-critical; don't propagate
  }
}

// ---------------------------------------------------------------------------
// 24h training reminder
// ---------------------------------------------------------------------------

interface ReminderEmailPayload {
  to: string
  ownerName: string
  dogName: string
  eventTitle: string
  eventDate: string | null
  eventLocation: string | null
  /** For multidate events: the specific date(s) occurring tomorrow */
  reminderDates?: string[] | null
}

export async function sendReminderEmail(payload: ReminderEmailPayload): Promise<void> {
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  if (!smtpUser || !smtpPass) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Email] SMTP not configured — skipping reminder email to', payload.to)
    }
    return
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  })

  const datesHtml = payload.reminderDates?.length
    ? payload.reminderDates.map(d => {
        try {
          const formatted = formatEmailDate(d, { weekday: true, year: false })
          return `<li style="margin:4px 0">${escHtml(formatted)}</li>`
        } catch { return `<li style="margin:4px 0">${escHtml(d)}</li>` }
      }).join('')
    : null

  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#0369a1">🐾 Dogdex – Przypomnienie o treningu</h2>
      <p>Cześć, <strong>${escHtml(payload.ownerName)}</strong>!</p>
      <p>Jutro odbywa się wydarzenie, na które jesteś zapisany/-a z psem <strong>${escHtml(payload.dogName)}</strong>.</p>

      <div style="background:#f0f9ff;border-radius:12px;padding:16px;margin:20px 0">
        <table style="border-collapse:collapse;width:100%">
          <tr>
            <td style="padding:8px;color:#64748b;font-size:13px">Wydarzenie:</td>
            <td style="padding:8px;font-weight:600">${escHtml(payload.eventTitle)}</td>
          </tr>
          ${payload.eventDate ? `<tr><td style="padding:8px;color:#64748b;font-size:13px">Data:</td><td style="padding:8px">${escHtml(payload.eventDate)}</td></tr>` : ''}
          ${payload.eventLocation ? `<tr><td style="padding:8px;color:#64748b;font-size:13px">Miejsce:</td><td style="padding:8px">${escHtml(payload.eventLocation)}</td></tr>` : ''}
          <tr><td style="padding:8px;color:#64748b;font-size:13px">Pies:</td><td style="padding:8px">${escHtml(payload.dogName)}</td></tr>
        </table>
        ${datesHtml ? `<p style="margin:12px 0 4px;font-weight:600;color:#0f172a;font-size:13px">Twoje jutrzejsze terminy:</p><ul style="margin:0;padding-left:20px;color:#334155">${datesHtml}</ul>` : ''}
      </div>

      <p style="background:#fef9c3;border-radius:8px;padding:12px;color:#854d0e">
        🕐 Do zobaczenia jutro! Pamiętaj zabrać ze sobą wszystko, co potrzebne.
      </p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Wiadomość wysłana automatycznie przez Dogdex.</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Dogdex <${smtpUser}>`,
      to: payload.to,
      subject: `⏰ Przypomnienie – jutro: ${payload.eventTitle}`,
      html,
    })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Email] Błąd wysyłki przypomnienia:', err)
    }
  }
}

// ---------------------------------------------------------------------------
// Training notifications (Phase 2)
// ---------------------------------------------------------------------------

interface TrainingBookingEmailPayload {
  to: string
  userName: string
  trainerName: string
  trainingType: string
  trainingDate: string  // formatted: "18 czerwca 2026, 14:30"
  duration: number  // minutes
  location?: string
  price?: number
  notes?: string
}

export async function sendTrainingBookingConfirmation(
  payload: TrainingBookingEmailPayload
): Promise<void> {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Email] SMTP not configured — skipping training booking to', payload.to)
    }
    return
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user, pass },
  })

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#059669">🐾 Dogdex – Rezerwacja treningu</h2>
      <p>Cześć, <strong>${escHtml(payload.userName)}</strong>!</p>
      <p>✅ Twoja rezerwacja treningu została przyjęta!</p>

      <div style="background:#f0fdf4;border-left:4px solid #059669;padding:16px;margin:20px 0;border-radius:8px">
        <table style="border-collapse:collapse;width:100%">
          <tr>
            <td style="padding:8px;color:#64748b;font-size:13px">Trener:</td>
            <td style="padding:8px;font-weight:600">${escHtml(payload.trainerName)}</td>
          </tr>
          <tr>
            <td style="padding:8px;color:#64748b;font-size:13px">Typ treningu:</td>
            <td style="padding:8px;font-weight:600">${escHtml(payload.trainingType)}</td>
          </tr>
          <tr>
            <td style="padding:8px;color:#64748b;font-size:13px">Data i czas:</td>
            <td style="padding:8px">${escHtml(payload.trainingDate)}</td>
          </tr>
          <tr>
            <td style="padding:8px;color:#64748b;font-size:13px">Czas trwania:</td>
            <td style="padding:8px">${payload.duration} minut</td>
          </tr>
          ${payload.location ? `<tr><td style="padding:8px;color:#64748b;font-size:13px">Miejsce:</td><td style="padding:8px">${escHtml(payload.location)}</td></tr>` : ''}
          ${payload.price ? `<tr><td style="padding:8px;color:#64748b;font-size:13px">Kwota:</td><td style="padding:8px;font-weight:600;color:#059669">${payload.price} PLN</td></tr>` : ''}
        </table>
        ${payload.notes ? `<p style="margin:12px 0 0;padding-top:12px;border-top:1px solid #d1fae5"><strong>Uwagi:</strong><br>${escHtml(payload.notes)}</p>` : ''}
      </div>

      <p style="color:#334155">Trener otrzymał powiadomienie o Twojej rezerwacji. Przygotuj się i do zobaczenia!</p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Wiadomość wysłana automatycznie przez Dogdex.</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Dogdex <${user}>`,
      to: payload.to,
      subject: `✅ Rezerwacja treningu – ${payload.trainingType}`,
      html,
    })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Email] Błąd wysyłki rezerwacji treningu:', err)
    }
  }
}

interface TrainingNotificationToTrainerPayload {
  to: string
  trainerName: string
  userName: string
  trainingType: string
  trainingDate: string
  duration: number
  userNotes?: string
  bookingId?: string
}

export async function sendTrainingBookingToTrainer(
  payload: TrainingNotificationToTrainerPayload
): Promise<void> {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) return

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user, pass },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const bookingsUrl = `${appUrl}/trainer/bookings`

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#0369a1">🐾 Dogdex – Nowa rezerwacja treningu</h2>
      <p>Cześć, <strong>${escHtml(payload.trainerName)}</strong>!</p>
      <p>Nowy trening został zarezerwowany!</p>

      <div style="background:#f0f9ff;border-left:4px solid #0369a1;padding:16px;margin:20px 0;border-radius:8px">
        <table style="border-collapse:collapse;width:100%">
          <tr>
            <td style="padding:8px;color:#64748b;font-size:13px">Użytkownik:</td>
            <td style="padding:8px;font-weight:600">${escHtml(payload.userName)}</td>
          </tr>
          <tr>
            <td style="padding:8px;color:#64748b;font-size:13px">Typ treningu:</td>
            <td style="padding:8px;font-weight:600">${escHtml(payload.trainingType)}</td>
          </tr>
          <tr>
            <td style="padding:8px;color:#64748b;font-size:13px">Data i czas:</td>
            <td style="padding:8px">${escHtml(payload.trainingDate)}</td>
          </tr>
          <tr>
            <td style="padding:8px;color:#64748b;font-size:13px">Czas trwania:</td>
            <td style="padding:8px">${payload.duration} minut</td>
          </tr>
        </table>
        ${payload.userNotes ? `<p style="margin:12px 0 0;padding-top:12px;border-top:1px solid #bfdbfe"><strong>Uwagi użytkownika:</strong><br>${escHtml(payload.userNotes)}</p>` : ''}
      </div>

      <div style="text-align:center;margin:20px 0">
        <a href="${bookingsUrl}" style="display:inline-block;background:#0369a1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Przejdź do rezerwacji
        </a>
      </div>

      <p style="color:#334155;font-size:14px">W panelu trenera możesz potwierdzić lub odrzucić rezerwację. Decyzja zostanie natychmiast wysłana do użytkownika.</p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Wiadomość wysłana automatycznie przez Dogdex.</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Dogdex <${user}>`,
      to: payload.to,
      subject: `🔔 Nowa rezerwacja – ${payload.trainingType}`,
      html,
    })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Email] Błąd wysyłki do trenera:', err)
    }
  }
}

interface TrainingReminderPayload {
  to: string
  userName: string
  trainerName: string
  trainingType: string
  trainingDate: string
  duration: number
}

export async function sendTrainingReminder(
  payload: TrainingReminderPayload
): Promise<void> {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) return

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user, pass },
  })

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#0369a1">🐾 Dogdex – Przypomnienie o treningu</h2>
      <p>Cześć, <strong>${escHtml(payload.userName)}</strong>!</p>
      <p>⏰ Jutro masz zaplanowany trening!</p>

      <div style="background:#fef9c3;border-left:4px solid #eab308;padding:16px;margin:20px 0;border-radius:8px">
        <table style="border-collapse:collapse;width:100%">
          <tr>
            <td style="padding:8px;color:#64748b;font-size:13px">Trener:</td>
            <td style="padding:8px;font-weight:600">${escHtml(payload.trainerName)}</td>
          </tr>
          <tr>
            <td style="padding:8px;color:#64748b;font-size:13px">Typ:</td>
            <td style="padding:8px">${escHtml(payload.trainingType)}</td>
          </tr>
          <tr>
            <td style="padding:8px;color:#64748b;font-size:13px">Data i czas:</td>
            <td style="padding:8px;font-weight:600">${escHtml(payload.trainingDate)}</td>
          </tr>
          <tr>
            <td style="padding:8px;color:#64748b;font-size:13px">Czas trwania:</td>
            <td style="padding:8px">${payload.duration} minut</td>
          </tr>
        </table>
      </div>

      <p style="color:#334155">Pamiętaj przygotować swoje rzeczy. Do zobaczenia jutro! 🐕</p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Wiadomość wysłana automatycznie przez Dogdex.</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Dogdex <${user}>`,
      to: payload.to,
      subject: `⏰ Jutro: ${payload.trainingType} o ${payload.trainingDate}`,
      html,
    })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Email] Błąd wysyłki przypomnienia treningu:', err)
    }
  }
}

interface TrainingCancellationPayload {
  to: string
  recipientName: string
  trainingType: string
  trainingDate: string
  cancelledBy: 'user' | 'trainer'
  reason?: string
}

export async function sendTrainingCancellationEmail(
  payload: TrainingCancellationPayload
): Promise<void> {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) return

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user, pass },
  })

  const cancelledByText =
    payload.cancelledBy === 'user'
      ? 'Użytkownik anulował rezerwację'
      : 'Trener anulował rezerwację'

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#dc2626">🐾 Dogdex – Anulacja rezerwacji</h2>
      <p>Cześć, <strong>${escHtml(payload.recipientName)}</strong>!</p>
      <p>❌ ${cancelledByText}.</p>

      <div style="background:#fee2e2;border-left:4px solid #dc2626;padding:16px;margin:20px 0;border-radius:8px">
        <table style="border-collapse:collapse;width:100%">
          <tr>
            <td style="padding:8px;color:#64748b;font-size:13px">Typ treningu:</td>
            <td style="padding:8px;font-weight:600">${escHtml(payload.trainingType)}</td>
          </tr>
          <tr>
            <td style="padding:8px;color:#64748b;font-size:13px">Data i czas:</td>
            <td style="padding:8px">${escHtml(payload.trainingDate)}</td>
          </tr>
          ${payload.reason ? `<tr><td style="padding:8px;color:#64748b;font-size:13px">Powód:</td><td style="padding:8px">${escHtml(payload.reason)}</td></tr>` : ''}
        </table>
      </div>

      <p style="color:#334155">Jeśli masz pytania, skontaktuj się bezpośrednio.</p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Wiadomość wysłana automatycznie przez Dogdex.</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Dogdex <${user}>`,
      to: payload.to,
      subject: `❌ Anulacja rezerwacji – ${payload.trainingType}`,
      html,
    })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Email] Błąd wysyłki anulacji:', err)
    }
  }
}
