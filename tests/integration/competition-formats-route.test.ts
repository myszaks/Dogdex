import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VERSATILE_DOG_CUP_FORMAT } from '@/lib/competitionPresets'

const createAuthClient = vi.fn()
const checkRoleForApi = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createAuthClient,
}))

vi.mock('@/lib/getServerUser', () => ({
  checkRoleForApi,
}))

describe('POST /api/competition-formats', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('saves the complex points format produced by the organizer creator', async () => {
    checkRoleForApi.mockResolvedValue({
      user: { id: 'organizer-1' },
      role: 'organizer',
    })

    const insert = vi.fn()
    const single = vi.fn(async () => ({
      data: { id: 'format-1', name: VERSATILE_DOG_CUP_FORMAT.name },
      error: null,
    }))
    insert.mockReturnValue({
      select: () => ({ single }),
    })
    createAuthClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== 'competition_formats') throw new Error(`Unexpected table ${table}`)
        return { insert }
      }),
    })

    const { POST } = await import('@/app/api/competition-formats/route')
    const response = await POST(new Request('http://localhost/api/competition-formats', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: VERSATILE_DOG_CUP_FORMAT.name,
        description: 'Test kreatora dla organizatora.',
        definition: VERSATILE_DOG_CUP_FORMAT,
        status: 'published',
      }),
    }))

    expect(response.status).toBe(201)
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      name: 'Puchar wszechstronnego psa',
      status: 'published',
      definition: VERSATILE_DOG_CUP_FORMAT,
      created_by: 'organizer-1',
      is_system: false,
    })])
  })
})
