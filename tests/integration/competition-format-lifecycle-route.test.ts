import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TIME_TRIAL_FORMAT } from '@/lib/competitionPresets'

const createAuthClient = vi.fn()
const checkRoleForApi = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createAuthClient,
}))

vi.mock('@/lib/getServerUser', () => ({
  checkRoleForApi,
}))

function readableQuery(data: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

describe('competition format lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    checkRoleForApi.mockResolvedValue({
      user: { id: 'organizer-1' },
      role: 'organizer',
    })
  })

  it('does not archive a published format used by an event', async () => {
    const formatQuery = readableQuery({
      id: 'format-1',
      created_by: 'organizer-1',
      status: 'published',
      is_system: false,
    })
    const eventQuery = {
      select: vi.fn(),
      eq: vi.fn(async () => ({ count: 2, error: null })),
    }
    eventQuery.select.mockReturnValue(eventQuery)
    const update = vi.fn()

    createAuthClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'events') return eventQuery
        return { ...formatQuery, update }
      }),
    })

    const { PATCH } = await import('@/app/api/competition-formats/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/competition-formats/format-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      }),
      { params: Promise.resolve({ id: 'format-1' }) },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      usageCount: 2,
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('archives an unused published format without changing its definition', async () => {
    const formatQuery = readableQuery({
      id: 'format-1',
      created_by: 'organizer-1',
      status: 'published',
      is_system: false,
    })
    const eventQuery = {
      select: vi.fn(),
      eq: vi.fn(async () => ({ count: 0, error: null })),
    }
    eventQuery.select.mockReturnValue(eventQuery)

    const single = vi.fn(async () => ({
      data: { id: 'format-1', status: 'archived' },
      error: null,
    }))
    const updateSelect = vi.fn(() => ({ single }))
    const updateEq = vi.fn(() => ({ select: updateSelect }))
    const update = vi.fn(() => ({ eq: updateEq }))

    createAuthClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'events') return eventQuery
        return { ...formatQuery, update }
      }),
    })

    const { PATCH } = await import('@/app/api/competition-formats/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/competition-formats/format-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'archived',
          name: 'Próba niedozwolonej zmiany',
          definition: { schemaVersion: 999 },
        }),
      }),
      { params: Promise.resolve({ id: 'format-1' }) },
    )

    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'archived',
    }))
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({
      name: expect.anything(),
      definition: expect.anything(),
    }))
  })

  it('copies a published version into a draft with the next family version number', async () => {
    const source = {
      id: 'format-v2',
      family_id: 'family-1',
      version: 2,
      name: 'Próba czasowa',
      description: 'Najlepszy czas.',
      definition: TIME_TRIAL_FORMAT,
      status: 'published',
      created_by: 'organizer-1',
      is_system: false,
    }
    const sourceQuery = readableQuery(source)
    const draftQuery = readableQuery(null)
    const newestQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: { version: 4 }, error: null })),
    }
    newestQuery.select.mockReturnValue(newestQuery)
    newestQuery.eq.mockReturnValue(newestQuery)
    newestQuery.order.mockReturnValue(newestQuery)
    newestQuery.limit.mockReturnValue(newestQuery)

    const insert = vi.fn()
    const single = vi.fn(async () => ({
      data: { id: 'format-v5', version: 5, status: 'draft' },
      error: null,
    }))
    insert.mockReturnValue({ select: () => ({ single }) })

    const formatQueries = [
      sourceQuery,
      draftQuery,
      newestQuery,
      { insert },
    ]
    createAuthClient.mockResolvedValue({
      from: vi.fn(() => formatQueries.shift()),
    })

    const { POST } = await import('@/app/api/competition-formats/[id]/versions/route')
    const response = await POST(
      new Request('http://localhost/api/competition-formats/format-v2/versions', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'format-v2' }) },
    )

    expect(response.status).toBe(201)
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      family_id: 'family-1',
      previous_version_id: 'format-v2',
      version: 5,
      status: 'draft',
      definition: TIME_TRIAL_FORMAT,
    })])
  })

  it('returns the existing family draft instead of creating a duplicate', async () => {
    const sourceQuery = readableQuery({
      id: 'format-v1',
      family_id: 'family-1',
      version: 1,
      name: 'Próba czasowa',
      description: null,
      definition: TIME_TRIAL_FORMAT,
      status: 'published',
      created_by: 'organizer-1',
      is_system: false,
    })
    const draftQuery = readableQuery({
      id: 'format-v2',
      family_id: 'family-1',
      version: 2,
      status: 'draft',
    })
    const insert = vi.fn()
    const formatQueries = [sourceQuery, draftQuery]

    createAuthClient.mockResolvedValue({
      from: vi.fn(() => formatQueries.shift() ?? { insert }),
    })

    const { POST } = await import('@/app/api/competition-formats/[id]/versions/route')
    const response = await POST(
      new Request('http://localhost/api/competition-formats/format-v1/versions', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'format-v1' }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: 'format-v2',
      reused: true,
    })
    expect(insert).not.toHaveBeenCalled()
  })
})
