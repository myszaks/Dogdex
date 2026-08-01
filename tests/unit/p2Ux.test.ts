import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import EventPricingEditor from '@/components/EventPricingEditor'

const noop = vi.fn()

describe('P2 UX improvements', () => {
  it('keeps per-date pricing discoverable before a date field exists', () => {
    const html = renderToStaticMarkup(createElement(EventPricingEditor, {
      pricingMode: 'flat',
      entryFee: '100',
      datePrices: {},
      formFields: [],
      onPricingModeChange: noop,
      onEntryFeeChange: noop,
      onDatePricesChange: noop,
    }))

    expect(html).toContain('Osobna cena za każdy termin')
    expect(html).toContain('Wybór dat (wielokrotny)')
    expect(html).toContain('value="per_date"')
    expect(html).toContain('disabled=""')
  })

  it('allows selecting per-date pricing before the first date is entered', () => {
    const html = renderToStaticMarkup(createElement(EventPricingEditor, {
      pricingMode: 'per_date',
      entryFee: '',
      datePrices: {},
      formFields: [{ id: 'dates', label: 'Terminy', type: 'multidate', required: true, options: [] }],
      onPricingModeChange: noop,
      onEntryFeeChange: noop,
      onDatePricesChange: noop,
    }))

    const perDateInput = html.match(/<input[^>]*value="per_date"[^>]*>/)?.[0]
    expect(perDateInput).toContain('checked=""')
    expect(perDateInput).not.toContain('disabled=""')
    expect(html).toContain('Dodaj co najmniej jeden termin')
  })

  it('closes the login modal before session synchronization', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/AuthModal.tsx'), 'utf8')
    const successfulLogin = source.slice(source.indexOf('async function signInWithEmail'), source.indexOf('async function signUpWithEmail'))

    expect(successfulLogin.indexOf('onClose()')).toBeGreaterThan(-1)
    expect(successfulLogin.indexOf('onClose()')).toBeLessThan(successfulLogin.indexOf("fetchWithAuthRetry('/api/profile')"))
  })

  it('declares an existing application icon in page metadata', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/layout.tsx'), 'utf8')
    const iconPath = resolve(process.cwd(), 'public/icon-192.png')

    expect(source).toContain("url: '/icon-192.png'")
    expect(() => readFileSync(iconPath)).not.toThrow()
  })
})
