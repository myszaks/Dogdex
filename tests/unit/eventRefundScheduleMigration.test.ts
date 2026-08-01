import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('paid event refund schedule migration', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260801110000_fix_paid_event_refund_schedule.sql'),
    'utf8',
  )

  it('removes every assignment when the refund cancels the registration', () => {
    expect(migration).toContain('if current_refund.cancel_registration then')
    expect(migration).toContain('assignment.registration_id = current_refund.registration_id')
  })

  it('removes only refunded dates for a partial cancellation', () => {
    expect(migration).toContain('assignment.item_date = any(refunded_dates)')
    expect(migration).toContain('slot.slot_date::text = any(refunded_dates)')
  })

  it('repairs artifacts created before the hotfix', () => {
    expect(migration).toContain("registration.status = 'cancelled'")
    expect(migration).toContain("assignment.item_date <> ''")
    expect(migration).toContain('selected_date.value = assignment.item_date')
  })
})
