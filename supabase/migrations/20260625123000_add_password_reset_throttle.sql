-- Rate limit password reset emails to 1 request per 5 minutes per email address.

create table if not exists password_reset_requests (
  email         text primary key,
  last_sent_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function reserve_password_reset_link(
  p_email text,
  p_cooldown_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(coalesce(p_email, '')));
  cooldown interval := make_interval(secs => greatest(1, coalesce(p_cooldown_seconds, 300)));
  last_sent timestamptz;
begin
  if normalized_email = '' then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', 0);
  end if;

  insert into password_reset_requests (email, last_sent_at, created_at, updated_at)
  values (normalized_email, now(), now(), now())
  on conflict (email) do update
    set last_sent_at = excluded.last_sent_at,
        updated_at = excluded.updated_at
    where password_reset_requests.last_sent_at <= now() - cooldown
  returning last_sent_at into last_sent;

  if found then
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  select last_sent_at into last_sent
  from password_reset_requests
  where email = normalized_email;

  return jsonb_build_object(
    'allowed', false,
    'retry_after_seconds', greatest(
      1,
      ceil(extract(epoch from (cooldown - (now() - last_sent))))::int
    )
  );
end;
$$;

grant all on public.password_reset_requests to service_role;
