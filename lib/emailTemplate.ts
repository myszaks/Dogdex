export type EmailTone = 'neutral' | 'success' | 'warning' | 'danger'

const COLORS = {
  background: '#F6FAF8',
  card: '#FFFFFF',
  forest: '#1E3932',
  orange: '#FF8024',
  text: '#1A1C1B',
  muted: '#5C6360',
  sage: '#EFF4F2',
  border: '#E0E5E2',
}

const TONES: Record<EmailTone, { background: string; border: string; text: string }> = {
  neutral: { background: '#EFF4F2', border: '#9AABA2', text: '#1E3932' },
  success: { background: '#ECFDF5', border: '#10B981', text: '#065F46' },
  warning: { background: '#FFF7ED', border: '#FF8024', text: '#9A3412' },
  danger: { background: '#FEF2F2', border: '#EF4444', text: '#991B1B' },
}

function emailSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.NEXT_PUBLIC_SITE_URL
    ?? 'https://dogdex.pro'
  ).replace(/\/$/, '')
}

function emailBrandHeader(eyebrow: string): string {
  const siteUrl = escapeEmailHtml(emailSiteUrl())
  const logoUrl = `${siteUrl}/brand/dogdex-email-logo.png`

  return `<a href="${siteUrl}" style="display:inline-block;text-decoration:none">
          <img src="${logoUrl}" width="160" height="40" alt="Dogdex" style="display:block;width:160px;height:40px;border:0;outline:none;text-decoration:none;color:#F6FAF8;font-family:Arial,sans-serif;font-size:22px;font-weight:700" />
        </a>
        <span style="display:block;margin-top:5px;color:#DCE8E3;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">${escapeEmailHtml(eyebrow)}</span>`
}

export function escapeEmailHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

export function cleanEmailSubject(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function emailDetails(
  rows: Array<{ label: string; value: string | number | null | undefined; html?: boolean }>,
): string {
  const visibleRows = rows.filter(row => row.value !== null && row.value !== undefined && row.value !== '')
  if (!visibleRows.length) return ''

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:0;background:${COLORS.sage};border:1px solid ${COLORS.border};border-radius:16px;margin:20px 0;overflow:hidden">
    ${visibleRows.map((row, index) => `<tr>
      <td style="width:128px;padding:11px 14px;color:${COLORS.muted};font-size:13px;line-height:1.45;vertical-align:top;${index ? `border-top:1px solid ${COLORS.border};` : ''}">${escapeEmailHtml(row.label)}</td>
      <td style="padding:11px 14px;color:${COLORS.text};font-size:14px;font-weight:600;line-height:1.45;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;${index ? `border-top:1px solid ${COLORS.border};` : ''}">${row.html ? row.value : escapeEmailHtml(row.value)}</td>
    </tr>`).join('')}
  </table>`
}

export function emailNotice(content: string, tone: EmailTone = 'neutral'): string {
  const colors = TONES[tone]
  return `<div style="margin:20px 0;padding:14px 16px;background:${colors.background};border-left:4px solid ${colors.border};border-radius:12px;color:${colors.text};font-size:14px;line-height:1.55">${content}</div>`
}

export function emailButton(label: string, url: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0"><tr><td style="background:${COLORS.orange};border-radius:12px">
    <a href="${escapeEmailHtml(url)}" style="display:inline-block;padding:13px 20px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;line-height:1.2">${escapeEmailHtml(label)}</a>
  </td></tr></table>`
}

export function emailList(items: string[]): string {
  if (!items.length) return ''
  return `<ul style="margin:8px 0 20px;padding-left:20px;color:${COLORS.text};font-size:14px;line-height:1.6">${items.map(item => `<li style="margin:4px 0">${escapeEmailHtml(item)}</li>`).join('')}</ul>`
}

interface RenderEmailOptions {
  preheader: string
  eyebrow: string
  title: string
  body: string
  footerNote?: string
}

export function renderEmail({ preheader, eyebrow, title, body, footerNote }: RenderEmailOptions): string {
  return `<!doctype html>
<html lang="pl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeEmailHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.background};color:${COLORS.text};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeEmailHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:${COLORS.background}"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px">
      <tr><td style="padding:18px 22px;background:${COLORS.forest};border-radius:20px 20px 0 0">
        ${emailBrandHeader(eyebrow)}
      </td></tr>
      <tr><td style="padding:28px 22px 24px;background:${COLORS.card};border:1px solid ${COLORS.border};border-top:0;border-radius:0 0 20px 20px;box-shadow:0 8px 24px rgba(30,57,50,.06)">
        <h1 style="margin:0 0 18px;color:${COLORS.forest};font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2">${escapeEmailHtml(title)}</h1>
        <div style="color:${COLORS.text};font-size:15px;line-height:1.65">${body}</div>
      </td></tr>
      <tr><td style="padding:18px 18px 0;text-align:center;color:${COLORS.muted};font-size:12px;line-height:1.5">
        ${footerNote ? `${escapeEmailHtml(footerNote)}<br>` : ''}Wiadomość wysłana automatycznie przez Dogdex.
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`
}

export function emailHtmlToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<div[^>]*display:none[^>]*>[\s\S]*?<\/div>/i, '')
    .replace(/<img[^>]*alt=["']([^"']*)["'][^>]*>/gi, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|tr|li|table)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
