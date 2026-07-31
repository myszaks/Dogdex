import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  hasServiceRoleKey: vi.fn(),
}))

vi.mock('@/lib/supabaseServer', () => ({
  createServerClient: mocks.createServerClient,
  hasServiceRoleKey: mocks.hasServiceRoleKey,
}))

const originalCronSecret = process.env.CRON_SECRET

afterEach(() => {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalCronSecret
})

describe('GET /api/training-bookings/reconcile', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'cron-test'
    mocks.hasServiceRoleKey.mockReturnValue(true)
  })

  it('rejects requests without the cron secret', async () => {
    const { GET } = await import('@/app/api/training-bookings/reconcile/route')
    const response = await GET(new Request('https://dogdex.example/api/training-bookings/reconcile'))

    expect(response.status).toBe(401)
    expect(mocks.createServerClient).not.toHaveBeenCalled()
  })

  it('runs the atomic state reconciliation for an authorized cron', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { expired: 2, completed: 3 },
      error: null,
    })
    mocks.createServerClient.mockReturnValue({ rpc })

    const { GET } = await import('@/app/api/training-bookings/reconcile/route')
    const response = await GET(new Request(
      'https://dogdex.example/api/training-bookings/reconcile',
      { headers: { authorization: 'Bearer cron-test' } },
    ))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ expired: 2, completed: 3 })
    expect(rpc).toHaveBeenCalledWith('reconcile_training_booking_states')
  })
})
