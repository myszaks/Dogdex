-- Profiles use column-level UPDATE grants so authenticated users can edit only
-- safe account fields. Re-applying this grant is idempotent and changes no data.
grant update (full_name, company, event_creator_tutorial_seen_at)
  on table public.profiles
  to authenticated;
