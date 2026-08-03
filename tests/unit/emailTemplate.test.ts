import { describe, expect, it } from 'vitest'
import {
  cleanEmailSubject,
  emailButton,
  emailDetails,
  emailHtmlToText,
  escapeEmailHtml,
  renderEmail,
} from '@/lib/emailTemplate'

describe('emailTemplate', () => {
  it('escapes untrusted values in visible content and links', () => {
    expect(escapeEmailHtml('<script>"x"</script>')).toBe('&lt;script&gt;&quot;x&quot;&lt;/script&gt;')
    expect(emailButton('Otwórz', 'https://example.com/?x=1&y=2')).toContain('x=1&amp;y=2')
    expect(emailDetails([{ label: 'Pies', value: '<b>Fado</b>' }])).not.toContain('<b>Fado</b>')
  })

  it('renders the Dogdex brand and accessible email structure', () => {
    const html = renderEmail({
      preheader: 'Krótki podgląd',
      eyebrow: 'Zapisy',
      title: 'Zapis potwierdzony',
      body: `<p>Treść</p>${emailButton('Otwórz', 'https://dogdex.pro')}`,
    })

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('lang="pl"')
    expect(html).toContain('#1E3932')
    expect(html).toContain('#FF8024')
    expect(html).toContain('Krótki podgląd')
    expect(html).toContain('Wiadomość wysłana automatycznie przez Dogdex.')
  })

  it('creates readable plain text and removes header injection from subjects', () => {
    const html = renderEmail({
      preheader: 'Ukryty podgląd',
      eyebrow: 'Test',
      title: 'Tytuł',
      body: '<p>Cześć <strong>Ada</strong></p><ul><li>Pierwszy</li><li>Drugi</li></ul>',
    })

    const text = emailHtmlToText(html)
    expect(text).toContain('Cześć Ada')
    expect(text).toContain('• Pierwszy')
    expect(text).not.toContain('<strong>')
    expect(cleanEmailSubject('Temat\r\nBcc: test@example.com')).toBe('Temat Bcc: test@example.com')
  })
})
