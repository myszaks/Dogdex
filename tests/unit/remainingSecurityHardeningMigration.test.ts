import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('remaining security hardening migration', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260810170000_harden_remaining_security.sql'),
    'utf8',
  ).replace(/\s+/g, ' ')

  const serviceOnlyFunctions = [
    'complete_training_checkout(uuid, text, text)',
    'fail_training_checkout(uuid, text, text)',
    'reconcile_training_booking_states()',
    'claim_training_reminders(timestamptz, timestamptz, integer)',
    'release_training_reminder_claim(uuid, timestamptz)',
    'create_training_course_enrollment(uuid, uuid, uuid, text)',
    'approve_training_course_enrollment(uuid, uuid, boolean)',
    'complete_training_commerce_checkout(uuid, text, text)',
    'fail_training_commerce_checkout(uuid, text)',
    'reconcile_training_commerce_states()',
    'promote_training_course_waitlist(uuid)',
    'consume_training_pass_for_booking(uuid, uuid, uuid)',
    'reverse_training_pass_booking_usage(uuid)',
    'consume_training_pass_for_course_session(uuid, uuid, uuid, uuid)',
    'reverse_training_pass_session_usage(uuid, uuid)',
    'complete_training_commerce_refund(uuid, text)',
    'resolve_training_pass_request(uuid, uuid, boolean, text)',
  ]

  it.each(serviceOnlyFunctions)('uses invoker privileges for %s', signature => {
    expect(migration).toContain(`alter function public.${signature} security invoker;`)
  })

  it('makes password-reset cooldown reservation server-only', () => {
    expect(migration).toContain(
      'alter function public.reserve_password_reset_link(text, integer) security invoker;',
    )
    expect(migration).toContain(
      'revoke all on function public.reserve_password_reset_link(text, integer) from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'grant execute on function public.reserve_password_reset_link(text, integer) to service_role;',
    )
  })
})
