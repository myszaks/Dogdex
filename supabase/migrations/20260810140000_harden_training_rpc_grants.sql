-- Supabase projects can keep explicit EXECUTE grants for the API roles even
-- after EXECUTE has been revoked from the PostgreSQL PUBLIC pseudo-role.
-- These RPCs bypass RLS and are called only by trusted server-side code.

revoke all on function public.complete_training_checkout(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.fail_training_checkout(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.reconcile_training_booking_states()
  from public, anon, authenticated;
revoke all on function public.claim_training_reminders(timestamptz, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.release_training_reminder_claim(uuid, timestamptz)
  from public, anon, authenticated;

revoke all on function public.create_training_course_enrollment(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.approve_training_course_enrollment(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.complete_training_commerce_checkout(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.fail_training_commerce_checkout(uuid, text)
  from public, anon, authenticated;
revoke all on function public.reconcile_training_commerce_states()
  from public, anon, authenticated;

revoke all on function public.promote_training_course_waitlist(uuid)
  from public, anon, authenticated;
revoke all on function public.consume_training_pass_for_booking(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.reverse_training_pass_booking_usage(uuid)
  from public, anon, authenticated;
revoke all on function public.consume_training_pass_for_course_session(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.reverse_training_pass_session_usage(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_training_commerce_refund(uuid, text)
  from public, anon, authenticated;
revoke all on function public.resolve_training_pass_request(uuid, uuid, boolean, text)
  from public, anon, authenticated;

grant execute on function public.complete_training_checkout(uuid, text, text) to service_role;
grant execute on function public.fail_training_checkout(uuid, text, text) to service_role;
grant execute on function public.reconcile_training_booking_states() to service_role;
grant execute on function public.claim_training_reminders(timestamptz, timestamptz, integer) to service_role;
grant execute on function public.release_training_reminder_claim(uuid, timestamptz) to service_role;
grant execute on function public.create_training_course_enrollment(uuid, uuid, uuid, text) to service_role;
grant execute on function public.approve_training_course_enrollment(uuid, uuid, boolean) to service_role;
grant execute on function public.complete_training_commerce_checkout(uuid, text, text) to service_role;
grant execute on function public.fail_training_commerce_checkout(uuid, text) to service_role;
grant execute on function public.reconcile_training_commerce_states() to service_role;
grant execute on function public.promote_training_course_waitlist(uuid) to service_role;
grant execute on function public.consume_training_pass_for_booking(uuid, uuid, uuid) to service_role;
grant execute on function public.reverse_training_pass_booking_usage(uuid) to service_role;
grant execute on function public.consume_training_pass_for_course_session(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.reverse_training_pass_session_usage(uuid, uuid) to service_role;
grant execute on function public.complete_training_commerce_refund(uuid, text) to service_role;
grant execute on function public.resolve_training_pass_request(uuid, uuid, boolean, text) to service_role;
