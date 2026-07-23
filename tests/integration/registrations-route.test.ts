import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServerClient = vi.fn()
const createAuthClient = vi.fn()
const checkRoleForApi = vi.fn()
const getServerUser = vi.fn()
const sendRegistrationEmail = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createServerClient,
  createAuthClient,
}))

vi.mock('@/lib/getServerUser', () => ({
  checkRoleForApi,
  getServerUser,
}))

vi.mock('@/lib/email', () => ({
  sendRegistrationEmail,
}))

describe('POST /api/registrations', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getServerUser.mockResolvedValue({ user: null, role: null })
    sendRegistrationEmail.mockResolvedValue(undefined)
  })

  it('rejects registration when the deadline is already past', async () => {
    createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'events') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'event-1',
                    status: 'upcoming',
                    auto_confirm: true,
                    max_participants: null,
                    title: 'Spacer',
                    start_at: '2000-07-10T10:00:00.000Z',
                    end_at: null,
                    location: 'Park',
                    form_fields: [],
                    registration_deadline: '2000-07-09T10:00:00.000Z',
                  },
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { POST } = await import('@/app/api/registrations/route')
    const response = await POST(new Request('http://localhost/api/registrations', {
      method: 'POST',
      body: JSON.stringify({
        eventId: 'event-1',
        ownerName: 'Jan Kowalski',
        dogName: 'Burek',
      }),
    }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('zamkni'),
    })
  })

  it('rejects registration before the opening date', async () => {
    createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'events') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'event-1',
                    status: 'upcoming',
                    auto_confirm: true,
                    max_participants: null,
                    title: 'Spacer',
                    start_at: '2999-07-20T10:00:00.000Z',
                    end_at: null,
                    location: 'Park',
                    form_fields: [],
                    registration_opens_at: '2999-07-10T10:00:00.000Z',
                    registration_deadline: null,
                  },
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { POST } = await import('@/app/api/registrations/route')
    const response = await POST(new Request('http://localhost/api/registrations', {
      method: 'POST',
      body: JSON.stringify({
        eventId: 'event-1',
        ownerName: 'Jan Kowalski',
        dogName: 'Burek',
      }),
    }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('nie rozpoczęły'),
      registrationOpensAt: '2999-07-10T10:00:00.000Z',
    })
  })

  it('removes orphan participant when registration creation fails', async () => {
    const cleanupEq = vi.fn().mockResolvedValue({ error: null })

    createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'events') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'event-1',
                    status: 'upcoming',
                    auto_confirm: true,
                    max_participants: null,
                    title: 'Spacer',
                    start_at: '2999-07-20T10:00:00.000Z',
                    end_at: null,
                    location: 'Park',
                    form_fields: [],
                    registration_deadline: null,
                  },
                }),
              }),
            }),
          }
        }

        if (table === 'participants') {
          return {
            select: () => ({
              ilike: () => ({
                ilike: async () => ({ data: [] }),
              }),
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: 'participant-1' },
                  error: null,
                }),
              }),
            }),
            delete: () => ({
              eq: cleanupEq,
            }),
          }
        }

        if (table === 'registrations') {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { message: 'insert failed' },
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { POST } = await import('@/app/api/registrations/route')
    const response = await POST(new Request('http://localhost/api/registrations', {
      method: 'POST',
      body: JSON.stringify({
        eventId: 'event-1',
        ownerName: 'Jan Kowalski',
        ownerEmail: 'jan@example.com',
        dogName: 'Burek',
      }),
    }))

    expect(response.status).toBe(500)
    expect(cleanupEq).toHaveBeenCalledWith('id', 'participant-1')
  })

  it('verifies a selected dog with the authenticated client instead of service role', async () => {
    const authFrom = vi.fn((table: string) => {
      if (table !== 'dogs') throw new Error(`Unexpected auth table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'dog-1' }, error: null }),
            }),
          }),
        }),
      }
    })
    const insertParticipant = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: 'participant-1' }, error: null }),
      }),
    })

    getServerUser.mockResolvedValue({
      user: { id: 'user-1', email: 'jan@example.com' },
      role: 'user',
    })
    createAuthClient.mockResolvedValue({ from: authFrom })
    createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'events') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'event-1',
                    status: 'upcoming',
                    auto_confirm: true,
                    max_participants: null,
                    title: 'Speedway',
                    start_at: '2999-07-20T08:00:00.000Z',
                    end_at: null,
                    location: 'Tor',
                    form_fields: [],
                    registration_deadline: null,
                  },
                }),
              }),
            }),
          }
        }

        if (table === 'dogs') throw new Error('service role must not verify dog ownership')
        if (table === 'participants') return { insert: insertParticipant }
        if (table === 'registrations') {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: 'registration-1', form_data: {} },
                  error: null,
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { POST } = await import('@/app/api/registrations/route')
    const response = await POST(new Request('http://localhost/api/registrations', {
      method: 'POST',
      body: JSON.stringify({
        eventId: 'event-1',
        ownerName: 'Jan Kowalski',
        dogName: 'Burek',
        dogId: 'dog-1',
      }),
    }))

    expect(response.status).toBe(201)
    expect(authFrom).toHaveBeenCalledWith('dogs')
    expect(insertParticipant).toHaveBeenCalledWith([
      expect.objectContaining({ dog_id: 'dog-1', user_id: 'user-1' }),
    ])
  })

  it('normalizes owner email before storing participant and sending confirmation', async () => {
    const insertParticipant = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({
          data: { id: 'participant-1' },
          error: null,
        }),
      }),
    })

    createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'events') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'event-1',
                    status: 'upcoming',
                    auto_confirm: true,
                    max_participants: null,
                    title: 'Spacer',
                    start_at: '2999-07-20T08:00:00.000Z',
                    end_at: null,
                    location: 'Park',
                    form_fields: [],
                    registration_deadline: null,
                  },
                }),
              }),
            }),
          }
        }

        if (table === 'participants') {
          return {
            select: () => ({
              ilike: () => ({
                ilike: async () => ({ data: [] }),
              }),
            }),
            insert: insertParticipant,
          }
        }

        if (table === 'registrations') {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: 'registration-1', form_data: {} },
                  error: null,
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { POST } = await import('@/app/api/registrations/route')
    const response = await POST(new Request('http://localhost/api/registrations', {
      method: 'POST',
      body: JSON.stringify({
        eventId: 'event-1',
        ownerName: 'Jan Kowalski',
        ownerEmail: '  Jan.Kowalski@Example.COM  ',
        dogName: 'Burek',
      }),
    }))

    expect(response.status).toBe(201)
    expect(insertParticipant).toHaveBeenCalledWith([
      expect.objectContaining({ owner_email: 'jan.kowalski@example.com' }),
    ])
    expect(sendRegistrationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'jan.kowalski@example.com' })
    )
  })
})
