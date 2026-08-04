import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
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
    expect(html).toContain('/brand/dogdex-email-logo.png')
    expect(html).toContain('alt="Dogdex"')
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
    expect(text).toContain('Dogdex')
    expect(text).toContain('Cześć Ada')
    expect(text).toContain('• Pierwszy')
    expect(text).not.toContain('<strong>')
    expect(cleanEmailSubject('Temat\r\nBcc: test@example.com')).toBe('Temat Bcc: test@example.com')
  })

  it('uses the hosted Dogdex logo in every Supabase email template', () => {
    const templatesDirectory = resolve(process.cwd(), 'supabase/email-templates')
    const templates = readdirSync(templatesDirectory).filter(file => file.endsWith('.html'))

    expect(templates).toHaveLength(13)
    for (const template of templates) {
      const html = readFileSync(resolve(templatesDirectory, template), 'utf8')
      expect(html, template).toContain('{{ .SiteURL }}/brand/dogdex-email-logo.png')
      expect(html, template).toContain('alt="Dogdex"')
    }
  })

  it('keeps the Supabase variables required by each Auth template', () => {
    const templatesDirectory = resolve(process.cwd(), 'supabase/email-templates')
    const requiredVariables: Record<string, string[]> = {
      'confirmation.html': ['SiteURL', 'Email', 'ConfirmationURL'],
      'invite.html': ['SiteURL', 'Email', 'ConfirmationURL'],
      'magic_link.html': ['SiteURL', 'Email', 'ConfirmationURL'],
      'email_change.html': ['SiteURL', 'Email', 'NewEmail', 'ConfirmationURL'],
      'recovery.html': ['SiteURL', 'Email', 'ConfirmationURL'],
      'reauthentication.html': ['SiteURL', 'Email', 'Token'],
      'password_changed.html': ['SiteURL', 'Email'],
      'email_changed.html': ['SiteURL', 'OldEmail', 'Email'],
      'phone_changed.html': ['SiteURL', 'Email', 'OldPhone', 'Phone'],
      'identity_linked.html': ['SiteURL', 'Email', 'Provider'],
      'identity_unlinked.html': ['SiteURL', 'Email', 'Provider'],
      'mfa_factor_enrolled.html': ['SiteURL', 'Email', 'FactorType'],
      'mfa_factor_unenrolled.html': ['SiteURL', 'Email', 'FactorType'],
    }

    for (const [template, variables] of Object.entries(requiredVariables)) {
      const html = readFileSync(resolve(templatesDirectory, template), 'utf8')
      for (const variable of variables) {
        expect(html, `${template} should use {{ .${variable} }}`).toContain(`{{ .${variable} }}`)
      }
    }
  })
})
