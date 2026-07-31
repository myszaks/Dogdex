import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  hasServiceRoleKey: vi.fn(),
  sendTrainingReminder: vi.fn(),
}))

vi.mock('@/lib/supabaseServer', () => ({
  createServerClient: mocks.createServerClient,
  hasServiceRoleKey: mocks.hasServiceRoleKey,
}))
vi.mock('@/lib/email', () => ({
  sendTrainingReminder: mocks.sendTrainingReminder,
}))

const originalCronSecret = process.env.CRON_SECRET

afterEach(() => {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalCronSecret
})

describe('GET /api/training-bookings/reminders', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'cron-test'
    mocks.hasServiceRoleKey.mockReturnValue(true)
  })

  it('rejects requests without the cron secret', async () => {
    const { GET } = await import('@/app/api/training-bookings/reminders/route')
    const response = await GET(new Request('https://dogdex.test/api/training-bookings/reminders'))
    expect(response.status).toBe(401)
    expect(mocks.createServerClient).not.toHaveBeenCalled()
  })

  it('returns an empty result when there are no reminder claims', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    mocks.createServerClient.mockReturnValue({ rpc })
    const { GET } = await import('@/app/api/training-bookings/reminders/route')
    const response = await GET(new Request(
      'https://dogdex.test/api/training-bookings/reminders',
      { headers: { authorization: 'Bearer cron-test' } },
    ))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ claimed: 0, sent: 0, failed: 0 })
    expect(rpc).toHaveBeenCalledWith('claim_training_reminders', expect.objectContaining({ batch_size: 100 }))
    const params = rpc.mock.calls[0][1]
    expect(
      new Date(params.window_end).getTime() - new Date(params.window_start).getTime(),
    ).toBe(24 * 60 * 60 * 1000)
  })
})
