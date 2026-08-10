import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('UI information architecture', () => {
  it('uses the home-page width as the global page container', () => {
    const layout = readFileSync('app/layout.tsx', 'utf8')
    const container = readFileSync('components/layout/PageContainer.tsx', 'utf8')

    expect(layout).toContain('<PageContainer>{children}</PageContainer>')
    expect(container).toContain("'mx-auto w-full max-w-7xl'")
  })

  it('exposes one personal and one management entry in primary navigation', () => {
    const navigation = readFileSync('components/Navigation.tsx', 'utf8')
    const userMenu = readFileSync('components/UserMenu.tsx', 'utf8')

    expect(navigation).toContain("label: 'Mój Dogdex'")
    expect(navigation).toContain("label: 'Zarządzanie'")
    expect(navigation).not.toContain("label: 'Moje zapisy'")
    expect(navigation).not.toContain("label: 'Moje psy'")
    expect(navigation).not.toContain("label: 'Panel trenera'")
    expect(navigation).not.toContain("label: 'Panel organizatora'")
    expect(navigation).not.toContain("label: 'Archiwum'")
    expect(userMenu).not.toContain('label="Mój Dogdex"')
  })

  it('groups personal destinations under the Mój Dogdex workspace', () => {
    const workspace = readFileSync('components/PersonalWorkspaceShell.tsx', 'utf8')

    for (const label of ['Zapisy', 'Psy', 'Profil', 'Role i dostęp', 'Bezpieczeństwo']) {
      expect(workspace).toContain(`label: '${label}'`)
    }
  })

  it('keeps management areas behind a single role-aware landing page', () => {
    const managePage = readFileSync('app/manage/page.tsx', 'utf8')
    const workspace = readFileSync('components/ManagementWorkspaceShell.tsx', 'utf8')

    expect(managePage).toContain('isOrganizerRole(role)')
    expect(managePage).toContain('isTrainerRole(role)')
    expect(managePage).toContain('href="/organizer"')
    expect(managePage).toContain("trainer ? '/trainer' : '/trainer/groups'")
    expect(managePage).toContain('href="/payments"')
    expect(managePage).not.toContain("redirect('/organizer')")
    expect(managePage).not.toContain("redirect('/trainer')")

    for (const label of ['Przegląd', 'Zespół', 'Wydarzenia', 'Treningi', 'Płatności']) {
      expect(workspace).toContain(`label: '${label}'`)
    }
    for (const label of ['Pulpit', 'Rezerwacje', 'Oferta', 'Dostępność', 'Analityka', 'Profil trenera']) {
      expect(workspace).toContain(`label: '${label}'`)
    }
  })

  it('uses the management workspace across every management area', () => {
    for (const layoutPath of [
      'app/manage/layout.tsx',
      'app/organizer/layout.tsx',
      'app/trainer/layout.tsx',
      'app/payments/layout.tsx',
      'app/admin/layout.tsx',
    ]) {
      const layout = readFileSync(layoutPath, 'utf8')
      expect(layout).toContain('ManagementWorkspaceShell')
      expect(layout).toMatch(/requireRole\(|getServerUser\(/)
    }
  })

  it('uses shared page headers and breadcrumbs in nested workspaces', () => {
    const personalWorkspace = readFileSync('components/PersonalWorkspaceShell.tsx', 'utf8')
    const managementWorkspace = readFileSync('components/ManagementWorkspaceShell.tsx', 'utf8')
    const eventWorkspace = readFileSync('components/EventWorkspaceShell.tsx', 'utf8')
    const pageHeader = readFileSync('components/layout/PageHeader.tsx', 'utf8')

    expect(pageHeader).toContain('Breadcrumbs')
    expect(personalWorkspace).toContain('<PageHeader')
    expect(managementWorkspace).toContain('<PageHeader')
    expect(eventWorkspace).toContain('<PageHeader')
  })

  it('groups every event operation in one event workspace', () => {
    const eventWorkspace = readFileSync('components/EventWorkspaceShell.tsx', 'utf8')
    const eventLayout = readFileSync('app/organizer/events/[eventId]/layout.tsx', 'utf8')
    const organizerCard = readFileSync('components/OrganizerEventCard.tsx', 'utf8')

    for (const label of ['Podsumowanie', 'Zapisy', 'Grafik', 'Check-in', 'Wyniki', 'Ustawienia']) {
      expect(eventWorkspace).toContain(`label: '${label}'`)
    }
    expect(eventLayout).toContain('EventWorkspaceShell')
    expect(organizerCard).toContain('Zarządzaj')
    expect(organizerCard).not.toContain('/registrations')
    expect(organizerCard).not.toContain('/schedule')
    expect(organizerCard).not.toContain('/results')
  })

  it('combines current and archived events while preserving the old archive entry', () => {
    const homePage = readFileSync('app/page.tsx', 'utf8')
    const archivePage = readFileSync('app/archive/page.tsx', 'utf8')

    expect(homePage).toContain("sp.widok === 'archiwum'")
    expect(homePage).toContain('href="/?widok=archiwum"')
    expect(archivePage).toContain('permanentRedirect')
    expect(archivePage).toContain("widok: 'archiwum'")
  })
})
