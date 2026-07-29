import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAuthClient = vi.fn()
const createServerClient = vi.fn()
const hasServiceRoleKey = vi.fn()
const getServerUser = vi.fn()
const from = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createAuthClient,
  createServerClient,
  hasServiceRoleKey,
}))

vi.mock('@/lib/getServerUser', () => ({
  getServerUser,
}))

vi.mock('@/lib/email', () => ({
  sendTrainingBookingConfirmation: vi.fn(),
  sendTrainingBookingToTrainer: vi.fn(),
}))

describe('POST /api/training-bookings', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getServerUser.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        user_metadata: {},
      },
      role: 'user',
    })
    hasServiceRoleKey.mockReturnValue(true)
    createAuthClient.mockResolvedValue({})
    createServerClient.mockReturnValue({ from })
  })

  it('does not create a paid booking before the trainer configures Stripe', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'training_types') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'type-1',
                    trainer_id: 'trainer-1',
                    name: 'Agility',
                    price_per_hour: 120,
                    duration_min: 60,
                  },
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'trainer_profiles') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    trainer_id: 'trainer-1',
                    full_name: 'Anna Trener',
                  },
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  stripe_account_id: null,
                  stripe_onboarded: false,
                },
              }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const { POST } = await import('@/app/api/training-bookings/route')
    const response = await POST(new Request('https://dogdex.test/api/training-bookings', {
      method: 'POST',
      body: JSON.stringify({
        training_type_id: 'type-1',
        scheduled_at: '2030-07-25T10:00:00.000Z',
      }),
    }))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('płatności'),
    })
    expect(from).not.toHaveBeenCalledWith('training_bookings')
  })
})
