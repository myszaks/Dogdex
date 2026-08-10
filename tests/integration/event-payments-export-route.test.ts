import { beforeEach, describe, expect, it, vi } from 'vitest'

const getServerUser = vi.fn()
const createServerClient = vi.fn()

vi.mock('@/lib/getServerUser', () => ({ getServerUser }))
vi.mock('@/lib/supabaseServer', () => ({ createServerClient }))
vi.mock('@/lib/businessAccess', () => ({ getBusinessProfileAccess: vi.fn().mockResolvedValue(null) }))

describe('GET /api/event-payments/export', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('includes the training client, dog and payer email in CSV', async () => {
    getServerUser.mockResolvedValue({ user: { id: 'trainer-1' }, role: 'trainer' })

    const db = {
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({
            data: {
              user: {
                id: 'user-1',
                email: 'jan@example.com',
                user_metadata: { full_name: 'Jan z metadanych' },
              },
            },
            error: null,
          })),
        },
      },
      from: vi.fn((table: string) => {
        if (table === 'event_payments') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({ data: [] }),
                }),
              }),
            }),
          }
        }
        if (table === 'training_types') {
          return {
            select: () => ({
              eq: async () => ({ data: [{ id: 'type-1', name: 'Trening agility' }] }),
            }),
          }
        }
        if (table === 'training_bookings') {
          return {
            select: () => ({
              in: async () => ({
                data: [{
                  id: 'booking-1',
                  training_type_id: 'type-1',
                  scheduled_at: '2026-08-02T12:00:00.000Z',
                  user_id: 'user-1',
                  dog_id: 'dog-1',
                }],
              }),
            }),
          }
        }
        if (table === 'profiles') {
          return {
            select: () => ({
              in: async () => ({ data: [{ id: 'user-1', full_name: 'Jan Kowalski' }] }),
            }),
          }
        }
        if (table === 'dogs') {
          return {
            select: () => ({
              in: async () => ({ data: [{ id: 'dog-1', name: 'Reksio' }] }),
            }),
          }
        }
        if (table === 'training_payments') {
          return {
            select: () => ({
              in: () => ({
                limit: async () => ({
                  data: [{
                    id: 'payment-1',
                    booking_id: 'booking-1',
                    amount: 100,
                    currency: 'PLN',
                    status: 'completed',
                    created_at: '2026-08-01T10:00:00.000Z',
                    stripe_payment_intent_id: 'pi_1',
                  }],
                }),
              }),
            }),
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
    createServerClient.mockReturnValue(db)

    const { GET } = await import('@/app/api/event-payments/export/route')
    const response = await GET()
    const content = await response.text()

    expect(response.status).toBe(200)
    expect(content).toContain('Jan Kowalski')
    expect(content).toContain('Reksio')
    expect(content).toContain('jan@example.com')
    expect(db.auth.admin.getUserById).toHaveBeenCalledWith('user-1')
  })
})
