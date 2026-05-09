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
