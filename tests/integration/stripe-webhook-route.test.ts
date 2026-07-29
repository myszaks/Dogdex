import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  createServerClient: vi.fn(),
  hasServiceRoleKey: vi.fn(),
}))

vi.mock('stripe', () => ({
  default: class StripeMock {
    webhooks = {
      constructEvent: mocks.constructEvent,
    }
  },
}))

vi.mock('@/lib/supabaseServer', () => ({
  createServerClient: mocks.createServerClient,
  hasServiceRoleKey: mocks.hasServiceRoleKey,
}))

const originalStripeSecret = process.env.STRIPE_SECRET_KEY
const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET

afterEach(() => {
  if (originalStripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY
  else process.env.STRIPE_SECRET_KEY = originalStripeSecret

  if (originalWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET
  else process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret
})

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    mocks.hasServiceRoleKey.mockReturnValue(true)
  })

  it('returns 500 so Stripe retries when the booking update fails', async () => {
    mocks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test',
          payment_intent: 'pi_test',
          metadata: { booking_id: 'booking-1' },
        },
      },
    })

    mocks.createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table !== 'training_bookings') throw new Error(`Unexpected table ${table}`)
        return {
          update: () => ({
            eq: async () => ({ error: { message: 'database unavailable' } }),
          }),
        }
      }),
    })

    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const response = await POST(new Request('https://dogdex.example/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'valid-signature' },
      body: '{}',
    }))

    expect(response.status).toBe(500)
  })
})
