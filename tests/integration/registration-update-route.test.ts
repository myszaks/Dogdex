import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAuthClient = vi.fn()
const createServerClient = vi.fn()
const getServerUser = vi.fn()
const sendRegistrationEmail = vi.fn()
const sendCancellationEmailToOrganizer = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createAuthClient,
  createServerClient,
}))

vi.mock('@/lib/getServerUser', () => ({
  getServerUser,
}))

vi.mock('@/lib/email', () => ({
  sendRegistrationEmail,
  sendCancellationEmailToOrganizer,
}))

function registrationFetch(data: Record<string, unknown>) {
  return {
    select: () => ({
      eq: () => ({
        single: async () => ({ data, error: null }),
      }),
    }),
  }
}

function participantByDogId(ids: string[]) {
  return {
    select: () => ({
      eq: async () => ({ data: ids.map(id => ({ id })), error: null }),
    }),
  }
}

function participantByOwnerAndDog(ids: string[]) {
  return {
    select: () => ({
      ilike: () => ({
        ilike: async () => ({ data: ids.map(id => ({ id })), error: null }),
      }),
    }),
  }
}

function duplicateRegistration(ids: string[]) {
  return {
    select: () => ({
      eq: () => ({
        in: () => ({
          in: () => ({
            neq: () => ({
              limit: async () => ({ data: ids.map(id => ({ id })), error: null }),
            }),
          }),
        }),
      }),
    }),
  }
}

function activeCount(count: number) {
  return {
    select: () => ({
      eq: () => ({
        in: () => ({
          neq: async () => ({ count, error: null }),
        }),
      }),
    }),
  }
}

describe('PATCH /api/registrations/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getServerUser.mockResolvedValue({
      user: { id: 'organizer-1', email: 'org@example.com' },
      role: 'organizer',
    })
  })

  it('rejects an organizer who does not own the registration event', async () => {
    createAuthClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== 'registrations') throw new Error(`Unexpected table ${table}`)
        return registrationFetch({
          id: 'reg-foreign',
          event_id: 'event-2',
          status: 'pending',
          participants: {
            id: 'participant-foreign',
            owner_email: 'participant@example.com',
          },
          events: {
            id: 'event-2',
            created_by: 'organizer-2',
          },
        })
      }),
    })

    const { PATCH } = await import('@/app/api/registrations/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/registrations/reg-foreign', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'confirmed' }),
      }),
      { params: Promise.resolve({ id: 'reg-foreign' }) },
    )

    expect(response.status).toBe(403)
  })

  it('blocks reactivating a cancelled registration when event capacity is full', async () => {
    const reg = {
      id: 'reg-3',
      event_id: 'event-1',
      status: 'cancelled',
      participant_id: 'participant-3',
      participants: {
        id: 'participant-3',
        owner_email: 'ala@example.com',
        dog_name: 'Figa',
        dog_id: 'dog-3',
      },
      events: {
        id: 'event-1',
        created_by: 'organizer-1',
        max_participants: 2,
      },
    }

    let registrationCalls = 0
    let participantCalls = 0
    createAuthClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'registrations') {
          registrationCalls += 1
          if (registrationCalls === 1) return registrationFetch(reg)
          if (registrationCalls === 2) return duplicateRegistration([])
          return activeCount(2)
        }
        if (table === 'participants') {
          participantCalls += 1
          return participantCalls === 1
            ? participantByDogId(['participant-3'])
            : participantByOwnerAndDog(['participant-3'])
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { PATCH } = await import('@/app/api/registrations/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/registrations/reg-3', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'pending' }),
      }),
      { params: Promise.resolve({ id: 'reg-3' }) },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Brak wolnych miejsc na to wydarzenie',
    })
  })

  it('blocks reactivating a cancelled duplicate of the same dog', async () => {
    const reg = {
      id: 'reg-3',
      event_id: 'event-1',
      status: 'cancelled',
      participant_id: 'participant-3',
      participants: {
        id: 'participant-3',
        owner_email: 'ala@example.com',
        dog_name: 'Figa',
        dog_id: 'dog-3',
      },
      events: {
        id: 'event-1',
        created_by: 'organizer-1',
        max_participants: 10,
      },
    }

    let registrationCalls = 0
    let participantCalls = 0
    createAuthClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'registrations') {
          registrationCalls += 1
          if (registrationCalls === 1) return registrationFetch(reg)
          return duplicateRegistration(['reg-active'])
        }
        if (table === 'participants') {
          participantCalls += 1
          return participantCalls === 1
            ? participantByDogId(['participant-3', 'participant-active'])
            : participantByOwnerAndDog(['participant-3', 'participant-active'])
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { PATCH } = await import('@/app/api/registrations/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/registrations/reg-3', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'confirmed' }),
      }),
      { params: Promise.resolve({ id: 'reg-3' }) },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Ten pies ma już aktywny zapis na to wydarzenie',
    })
  })

  it('cancels explicitly and removes schedule assignments for the registration', async () => {
    const registration = {
      id: 'reg-1',
      event_id: 'event-1',
      status: 'confirmed',
      participants: {
        id: 'participant-1',
        owner_email: 'ala@example.com',
        dog_name: 'Figa',
      },
      events: {
        id: 'event-1',
        created_by: 'organizer-1',
      },
    }
    const updatedRegistration = {
      ...registration,
      status: 'cancelled',
    }
    let registrationCalls = 0
    createAuthClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== 'registrations') throw new Error(`Unexpected table ${table}`)
        registrationCalls += 1
        if (registrationCalls === 1) return registrationFetch(registration)
        return {
          update: vi.fn(() => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: updatedRegistration, error: null }),
              }),
            }),
          })),
        }
      }),
    })

    const assignmentEq = vi.fn(async () => ({ error: null }))
    const assignmentDelete = vi.fn(() => ({ eq: assignmentEq }))
    createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'event_payments') return {
          select: () => ({ eq: () => ({ in: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
        }
        if (table !== 'schedule_assignments') throw new Error(`Unexpected table ${table}`)
        return { delete: assignmentDelete }
      }),
    })

    const { PATCH } = await import('@/app/api/registrations/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/registrations/reg-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      }),
      { params: Promise.resolve({ id: 'reg-1' }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: 'reg-1',
      status: 'cancelled',
    })
    expect(assignmentDelete).toHaveBeenCalledOnce()
    expect(assignmentEq).toHaveBeenCalledWith('registration_id', 'reg-1')
  })
})
