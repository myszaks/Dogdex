import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  hasServiceRoleKey: vi.fn(),
  sendRegistrationOpenedEmail: vi.fn(),
}))

vi.mock('@/lib/supabaseServer', () => ({
  createServerClient: mocks.createServerClient,
  hasServiceRoleKey: mocks.hasServiceRoleKey,
}))
vi.mock('@/lib/email', () => ({
  sendRegistrationOpenedEmail: mocks.sendRegistrationOpenedEmail,
}))

const originalCronSecret = process.env.CRON_SECRET

afterEach(() => {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalCronSecret
})

describe('POST /api/event-registration-notifications', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'cron-test'
    mocks.hasServiceRoleKey.mockReturnValue(true)
  })

  it('rejects a Supabase Cron request without the shared secret', async () => {
    const { POST } = await import('@/app/api/event-registration-notifications/route')
    const response = await POST(new Request(
      'https://dogdex.test/api/event-registration-notifications',
      { method: 'POST' },
    ))

    expect(response.status).toBe(401)
    expect(mocks.createServerClient).not.toHaveBeenCalled()
  })

  it('accepts an authorized POST request and returns an empty result', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null })
    const lte = vi.fn().mockReturnValue({ limit })
    const not = vi.fn().mockReturnValue({ lte })
    const eq = vi.fn().mockReturnValue({ not })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    mocks.createServerClient.mockReturnValue({ from })

    const { POST } = await import('@/app/api/event-registration-notifications/route')
    const response = await POST(new Request(
      'https://dogdex.test/api/event-registration-notifications',
      {
        method: 'POST',
        headers: { authorization: 'Bearer cron-test' },
      },
    ))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sent: 0, skipped: 0 })
    expect(from).toHaveBeenCalledWith('events')
  })
})
