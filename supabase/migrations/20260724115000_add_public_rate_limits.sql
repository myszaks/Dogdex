create table if not exists public.public_rate_limits (
  scope text not null,
  identifier_hash text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0),
  primary key (scope, identifier_hash)
);

alter table public.public_rate_limits enable row level security;

revoke all on public.public_rate_limits from anon, authenticated;
grant all on public.public_rate_limits to service_role;

create or replace function public.consume_public_rate_limit(
  p_scope text,
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request_count integer;
begin
  if
    length(trim(coalesce(p_scope, ''))) = 0
    or length(trim(coalesce(p_identifier_hash, ''))) = 0
    or p_limit < 1
    or p_window_seconds < 1
  then
    raise exception 'invalid_rate_limit_parameters';
  end if;

  insert into public.public_rate_limits (
    scope,
    identifier_hash,
    window_started_at,
    request_count
  )
  values (
    p_scope,
    p_identifier_hash,
    now(),
    1
  )
  on conflict (scope, identifier_hash) do update
    set
      window_started_at = case
        when public.public_rate_limits.window_started_at
          <= now() - make_interval(secs => p_window_seconds)
        then now()
        else public.public_rate_limits.window_started_at
      end,
      request_count = case
        when public.public_rate_limits.window_started_at
          <= now() - make_interval(secs => p_window_seconds)
        then 1
        else public.public_rate_limits.request_count + 1
      end
  returning request_count into v_request_count;

  return v_request_count <= p_limit;
end;
$$;

revoke all on function public.consume_public_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, text, integer, integer)
  to service_role;
