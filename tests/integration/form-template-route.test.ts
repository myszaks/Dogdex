import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAuthClient = vi.fn()
const getServerUser = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({ createAuthClient }))
vi.mock('@/lib/getServerUser', () => ({ getServerUser }))

describe('PATCH /api/form-templates/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('updates the existing organizer template without replacing its id', async () => {
    getServerUser.mockResolvedValue({ user: { id: 'organizer-1' } })

    const ownershipQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn(async () => ({
        data: { id: 'template-1', created_by: 'organizer-1' },
        error: null,
      })),
    }
    ownershipQuery.select.mockReturnValue(ownershipQuery)
    ownershipQuery.eq.mockReturnValue(ownershipQuery)

    const updatedTemplate = {
      id: 'template-1',
      name: 'Warsztaty — formularz',
      event_type_id: 'wykłady',
      fields: [{
        id: 'level',
        label: 'Poziom',
        type: 'select',
        required: true,
        options: ['Początkujący'],
      }],
    }
    const updateQuery = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      single: vi.fn(async () => ({ data: updatedTemplate, error: null })),
    }
    updateQuery.update.mockReturnValue(updateQuery)
    updateQuery.eq.mockReturnValue(updateQuery)
    updateQuery.select.mockReturnValue(updateQuery)

    let call = 0
    const from = vi.fn(() => {
      call += 1
      return call === 1 ? ownershipQuery : updateQuery
    })
    createAuthClient.mockResolvedValue({ from })

    const { PATCH } = await import('@/app/api/form-templates/[id]/route')
    const response = await PATCH(new Request('http://localhost/api/form-templates/template-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: updatedTemplate.name,
        event_type_id: updatedTemplate.event_type_id,
        fields: updatedTemplate.fields,
      }),
    }), { params: Promise.resolve({ id: 'template-1' }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(updatedTemplate)
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      name: updatedTemplate.name,
      fields: updatedTemplate.fields,
    }))
    expect(from).toHaveBeenCalledTimes(2)
  })
})
