import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendMail = vi.hoisted(() => vi.fn())

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail }),
  },
}))

import {
  sendEventAnnouncementEmail,
  sendEventWaitlistJoinedEmail,
  sendEventWaitlistOfferEmail,
  sendReminderEmail,
} from '@/lib/email'

describe('Polish email copy', () => {
  beforeEach(() => {
    process.env.SMTP_USER = 'preview@dogdex.pro'
    process.env.SMTP_PASS = 'preview-only'
    sendMail.mockResolvedValue({ messageId: 'preview' })
  })

  afterEach(() => {
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
  })

  it('uses natural, inclusive wording in the event reminder', async () => {
    await sendReminderEmail({
      to: 'anna@example.com',
      ownerName: 'Anna',
      dogName: 'Fado',
      eventTitle: 'Letni Puchar Agility',
      eventDate: '22 sierpnia 2026, 10:00',
      eventLocation: 'Warszawa',
    })

    const mail = sendMail.mock.calls[0][0] as { html: string; text: string }
    expect(mail.html).toContain('Przypominamy o wydarzeniu, na które jesteś zapisana/zapisany z psem <strong>Fado</strong>.')
    expect(mail.html).toContain('Cześć!')
    expect(mail.html).not.toContain('masz zapis')
    expect(mail.html).not.toContain('Cześć, <strong>Anna</strong>')
    expect(mail.text).toContain('Przypominamy o wydarzeniu, na które jesteś zapisana/zapisany z psem Fado.')
  })

  it('explains the waitlist without suggesting that the place is already confirmed', async () => {
    await sendEventWaitlistJoinedEmail({
      to: 'anna@example.com',
      dogName: 'Fado',
      eventTitle: 'Letni Puchar Agility',
      eventSlug: 'letni-puchar-agility',
      eventDate: '2026-08-22T10:00:00.000Z',
      eventLocation: 'Warszawa',
      position: 3,
    })

    const joined = sendMail.mock.calls[0][0] as { html: string; text: string }
    expect(joined.text).toContain('Pozycja w kolejce')
    expect(joined.text).toContain('Dopiero wtedy będzie można potwierdzić udział.')

    await sendEventWaitlistOfferEmail({
      to: 'anna@example.com',
      dogName: 'Fado',
      eventTitle: 'Letni Puchar Agility',
      eventDate: '2026-08-22T10:00:00.000Z',
      eventLocation: 'Warszawa',
      offerUrl: 'https://dogdex.pro/waitlist/token',
      expiresAt: '2026-08-10T10:00:00.000Z',
    })

    const offer = sendMail.mock.calls[1][0] as { html: string; text: string }
    expect(offer.text).toContain('Zwolniło się dla Ciebie miejsce')
    expect(offer.text).toContain('Jeśli go nie potwierdzisz, propozycję otrzyma kolejna osoba.')
  })

  it('escapes announcement content supplied by an organizer', async () => {
    await sendEventAnnouncementEmail({
      to: 'anna@example.com',
      eventTitle: 'Spacer',
      eventSlug: 'spacer',
      announcementTitle: 'Zmiana miejsca',
      message: '<script>alert(1)</script>\nSpotykamy się przy bramie.',
      dogNames: ['Fado'],
    })

    const mail = sendMail.mock.calls[0][0] as { html: string; text: string }
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;<br>')
    expect(mail.text).toContain('Spotykamy się przy bramie.')
  })
})
