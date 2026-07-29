-- Additive account preference used by the event creator onboarding.
-- Existing profiles remain unchanged (NULL means the tutorial has not been seen).
alter table public.profiles
  add column if not exists event_creator_tutorial_seen_at timestamptz;
