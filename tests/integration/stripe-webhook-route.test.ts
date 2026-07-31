import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  createServerClient: vi.fn(),
  hasServiceRoleKey: vi.fn(),
  sendTrainingBookingConfirmation: vi.fn(),
  sendTrainingBookingToTrainer: vi.fn(),
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

vi.mock('@/lib/email', () => ({
  sendTrainingBookingConfirmation: mocks.sendTrainingBookingConfirmation,
  sendTrainingBookingToTrainer: mocks.sendTrainingBookingToTrainer,
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

  it('returns 500 so Stripe retries when the atomic booking transition fails', async () => {
    mocks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      account: 'acct_test',
      data: {
        object: {
          id: 'cs_test',
          payment_intent: 'pi_test',
          payment_status: 'paid',
          amount_total: 12000,
          currency: 'pln',
          metadata: { booking_id: 'booking-1' },
        },
      },
    })

    mocks.createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table !== 'training_payments') throw new Error(`Unexpected table ${table}`)
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'payment-1',
                  booking_id: 'booking-1',
                  amount: 120,
                  currency: 'PLN',
                  stripe_session_id: 'cs_test',
                  stripe_account_id: 'acct_test',
                  status: 'pending',
                },
                error: null,
              }),
            }),
          }),
        }
      }),
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'database unavailable' },
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

  it('verifies the stored payment and completes checkout through one RPC', async () => {
    mocks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      account: 'acct_test',
      data: {
        object: {
          id: 'cs_test',
          payment_intent: 'pi_test',
          payment_status: 'paid',
          amount_total: 12000,
          currency: 'pln',
          metadata: { booking_id: 'booking-1' },
        },
      },
    })

    const rpc = vi.fn().mockResolvedValue({
      data: [{
        booking_id: 'booking-1',
        payment_id: 'payment-1',
        notification_required: false,
      }],
      error: null,
    })
    mocks.createServerClient.mockReturnValue({
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'payment-1',
                booking_id: 'booking-1',
                amount: 120,
                currency: 'PLN',
                stripe_session_id: null,
                stripe_account_id: 'acct_test',
                status: 'pending',
              },
              error: null,
            }),
          }),
        }),
      })),
      rpc,
    })

    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const response = await POST(new Request('https://dogdex.example/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'valid-signature' },
      body: '{}',
    }))

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('complete_training_checkout', {
      target_booking_id: 'booking-1',
      target_session_id: 'cs_test',
      target_payment_intent_id: 'pi_test',
    })
  })
})
