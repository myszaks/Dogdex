import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAuthClient = vi.fn()
const createServerClient = vi.fn()
const getServerUser = vi.fn()
const sendCancellationResultEmail = vi.fn()

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

describe('PATCH /api/cancellation-requests/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('cancels the registration and removes every schedule assignment when no dates remain', async () => {
    getServerUser.mockResolvedValue({
      user: { id: 'organizer-1' },
      role: 'organizer',
    })
    sendCancellationResultEmail.mockResolvedValue(undefined)

    const request = {
      id: 'request-1',
      registration_id: 'reg-1',
      status: 'pending',
      cancelled_dates: ['2026-08-16', '2026-08-23', '2026-08-30'],
    }
    const requestUpdate = vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    }))
    createAuthClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: request }),
          }),
        }),
        update: requestUpdate,
      })),
    })

    const registrationUpdate = vi.fn((values: Record<string, unknown>) => ({
      eq: vi.fn(() => ({
        select: () => ({
          single: async () => ({
            data: { id: 'reg-1', ...values },
            error: null,
          }),
        }),
      })),
    }))
    const deleteAssignmentsForRegistration = vi.fn(async () => ({ error: null }))
    const assignmentDelete = vi.fn(() => ({
      eq: deleteAssignmentsForRegistration,
    }))

    createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'registrations') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'reg-1',
                    event_id: 'event-1',
                    participant_id: 'participant-1',
                    status: 'confirmed',
                    form_data: {
                      dates: ['2026-08-16', '2026-08-23', '2026-08-30'],
                    },
                  },
                }),
              }),
            }),
            update: registrationUpdate,
          }
        }

        if (table === 'participants') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    owner_email: 'participant@example.com',
                    owner_name: 'Paweł',
                    dog_name: 'Bueno',
                  },
                }),
              }),
            }),
          }
        }

        if (table === 'events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'event-1',
                    created_by: 'organizer-1',
                    title: 'Full Focus',
                    start_at: '2026-08-01T04:00:00.000Z',
                    form_fields: [{ id: 'dates', type: 'multidate' }],
                  },
                }),
              }),
            }),
          }
        }

        if (table === 'schedule_assignments') {
          return { delete: assignmentDelete }
        }

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
      ok: true,
      action: 'accepted',
      registrationCancelled: true,
    })
    expect(registrationUpdate).toHaveBeenCalledWith({
      status: 'cancelled',
      form_data: { dates: [] },
    })
    expect(assignmentDelete).toHaveBeenCalledOnce()
    expect(deleteAssignmentsForRegistration).toHaveBeenCalledWith('registration_id', 'reg-1')
    expect(sendCancellationResultEmail).toHaveBeenCalledWith(expect.objectContaining({
      cancelledDates: request.cancelled_dates,
      eventDate: null,
    }))
  })
})
