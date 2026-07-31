import { describe, expect, it } from 'vitest'
import { buildEventPriceItems, validateEventPricing } from '@/lib/eventPricing'

const multidateField = {
  id: 'walk_dates',
  label: 'Terminy spacerów',
  type: 'multidate' as const,
  required: true,
  options: ['2030-08-01', '2030-08-08'],
}

describe('event pricing', () => {
  it('creates one server-priced item for a flat event fee', () => {
    expect(buildEventPriceItems({
      title: 'Warsztaty', pricing_mode: 'flat', entry_fee: 125,
      currency: 'PLN', form_fields: [], date_prices: {},
    }, {})).toEqual([expect.objectContaining({
      itemKey: 'entry', kind: 'entry', amount: 125, currency: 'PLN',
    })])
  })

  it('creates a separate item for every selected paid date', () => {
    const items = buildEventPriceItems({
      title: 'Spacery', pricing_mode: 'per_date', currency: 'PLN',
      form_fields: [multidateField],
      date_prices: { walk_dates: { '2030-08-01': 40, '2030-08-08': 55 } },
    }, { walk_dates: ['2030-08-01', '2030-08-08'] })
    expect(items.map(item => ({ key: item.itemKey, amount: item.amount }))).toEqual([
      { key: 'walk_dates:2030-08-01', amount: 40 },
      { key: 'walk_dates:2030-08-08', amount: 55 },
    ])
  })

  it('rejects missing or invalid prices for configured dates', () => {
    expect(validateEventPricing({
      title: 'Spacery', pricing_mode: 'per_date', form_fields: [multidateField],
      date_prices: { walk_dates: { '2030-08-01': 40 } },
    })).toContain('2030-08-08')
  })

  it('uses only server configuration and selected options when calculating total', () => {
    const items = buildEventPriceItems({
      title: 'Spacery', pricing_mode: 'per_date', currency: 'PLN',
      form_fields: [multidateField],
      date_prices: { walk_dates: { '2030-08-01': 40, '2030-08-08': 55 } },
    }, { walk_dates: ['2030-08-08'], submitted_amount: 1 })
    expect(items).toHaveLength(1)
    expect(items[0].amount).toBe(55)
  })

  it('deduplicates dates and ignores values outside configured options', () => {
    const items = buildEventPriceItems({
      title: 'Spacery', pricing_mode: 'per_date', currency: 'PLN',
      form_fields: [multidateField],
      date_prices: { walk_dates: { '2030-08-01': 40, '2030-08-08': 55, '2030-08-15': 1 } },
    }, { walk_dates: ['2030-08-01', '2030-08-01', '2030-08-15'] })
    expect(items.map(item => item.itemKey)).toEqual(['walk_dates:2030-08-01'])
  })

  it('rejects sub-cent prices and unsupported currencies', () => {
    expect(validateEventPricing({
      title: 'Warsztaty', pricing_mode: 'flat', entry_fee: 12.345, currency: 'PLN',
    })).toContain('2 miejsca')
    expect(validateEventPricing({
      title: 'Warsztaty', pricing_mode: 'flat', entry_fee: 12.34, currency: 'EUR',
    })).toContain('wyłącznie PLN')
  })
})
