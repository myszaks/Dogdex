-- Link existing participant records to auth users where possible and make
-- schedule assignment reads explicit under RLS.

update public.participants p
set user_id = u.id
from auth.users u
where p.user_id is null
  and p.owner_email is not null
  and lower(p.owner_email) = lower(u.email);

create index if not exists idx_participants_user_id
  on public.participants(user_id);

create index if not exists idx_participants_dog_id
  on public.participants(dog_id);

create index if not exists idx_participants_owner_email_lower
  on public.participants(lower(owner_email));

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'schedule_assignments'
      and policyname = 'schedule_assignments_public_read'
  ) then
    create policy "schedule_assignments_public_read" on public.schedule_assignments
      for select using (true);
  end if;
end $$;
