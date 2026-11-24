import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import CancellationRequestForm from '@/components/CancellationRequestForm'
import type { FormField } from '@/types'

const datesField: FormField = {
  id: 'dates', label: 'Terminy', type: 'multidate', required: true,
  options: ['2030-08-01', '2030-08-08', '2030-08-15'],
}

function render(formFields: FormField[], formData: Record<string, unknown> | null) {
  return renderToStaticMarkup(createElement(CancellationRequestForm, {
    registrationId: 'registration-1', formFields, formData,
    onSuccess: vi.fn(), onCancel: vi.fn(),
  }))
}

describe('cancellation term selection', () => {
  it('offers only booked dates, initially unchecked, and blocks an empty request', () => {
    const markup = render([datesField], { dates: ['2030-08-01', '2030-08-08'] })
    expect(markup.match(/type="checkbox"/g)).toHaveLength(2)
    expect(markup).not.toContain('checked=')
    expect(markup).toContain('Zaznacz wszystkie')
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Wyślij wniosek o rezygnację/)
    expect(markup).toContain('po akceptacji organizatora')
  })

  it('offers a single booked date once even if it occurs in multiple fields', () => {
    const markup = render([datesField, { ...datesField, id: 'other' }], {
      dates: ['2030-08-08', '2030-08-08'], other: '2030-08-08',
    })
    expect(markup.match(/type="checkbox"/g)).toHaveLength(1)
    expect(markup).toContain('Wybierz terminy')
  })

  it('keeps whole-registration confirmation for events without selected dates', () => {
    const markup = render([], null)
    expect(markup).not.toContain('type="checkbox"')
    expect(markup).toContain('Czy na pewno chcesz wycofać ten zapis')
    expect(markup).not.toContain('disabled=""')
  })
})
