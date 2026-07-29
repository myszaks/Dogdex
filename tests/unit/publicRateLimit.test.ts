import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServerClient = vi.fn()
const hasServiceRoleKey = vi.fn()
const rpc = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createServerClient,
  hasServiceRoleKey,
}))

describe('public rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasServiceRoleKey.mockReturnValue(true)
    createServerClient.mockReturnValue({ rpc })
    rpc.mockResolvedValue({ data: true, error: null })
  })

  it('uses the first forwarded address as the client IP', async () => {
    const { getRequestIp } = await import('@/lib/publicRateLimit')
    const request = new Request('https://dogdex.test', {
      headers: { 'x-forwarded-for': '203.0.113.8, 10.0.0.1' },
    })

    expect(getRequestIp(request)).toBe('203.0.113.8')
  })

  it('fails closed when the service role is unavailable', async () => {
    hasServiceRoleKey.mockReturnValue(false)
    const { enforcePublicRateLimits } = await import('@/lib/publicRateLimit')

    await expect(enforcePublicRateLimits([{
      scope: 'contact-email',
      identifier: 'person@example.com',
      limit: 3,
      windowSeconds: 600,
    }])).resolves.toEqual({ allowed: false, reason: 'unavailable' })
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('sends only a hash of the identifier to the database', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    const { enforcePublicRateLimits } = await import('@/lib/publicRateLimit')

    await expect(enforcePublicRateLimits([{
      scope: 'contact-email',
      identifier: 'Person@Example.com',
      limit: 3,
      windowSeconds: 600,
    }])).resolves.toEqual({
      allowed: false,
      reason: 'limited',
      retryAfterSeconds: 600,
    })

    expect(rpc).toHaveBeenCalledWith('consume_public_rate_limit', expect.objectContaining({
      p_scope: 'contact-email',
      p_identifier_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_limit: 3,
      p_window_seconds: 600,
    }))
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('Person@Example.com')
  })
})
