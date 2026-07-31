import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAuthClient = vi.fn()
const createServerClient = vi.fn()
const getServerUser = vi.fn()
const sendCancellationResultEmail = vi.fn()
const createEventRefund = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createAuthClient,
  createServerClient,
}))

vi.mock('@/lib/getServerUser', () => ({
  getServerUser,
}))

vi.mock('@/lib/email', () => ({
  sendCancellationResultEmail,
}))

vi.mock('@/lib/eventRefund', () => ({ createEventRefund }))

describe('PATCH /api/cancellation-requests/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getServerUser.mockResolvedValue({
      user: { id: 'organizer-1' },
      role: 'organizer',
    })
  })

  it('returns the updated registration and removes its schedule assignments', async () => {
    const request = {
      id: 'request-1',
      status: 'pending',
      cancelled_dates: null,
      registrations: {
        id: 'reg-1',
        status: 'confirmed',
        form_data: {},
        participants: {
          owner_email: null,
          owner_name: 'Anna',
          dog_name: 'Figa',
        },
        events: {
          id: 'event-1',
          title: 'Speedway',
          start_at: '2026-08-10T10:00:00.000Z',
          form_fields: [],
        },
      },
    }
    const requestUpdate = vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    }))
    createAuthClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== 'cancellation_requests') throw new Error(`Unexpected table ${table}`)
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: request, error: null }),
            }),
          }),
          update: requestUpdate,
        }
      }),
    })

    const registrationSingle = vi.fn(async () => ({
      data: {
        id: 'reg-1',
        status: 'cancelled',
        form_data: {},
      },
      error: null,
    }))
    const registrationUpdate = vi.fn(() => ({
      eq: () => ({
        select: () => ({
          single: registrationSingle,
        }),
      }),
    }))
    const assignmentEq = vi.fn(async () => ({ error: null }))
    const assignmentDelete = vi.fn(() => ({ eq: assignmentEq }))
    createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'event_payments') return {
          select: () => ({ eq: () => ({ in: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
        }
        if (table === 'registrations') return { update: registrationUpdate }
        if (table === 'schedule_assignments') return { delete: assignmentDelete }
        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { PATCH } = await import('@/app/api/cancellation-requests/[id]/route')
    const response = await PATCH(new Request('http://localhost/api/cancellation-requests/request-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'accept' }),
    }), {
      params: Promise.resolve({ id: 'request-1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      action: 'accepted',
      registrationCancelled: true,
      registration: {
        id: 'reg-1',
        status: 'cancelled',
      },
    })
    expect(registrationUpdate).toHaveBeenCalledWith({ status: 'cancelled' })
    expect(assignmentDelete).toHaveBeenCalledOnce()
    expect(assignmentEq).toHaveBeenCalledWith('registration_id', 'reg-1')
  })

  it('creates a date-level refund before accepting a paid cancellation request', async () => {
    const request = {
      id: 'request-paid', status: 'pending', cancelled_dates: ['2030-08-01'],
      registrations: {
        id: 'reg-paid', status: 'confirmed', form_data: { dates: ['2030-08-01', '2030-08-08'] },
        participants: { owner_email: 'user@example.com', owner_name: 'Anna', dog_name: 'Figa' },
        events: { id: 'event-1', title: 'Spacery', form_fields: [{ id: 'dates', type: 'multidate' }] },
      },
    }
    createAuthClient.mockResolvedValue({
      from: vi.fn(() => ({ select: () => ({ eq: () => ({ single: async () => ({ data: request, error: null }) }) }) })),
    })
    createEventRefund.mockResolvedValue({ refundId: 'refund-1', status: 'succeeded', amount: 40, cancelRegistration: false })
    createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'event_payments') return { select: () => ({ eq: () => ({ in: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 'pay-1', status: 'completed' } }) }) }) }) }) }
        if (table === 'registrations') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'reg-paid', status: 'confirmed', form_data: { dates: ['2030-08-08'] } } }) }) }) }
        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { PATCH } = await import('@/app/api/cancellation-requests/[id]/route')
    const response = await PATCH(new Request('http://localhost/api/cancellation-requests/request-paid', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'accept' }),
    }), { params: Promise.resolve({ id: 'request-paid' }) })
    expect(response.status).toBe(200)
    expect(createEventRefund).toHaveBeenCalledWith({
      registrationId: 'reg-paid', cancelledDates: ['2030-08-01'], requestedBy: 'organizer-1', cancellationRequestId: 'request-paid',
    })
    await expect(response.json()).resolves.toMatchObject({ action: 'accepted', refundId: 'refund-1', registrationCancelled: false })
  })
})
