import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  createServerClient: vi.fn(),
  hasServiceRoleKey: vi.fn(),
  sendTrainingBookingConfirmation: vi.fn(),
  sendTrainingBookingToTrainer: vi.fn(),
  sendRegistrationEmail: vi.fn(),
  applyStripeRefundStatus: vi.fn(),
  applyTrainingCommerceRefundStatus: vi.fn(),
  notifyTrainingCommercePaymentCompleted: vi.fn(),
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
  sendRegistrationEmail: mocks.sendRegistrationEmail,
}))

vi.mock('@/lib/eventRefund', () => ({
  applyStripeRefundStatus: mocks.applyStripeRefundStatus,
}))

vi.mock('@/lib/trainingCommerceRefund', () => ({
  applyTrainingCommerceRefundStatus: mocks.applyTrainingCommerceRefundStatus,
}))

vi.mock('@/lib/trainingCommerceNotifications', () => ({
  notifyTrainingCommercePaymentCompleted: mocks.notifyTrainingCommercePaymentCompleted,
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

  it('verifies and completes a course payment through the commerce RPC', async () => {
    mocks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      account: 'acct_trainer',
      data: { object: {
        id: 'cs_course', payment_intent: 'pi_course', payment_status: 'paid',
        amount_total: 45000, currency: 'pln',
        metadata: { payment_kind: 'training_course', training_commerce_payment_id: 'commerce-1' },
      } },
    })
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    mocks.createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table !== 'training_commerce_payments') throw new Error(`Unexpected table ${table}`)
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { id: 'commerce-1', amount: 450, currency: 'PLN', stripe_session_id: 'cs_course', stripe_account_id: 'acct_trainer', status: 'pending' },
          error: null,
        }) }) }) }
      }),
      rpc,
    })

    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const response = await POST(new Request('https://dogdex.example/api/webhooks/stripe', {
      method: 'POST', headers: { 'stripe-signature': 'valid-signature' }, body: '{}',
    }))

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('complete_training_commerce_checkout', {
      target_payment_id: 'commerce-1',
      target_session_id: 'cs_course',
      target_payment_intent_id: 'pi_course',
    })
    expect(mocks.notifyTrainingCommercePaymentCompleted).toHaveBeenCalledWith('commerce-1')
  })

  it('routes a connected-account course refund to the commerce refund state machine', async () => {
    const stripeRefund = { id: 're_course', status: 'succeeded', failure_reason: null, metadata: { payment_kind: 'training_commerce_refund', training_commerce_refund_id: 'refund-course-1' } }
    mocks.constructEvent.mockReturnValue({ type: 'refund.updated', account: 'acct_trainer', data: { object: stripeRefund } })
    mocks.applyTrainingCommerceRefundStatus.mockResolvedValue('succeeded')
    mocks.createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table !== 'training_commerce_refunds') throw new Error(`Unexpected table ${table}`)
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { id: 'refund-course-1', training_commerce_payments: { stripe_account_id: 'acct_trainer' } }, error: null,
        }) }) }) }
      }),
    })

    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const response = await POST(new Request('https://dogdex.example/api/webhooks/stripe', {
      method: 'POST', headers: { 'stripe-signature': 'valid-signature' }, body: '{}',
    }))
    expect(response.status).toBe(200)
    expect(mocks.applyTrainingCommerceRefundStatus).toHaveBeenCalledWith('refund-course-1', stripeRefund)
  })

  it('rejects a pass payment received on a different connected account', async () => {
    mocks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      account: 'acct_wrong',
      data: { object: {
        id: 'cs_pass', payment_intent: 'pi_pass', payment_status: 'paid',
        amount_total: 20000, currency: 'pln',
        metadata: { payment_kind: 'training_pass', training_commerce_payment_id: 'commerce-2' },
      } },
    })
    const rpc = vi.fn()
    mocks.createServerClient.mockReturnValue({
      from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { id: 'commerce-2', amount: 200, currency: 'PLN', stripe_session_id: 'cs_pass', stripe_account_id: 'acct_trainer', status: 'pending' },
        error: null,
      }) }) }) })),
      rpc,
    })

    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const response = await POST(new Request('https://dogdex.example/api/webhooks/stripe', {
      method: 'POST', headers: { 'stripe-signature': 'valid-signature' }, body: '{}',
    }))

    expect(response.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('verifies and completes an event registration payment on the connected account', async () => {
    mocks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      account: 'acct_event',
      data: { object: {
        id: 'cs_event', payment_intent: 'pi_event', payment_status: 'paid',
        amount_total: 9500, currency: 'pln',
        metadata: {
          payment_kind: 'event_registration',
          event_payment_id: 'event-payment-1',
          registration_id: 'registration-1',
        },
      } },
    })
    const rpc = vi.fn().mockResolvedValue({
      data: [{ registration_id: 'registration-1', notification_required: false }],
      error: null,
    })
    mocks.createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table !== 'event_payments') throw new Error(`Unexpected table ${table}`)
        return { update: () => ({ eq: async () => ({ error: null }) }), select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: {
            id: 'event-payment-1', registration_id: 'registration-1', amount: 95,
            currency: 'PLN', stripe_session_id: 'cs_event', stripe_account_id: 'acct_event', status: 'pending',
          },
          error: null,
        }) }) }) }
      }),
      rpc,
    })

    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const response = await POST(new Request('https://dogdex.example/api/webhooks/stripe', {
      method: 'POST', headers: { 'stripe-signature': 'valid-signature' }, body: '{}',
    }))
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('complete_event_checkout', {
      target_payment_id: 'event-payment-1',
      target_session_id: 'cs_event',
      target_payment_intent_id: 'pi_event',
    })
  })

  it('routes connected-account refund updates to the event refund state machine', async () => {
    const stripeRefund = { id: 're_event', status: 'succeeded', failure_reason: null, metadata: { event_refund_id: 'refund-1' } }
    mocks.constructEvent.mockReturnValue({
      type: 'refund.updated', account: 'acct_event', data: { object: stripeRefund },
    })
    mocks.applyStripeRefundStatus.mockResolvedValue('succeeded')
    mocks.createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table !== 'event_refunds') throw new Error(`Unexpected table ${table}`)
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { id: 'refund-1', event_payments: { stripe_account_id: 'acct_event' } }, error: null,
        }) }) }) }
      }),
    })

    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const response = await POST(new Request('https://dogdex.example/api/webhooks/stripe', {
      method: 'POST', headers: { 'stripe-signature': 'valid-signature' }, body: '{}',
    }))
    expect(response.status).toBe(200)
    expect(mocks.applyStripeRefundStatus).toHaveBeenCalledWith('refund-1', stripeRefund)
  })
})
