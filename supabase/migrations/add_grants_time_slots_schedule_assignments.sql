-- Grant missing permissions for time_slots and schedule_assignments tables
-- These tables were added via migration without GRANTs, causing permission denied errors
-- for authenticated role in schedule management routes.

-- service_role: full access (bypasses RLS — used server-side)
grant all on public.time_slots            to service_role;
grant all on public.schedule_assignments  to service_role;

-- authenticated: full DML (organizers manage slots/assignments)
grant select, insert, update, delete on public.time_slots            to authenticated;
grant select, insert, update, delete on public.schedule_assignments  to authenticated;

-- anon: read-only (public schedule view if needed)
grant select on public.time_slots           to anon;
grant select on public.schedule_assignments to anon;
