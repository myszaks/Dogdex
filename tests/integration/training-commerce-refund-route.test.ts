import { beforeEach, describe, expect, it, vi } from 'vitest'

const getServerUser = vi.fn()
const createServerClient = vi.fn()
const hasServiceRoleKey = vi.fn()
const createTrainingCommerceRefund = vi.fn()

vi.mock('@/lib/getServerUser', () => ({ getServerUser }))
vi.mock('@/lib/supabaseServer', () => ({ createServerClient, hasServiceRoleKey }))
vi.mock('@/lib/trainingCommerceRefund', () => ({ createTrainingCommerceRefund }))

function databaseWithPayment(payment: { id: string; user_id: string; trainer_id: string } | null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: payment })),
        })),
      })),
    })),
  }
}

describe('POST /api/training-commerce/[id]/refund', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    hasServiceRoleKey.mockReturnValue(true)
  })

  it('rejects a user unrelated to the payment', async () => {
    getServerUser.mockResolvedValue({ user: { id: 'other-user' }, role: 'user' })
    createServerClient.mockReturnValue(databaseWithPayment({ id: 'payment-1', user_id: 'customer-1', trainer_id: 'trainer-1' }))
    const { POST } = await import('@/app/api/training-commerce/[id]/refund/route')
    const response = await POST(new Request('https://dogdex.test/api/training-commerce/payment-1/refund', { method: 'POST' }), { params: Promise.resolve({ id: 'payment-1' }) })
    expect(response.status).toBe(403)
    expect(createTrainingCommerceRefund).not.toHaveBeenCalled()
  })

  it('allows the trainer to retry a refund', async () => {
    getServerUser.mockResolvedValue({ user: { id: 'trainer-1' }, role: 'trainer' })
    createServerClient.mockReturnValue(databaseWithPayment({ id: 'payment-1', user_id: 'customer-1', trainer_id: 'trainer-1' }))
    createTrainingCommerceRefund.mockResolvedValue({ refundId: 'refund-1', status: 'pending' })
    const { POST } = await import('@/app/api/training-commerce/[id]/refund/route')
    const response = await POST(new Request('https://dogdex.test/api/training-commerce/payment-1/refund', {
      method: 'POST', body: JSON.stringify({ reason: 'Ponowienie QA' }),
    }), { params: Promise.resolve({ id: 'payment-1' }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ refundId: 'refund-1', status: 'pending' })
    expect(createTrainingCommerceRefund).toHaveBeenCalledWith('payment-1', 'trainer-1', 'Ponowienie QA')
  })
})
