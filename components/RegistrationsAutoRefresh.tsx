'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const REFRESH_INTERVAL_MS = 30_000

/**
 * Keeps the server-rendered "My registrations" list in sync with decisions
 * made by an organizer in another session.
 */
export default function RegistrationsAutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }

    window.addEventListener('focus', refreshIfVisible)
    document.addEventListener('visibilitychange', refreshIfVisible)
    const intervalId = window.setInterval(refreshIfVisible, REFRESH_INTERVAL_MS)

    return () => {
      window.removeEventListener('focus', refreshIfVisible)
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.clearInterval(intervalId)
    }
  }, [router])

  return null
}
