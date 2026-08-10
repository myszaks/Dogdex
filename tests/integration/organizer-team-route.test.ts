import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  createServerClient: vi.fn(),
  sendInvitation: vi.fn(),
}))

vi.mock('@/lib/getServerUser', () => ({ getServerUser: mocks.getServerUser }))
vi.mock('@/lib/supabaseServer', () => ({ createServerClient: mocks.createServerClient }))
vi.mock('@/lib/email', () => ({ sendOrganizerTeamInvitationEmail: mocks.sendInvitation }))

describe('organizer team routes', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.getServerUser.mockResolvedValue({
      user: { id: 'organizer-1', email: 'owner@example.com' },
      role: 'organizer',
    })
    mocks.sendInvitation.mockResolvedValue(true)
  })

  it('adds a reusable member to existing events without overwriting event permissions', async () => {
    const upsertAssignments = vi.fn(async () => ({ error: null }))
    const updateAssignment = vi.fn(() => ({
      in: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(async () => ({ error: null })),
        })),
      })),
    }))
    const insertMember = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: {
            id: 'team-1',
            email: 'helper@example.com',
            user_id: 'user-2',
            default_permissions: ['registrations', 'checkin'],
            auto_assign_new_events: true,
            status: 'active',
          },
          error: null,
        })),
      })),
    }))

    let organizerTeamCalls = 0
    let profileCalls = 0
    const db = {
      auth: {
        admin: {
          listUsers: vi.fn(async () => ({
            data: { users: [{ id: 'user-2', email: 'helper@example.com' }] },
          })),
        },
      },
      from: vi.fn((table: string) => {
        if (table === 'organizer_team_members') {
          organizerTeamCalls += 1
          if (organizerTeamCalls === 1) {
            const existingQuery = {
              select: vi.fn(),
              eq: vi.fn(),
              maybeSingle: vi.fn(async () => ({ data: null })),
            }
            existingQuery.select.mockReturnValue(existingQuery)
            existingQuery.eq.mockReturnValue(existingQuery)
            return existingQuery
          }
          return { insert: insertMember }
        }
        if (table === 'events') {
          const query = {
            select: vi.fn(),
            eq: vi.fn(async () => ({ data: [{ id: 'event-1' }, { id: 'event-2' }] })),
          }
          query.select.mockReturnValue(query)
          return query
        }
        if (table === 'event_team_members') {
          return { upsert: upsertAssignments, update: updateAssignment }
        }
        if (table === 'organizer_profiles') {
          const query = {
            select: vi.fn(),
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({ data: { organization_name: 'Klub Psa', display_name: null } })),
          }
          query.select.mockReturnValue(query)
          query.eq.mockReturnValue(query)
          return query
        }
        if (table === 'profiles') {
          profileCalls += 1
          if (profileCalls === 1) {
            const query = {
              select: vi.fn(),
              eq: vi.fn(),
              maybeSingle: vi.fn(async () => ({ data: { full_name: 'Owner', company: null } })),
            }
            query.select.mockReturnValue(query)
            query.eq.mockReturnValue(query)
            return query
          }
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({ data: [{ id: 'user-2', full_name: 'Helper' }] })),
            })),
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    }
    mocks.createServerClient.mockReturnValue(db)

    const { POST } = await import('@/app/api/organizer-team/route')
    const response = await POST(new Request('http://localhost/api/organizer-team', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'Helper@Example.com',
        defaultPermissions: ['registrations', 'checkin'],
        autoAssignNewEvents: true,
        assignExistingEvents: true,
      }),
    }))

    expect(response!.status).toBe(201)
    expect(upsertAssignments).toHaveBeenCalledWith([
      expect.objectContaining({
        event_id: 'event-1',
        email: 'helper@example.com',
        permissions: ['registrations', 'checkin'],
        organizer_team_member_id: 'team-1',
      }),
      expect.objectContaining({ event_id: 'event-2' }),
    ], { onConflict: 'event_id,email', ignoreDuplicates: true })
    expect(updateAssignment).toHaveBeenCalledWith({ organizer_team_member_id: 'team-1' })
    expect(mocks.sendInvitation).toHaveBeenCalledWith(expect.objectContaining({
      to: 'helper@example.com',
      organizerName: 'Klub Psa',
    }))
  })

  it('revokes only assignments linked to the removed reusable member', async () => {
    const deleteAssignmentsEq = vi.fn(async () => ({ error: null }))
    const deleteMemberEq = vi.fn(async () => ({ error: null }))
    let organizerTeamCalls = 0
    const db = {
      from: vi.fn((table: string) => {
        if (table === 'organizer_team_members') {
          organizerTeamCalls += 1
          if (organizerTeamCalls === 1) {
            const query = {
              select: vi.fn(),
              eq: vi.fn(),
              maybeSingle: vi.fn(async () => ({
                data: { id: 'team-1', organizer_id: 'organizer-1', email: 'helper@example.com' },
              })),
            }
            query.select.mockReturnValue(query)
            query.eq.mockReturnValue(query)
            return query
          }
          return { delete: vi.fn(() => ({ eq: deleteMemberEq })) }
        }
        if (table === 'event_team_members') {
          return { delete: vi.fn(() => ({ eq: deleteAssignmentsEq })) }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    }
    mocks.createServerClient.mockReturnValue(db)

    const { DELETE } = await import('@/app/api/organizer-team/[memberId]/route')
    const response = await DELETE(new Request('http://localhost/api/organizer-team/team-1', {
      method: 'DELETE',
    }), { params: Promise.resolve({ memberId: 'team-1' }) })

    expect(response!.status).toBe(200)
    expect(deleteAssignmentsEq).toHaveBeenCalledWith('organizer_team_member_id', 'team-1')
    expect(deleteMemberEq).toHaveBeenCalledWith('id', 'team-1')
  })
})
