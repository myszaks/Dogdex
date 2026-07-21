-- Server-rendered Speedway views need dog height and breed to calculate the
-- start class. service_role bypasses RLS, but it still needs table privileges.
grant select on table public.dogs to service_role;
