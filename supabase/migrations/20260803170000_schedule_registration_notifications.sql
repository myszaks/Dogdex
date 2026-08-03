-- Run registration-opening notifications every five minutes from Supabase.
-- The target URL and bearer token are read at runtime from Supabase Vault, so
-- no environment-specific values or credentials are stored in migrations.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_event_registration_notifications()
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  site_url text;
  cron_secret text;
  request_id bigint;
begin
  select decrypted_secret
  into site_url
  from vault.decrypted_secrets
  where name = 'dogdex_site_url';

  select decrypted_secret
  into cron_secret
  from vault.decrypted_secrets
  where name = 'dogdex_cron_secret';

  if nullif(trim(site_url), '') is null or nullif(trim(cron_secret), '') is null then
    raise warning 'Dogdex registration notification cron is not configured. Add dogdex_site_url and dogdex_cron_secret to Supabase Vault.';
    return null;
  end if;

  if trim(site_url) !~ '^https://[^/]+' then
    raise warning 'dogdex_site_url must be an HTTPS URL.';
    return null;
  end if;

  select net.http_post(
    url := rtrim(trim(site_url), '/') || '/api/event-registration-notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('triggered_at', now()),
    timeout_milliseconds := 10000
  )
  into request_id;

  return request_id;
end;
$function$;

revoke all on function public.invoke_event_registration_notifications() from public;
revoke all on function public.invoke_event_registration_notifications() from anon;
revoke all on function public.invoke_event_registration_notifications() from authenticated;

select cron.schedule(
  'event-registration-notifications-every-5-minutes',
  '*/5 * * * *',
  $cron$select public.invoke_event_registration_notifications();$cron$
);
