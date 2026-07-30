import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { fetchWithAuthRetry } from '@/lib/authFetch'

function response(status: number) {
  return { status } as Response
}

describe('authenticated request synchronization', () => {
  it('retries a transient 401 and returns the first authenticated response', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200))
    const wait = vi.fn().mockResolvedValue(undefined)

    const result = await fetchWithAuthRetry('/api/profile', undefined, {
      fetcher,
      wait,
      retryDelaysMs: [100, 250, 500],
    })

    expect(result.status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(wait).toHaveBeenNthCalledWith(1, 100)
    expect(wait).toHaveBeenNthCalledWith(2, 250)
  })

  it('does not retry a 403 or a backend error', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(403))
    const wait = vi.fn().mockResolvedValue(undefined)

    const result = await fetchWithAuthRetry('/api/profile', undefined, {
      fetcher,
      wait,
    })

    expect(result.status).toBe(403)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()
  })

  it('stops after the bounded number of 401 retries', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(401))
    const wait = vi.fn().mockResolvedValue(undefined)

    const result = await fetchWithAuthRetry('/api/profile', undefined, {
      fetcher,
      wait,
      retryDelaysMs: [100, 200],
    })

    expect(result.status).toBe(401)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(wait).toHaveBeenCalledTimes(2)
  })

  it('waits for the backend session and avoids stale protected-route prefetches', () => {
    const authModal = readFileSync(
      resolve(process.cwd(), 'components/AuthModal.tsx'),
      'utf8',
    )
    const navigation = readFileSync(
      resolve(process.cwd(), 'components/Navigation.tsx'),
      'utf8',
    )
    const userMenu = readFileSync(
      resolve(process.cwd(), 'components/UserMenu.tsx'),
      'utf8',
    )

    expect(authModal).toContain("fetchWithAuthRetry('/api/profile')")
    expect(authModal).toContain('supabase.auth.refreshSession()')
    expect(authModal).toContain('router.refresh()')
    expect(navigation).toContain(
      "prefetch={href === '/organizer' || href === '/trainer' ? false : undefined}",
    )
    expect(userMenu).toContain('prefetch={false}')
  })
})
