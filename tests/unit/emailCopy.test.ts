import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendMail = vi.hoisted(() => vi.fn())

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail }),
  },
}))

import { sendReminderEmail } from '@/lib/email'

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
})
