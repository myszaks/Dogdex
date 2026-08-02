export function shouldHideMobileBottomNavigation(pathname: string | null | undefined) {
  if (!pathname) return false

  return pathname === '/organizer/events/new'
    || pathname === '/organizer/formats/new'
    || pathname === '/reset-password'
    || pathname === '/trainer/profile'
    || /^\/organizer\/events\/[^/]+\/edit$/.test(pathname)
    || /^\/organizer\/events\/[^/]+\/live-entry$/.test(pathname)
    || /^\/organizer\/events\/[^/]+\/results$/.test(pathname)
    || /^\/organizer\/formats\/[^/]+\/edit$/.test(pathname)
    || /^\/live\/[^/]+$/.test(pathname)
    || /^\/register\/[^/]+$/.test(pathname)
    || /^\/trainings\/[^/]+\/book\/[^/]+$/.test(pathname)
}
