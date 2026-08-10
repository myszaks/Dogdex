-- Event Day 2.0: QR check-in, offline idempotency, audit trail and timing imports.

alter table public.registrations
  add column if not exists checkin_token uuid not null default gen_random_uuid();

create unique index if not exists registrations_checkin_token_key
  on public.registrations(checkin_token);

create table if not exists public.event_checkin_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  operator_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('checked_in', 'checked_out')),
  source text not null default 'manual' check (source in ('manual', 'qr', 'offline', 'bulk')),
  client_mutation_id uuid,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists event_checkin_log_client_mutation_key
  on public.event_checkin_log(client_mutation_id)
  where client_mutation_id is not null;
create index if not exists idx_event_checkin_log_event_time
  on public.event_checkin_log(event_id, occurred_at desc);

create table if not exists public.event_start_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  channel text not null default 'email' check (channel in ('email')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_by uuid references auth.users(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_event_start_notifications_event
  on public.event_start_notifications(event_id, created_at desc);

create table if not exists public.event_timing_imports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  imported_by uuid references auth.users(id) on delete set null,
  source_name text not null,
  rows_total integer not null default 0 check (rows_total >= 0),
  rows_imported integer not null default 0 check (rows_imported >= 0),
  rows_rejected integer not null default 0 check (rows_rejected >= 0),
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  created_at timestamptz not null default now()
);

alter table public.event_checkin_log enable row level security;
alter table public.event_start_notifications enable row level security;
alter table public.event_timing_imports enable row level security;

create policy "event_checkin_log_team_read" on public.event_checkin_log
  for select to authenticated using (public.event_team_has_permission(event_id, 'checkin'));
create policy "event_start_notifications_team_read" on public.event_start_notifications
  for select to authenticated using (public.event_team_has_permission(event_id, 'checkin'));
create policy "event_timing_imports_team_read" on public.event_timing_imports
  for select to authenticated using (public.event_team_has_permission(event_id, 'results'));

grant select on public.event_checkin_log, public.event_start_notifications, public.event_timing_imports to authenticated;
grant all on public.event_checkin_log, public.event_start_notifications, public.event_timing_imports to service_role;
