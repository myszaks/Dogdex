import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendContactEmail = vi.fn()
const sendContactConfirmation = vi.fn()
const enforcePublicRateLimits = vi.fn()

vi.mock('@/lib/email', () => ({
  sendContactEmail,
  sendContactConfirmation,
}))

vi.mock('@/lib/publicRateLimit', () => ({
  enforcePublicRateLimits,
  getRequestIp: () => '127.0.0.1',
}))

function contactRequest() {
  return new Request('https://dogdex.test/api/contact', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Jan Kowalski',
      email: 'jan@example.com',
      subject: 'Pytanie',
      message: 'Treść wiadomości',
    }),
  })
}

describe('POST /api/contact', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    enforcePublicRateLimits.mockResolvedValue({ allowed: true })
    sendContactEmail.mockResolvedValue(undefined)
    sendContactConfirmation.mockResolvedValue(undefined)
  })

  it('returns Retry-After and does not send mail after exceeding the limit', async () => {
    enforcePublicRateLimits.mockResolvedValue({
      allowed: false,
      reason: 'limited',
      retryAfterSeconds: 1800,
    })

    const { POST } = await import('@/app/api/contact/route')
    const response = await POST(contactRequest())

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('1800')
    expect(sendContactEmail).not.toHaveBeenCalled()
  })

  it('fails closed when the shared limiter is unavailable', async () => {
    enforcePublicRateLimits.mockResolvedValue({
      allowed: false,
      reason: 'unavailable',
    })

    const { POST } = await import('@/app/api/contact/route')
    const response = await POST(contactRequest())

    expect(response.status).toBe(503)
    expect(sendContactEmail).not.toHaveBeenCalled()
  })

  it('sends the contact message after validation and rate limiting', async () => {
    const { POST } = await import('@/app/api/contact/route')
    const response = await POST(contactRequest())

    expect(response.status).toBe(200)
    expect(sendContactEmail).toHaveBeenCalledWith({
      name: 'Jan Kowalski',
      email: 'jan@example.com',
      subject: 'Pytanie',
      message: 'Treść wiadomości',
    })
  })
})
