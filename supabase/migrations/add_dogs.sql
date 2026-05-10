-- ============================================================
-- Dogs: profile psów przypisane do użytkowników
-- ============================================================

create table if not exists dogs (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  name                  text not null,
  breed                 text,
  gender                text check (gender in ('male', 'female')),
  pedigree_or_chip      text,
  coat_color            text,
  weight_kg             numeric(5,2),
  height_cm             numeric(5,1),
  agility_level         text check (agility_level in ('none', 'beginner', 'intermediate', 'advanced', 'competition')),
  photo_url             text,
  rabies_vaccine_expiry date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Indeks do szybkiego pobierania psów użytkownika
create index if not exists idx_dogs_user_id on dogs(user_id);

-- Powiązanie participants z dogs (opcjonalne – przy zapisie z profilem psa)
alter table participants add column if not exists dog_id uuid references dogs(id) on delete set null;

-- Trigger: auto-update updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger dogs_updated_at
  before update on dogs
  for each row execute function update_updated_at_column();

-- RLS: użytkownik widzi/edytuje tylko swoje psy
alter table dogs enable row level security;

create policy "Users can view own dogs"
  on dogs for select using (auth.uid() = user_id);

create policy "Users can insert own dogs"
  on dogs for insert with check (auth.uid() = user_id);

create policy "Users can update own dogs"
  on dogs for update using (auth.uid() = user_id);

create policy "Users can delete own dogs"
  on dogs for delete using (auth.uid() = user_id);

-- Storage bucket na zdjęcia psów (uruchom raz)
-- insert into storage.buckets (id, name, public) values ('dog-photos', 'dog-photos', true)
-- on conflict do nothing;
