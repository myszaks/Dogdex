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

  it.each([
    { scope: 'all', remaining: [] },
    { scope: 'some', remaining: ['2026-09-06'] },
  ])('updates only the selected dates when cancelling $scope dates', async ({ remaining }) => {
    const cancelsRegistration = remaining.length === 0
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
    const deleteAssignmentsForDates = vi.fn(async () => ({ error: null }))
    const assignmentDelete = vi.fn(() => ({
      eq: (column: string, value: string) => cancelsRegistration
        ? deleteAssignmentsForRegistration(column, value)
        : { in: deleteAssignmentsForDates },
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
                      ...(cancelsRegistration ? {} : { legacyDate: '2026-09-06' }),
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
                    form_fields: [
                      { id: 'dates', type: 'multidate' },
                      ...(cancelsRegistration ? [] : [{ id: 'legacyDate', type: 'multidate' }]),
                    ],
                  },
                }),
              }),
            }),
          }
        }

        if (table === 'schedule_assignments') {
          return { delete: assignmentDelete }
        }

        if (table === 'time_slots') {
          return { select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) }
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
      registrationCancelled: cancelsRegistration,
    })
    expect(registrationUpdate).toHaveBeenCalledWith({
      ...(cancelsRegistration ? { status: 'cancelled' } : {}),
      form_data: { dates: [], ...(cancelsRegistration ? {} : { legacyDate: remaining }) },
    })
    expect(assignmentDelete).toHaveBeenCalledOnce()
    if (cancelsRegistration) {
      expect(deleteAssignmentsForRegistration).toHaveBeenCalledWith('registration_id', 'reg-1')
    } else {
      expect(deleteAssignmentsForRegistration).not.toHaveBeenCalled()
      expect(deleteAssignmentsForDates).toHaveBeenCalledWith('item_date', request.cancelled_dates)
    }
    expect(sendCancellationResultEmail).toHaveBeenCalledWith(expect.objectContaining({
      cancelledDates: request.cancelled_dates,
      eventDate: null,
    }))
  })
})
