alter table public.profiles
  add column if not exists stripe_account_id text;

alter table public.profiles
  add column if not exists stripe_onboarded boolean not null default false;
