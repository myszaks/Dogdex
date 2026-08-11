-- Defense in depth for server-only RPCs. The service role already bypasses
-- RLS, so these functions do not need owner privileges to perform their work.
-- SECURITY INVOKER ensures an accidental future client grant cannot turn into
-- an RLS bypass.

alter function public.complete_training_checkout(uuid, text, text) security invoker;
alter function public.fail_training_checkout(uuid, text, text) security invoker;
alter function public.reconcile_training_booking_states() security invoker;
alter function public.claim_training_reminders(timestamptz, timestamptz, integer) security invoker;
alter function public.release_training_reminder_claim(uuid, timestamptz) security invoker;
alter function public.create_training_course_enrollment(uuid, uuid, uuid, text) security invoker;
alter function public.approve_training_course_enrollment(uuid, uuid, boolean) security invoker;
alter function public.complete_training_commerce_checkout(uuid, text, text) security invoker;
alter function public.fail_training_commerce_checkout(uuid, text) security invoker;
alter function public.reconcile_training_commerce_states() security invoker;
alter function public.promote_training_course_waitlist(uuid) security invoker;
alter function public.consume_training_pass_for_booking(uuid, uuid, uuid) security invoker;
alter function public.reverse_training_pass_booking_usage(uuid) security invoker;
alter function public.consume_training_pass_for_course_session(uuid, uuid, uuid, uuid) security invoker;
alter function public.reverse_training_pass_session_usage(uuid, uuid) security invoker;
alter function public.complete_training_commerce_refund(uuid, text) security invoker;
alter function public.resolve_training_pass_request(uuid, uuid, boolean, text) security invoker;

revoke all on function public.complete_training_checkout(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_training_checkout(uuid, text, text) from public, anon, authenticated;
revoke all on function public.reconcile_training_booking_states() from public, anon, authenticated;
revoke all on function public.claim_training_reminders(timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.release_training_reminder_claim(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.create_training_course_enrollment(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.approve_training_course_enrollment(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.complete_training_commerce_checkout(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_training_commerce_checkout(uuid, text) from public, anon, authenticated;
revoke all on function public.reconcile_training_commerce_states() from public, anon, authenticated;
revoke all on function public.promote_training_course_waitlist(uuid) from public, anon, authenticated;
revoke all on function public.consume_training_pass_for_booking(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.reverse_training_pass_booking_usage(uuid) from public, anon, authenticated;
revoke all on function public.consume_training_pass_for_course_session(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.reverse_training_pass_session_usage(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_training_commerce_refund(uuid, text) from public, anon, authenticated;
revoke all on function public.resolve_training_pass_request(uuid, uuid, boolean, text) from public, anon, authenticated;

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

-- Password-reset throttling is performed by the server route. Keeping this RPC
-- private prevents callers from reserving another user's cooldown without
-- actually sending a reset message.
alter function public.reserve_password_reset_link(text, integer) security invoker;
revoke all on function public.reserve_password_reset_link(text, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_password_reset_link(text, integer) to service_role;
