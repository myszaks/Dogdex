import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  createServerClient: vi.fn(),
  hasServiceRoleKey: vi.fn(),
  getServerUser: vi.fn(),
}))

vi.mock('stripe', () => ({
  default: class StripeMock {
    checkout = { sessions: { retrieve: mocks.retrieve } }
  },
}))

vi.mock('@/lib/supabaseServer', () => ({
  createServerClient: mocks.createServerClient,
  hasServiceRoleKey: mocks.hasServiceRoleKey,
}))

vi.mock('@/lib/getServerUser', () => ({
  getServerUser: mocks.getServerUser,
}))

const originalStripeSecret = process.env.STRIPE_SECRET_KEY

afterEach(() => {
  if (originalStripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY
  else process.env.STRIPE_SECRET_KEY = originalStripeSecret
})

function queryResult(data: unknown, error: unknown = null) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data, error }),
      }),
    }),
  }
}

describe('POST /api/training-bookings/[id]/checkout', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    mocks.hasServiceRoleKey.mockReturnValue(true)
    mocks.getServerUser.mockResolvedValue({ user: { id: 'user-1' }, role: 'user' })
  })

  it('returns the existing open Stripe Checkout only to the booking owner', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'training_bookings') {
        return queryResult({ id: 'booking-1', user_id: 'user-1', status: 'pending' })
      }
      if (table === 'training_payments') {
        return queryResult({
          status: 'pending',
          stripe_session_id: 'cs_test_1',
          stripe_account_id: 'acct_1',
        })
      }
      throw new Error(`Unexpected table ${table}`)
    })
    mocks.createServerClient.mockReturnValue({ from })
    mocks.retrieve.mockResolvedValue({ status: 'open', url: 'https://checkout.stripe.test/session' })

    const { POST } = await import('@/app/api/training-bookings/[id]/checkout/route')
    const response = await POST(new Request('https://dogdex.test/api/training-bookings/booking-1/checkout', {
      method: 'POST',
    }), { params: Promise.resolve({ id: 'booking-1' }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      checkoutUrl: 'https://checkout.stripe.test/session',
    })
    expect(mocks.retrieve).toHaveBeenCalledWith('cs_test_1', { stripeAccount: 'acct_1' })
  })

  it('does not expose Checkout belonging to another user', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'training_bookings') {
        return queryResult({ id: 'booking-1', user_id: 'user-2', status: 'pending' })
      }
      throw new Error(`Unexpected table ${table}`)
    })
    mocks.createServerClient.mockReturnValue({ from })

    const { POST } = await import('@/app/api/training-bookings/[id]/checkout/route')
    const response = await POST(new Request('https://dogdex.test/api/training-bookings/booking-1/checkout', {
      method: 'POST',
    }), { params: Promise.resolve({ id: 'booking-1' }) })

    expect(response.status).toBe(403)
    expect(mocks.retrieve).not.toHaveBeenCalled()
  })

  it('releases the booking when its Stripe Checkout has expired', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }))
    const from = vi.fn((table: string) => {
      if (table === 'training_bookings') {
        return queryResult({ id: 'booking-1', user_id: 'user-1', status: 'pending' })
      }
      if (table === 'training_payments') {
        return queryResult({
          status: 'pending',
          stripe_session_id: 'cs_expired',
          stripe_account_id: 'acct_1',
        })
      }
      throw new Error(`Unexpected table ${table}`)
    })
    mocks.createServerClient.mockReturnValue({ from, rpc })
    mocks.retrieve.mockResolvedValue({ status: 'expired', url: null })

    const { POST } = await import('@/app/api/training-bookings/[id]/checkout/route')
    const response = await POST(new Request('https://dogdex.test/api/training-bookings/booking-1/checkout', {
      method: 'POST',
    }), { params: Promise.resolve({ id: 'booking-1' }) })

    expect(response.status).toBe(410)
    expect(rpc).toHaveBeenCalledWith('fail_training_checkout', {
      target_booking_id: 'booking-1',
      target_session_id: 'cs_expired',
      failure_reason: 'Sesja płatności wygasła',
    })
  })
})
