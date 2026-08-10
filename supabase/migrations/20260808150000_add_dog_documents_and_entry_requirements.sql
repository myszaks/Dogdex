-- Sports passport foundations and automatic event eligibility checks.

alter table public.dogs
  add column if not exists birth_date date;

alter table public.events
  add column if not exists entry_requirements jsonb not null default '{
    "minAgeMonths": null,
    "maxAgeMonths": null,
    "minHeightCm": null,
    "maxHeightCm": null,
    "allowedGenders": [],
    "documents": []
  }'::jsonb;

alter table public.events
  drop constraint if exists events_entry_requirements_object;
alter table public.events
  add constraint events_entry_requirements_object
  check (jsonb_typeof(entry_requirements) = 'object');

create table if not exists public.dog_documents (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in (
    'rabies_vaccination',
    'pedigree',
    'sport_license',
    'qualification',
    'health_certificate',
    'insurance',
    'other'
  )),
  label text not null check (char_length(label) between 1 and 120),
  document_number text check (document_number is null or char_length(document_number) <= 120),
  issuer text check (issuer is null or char_length(issuer) <= 160),
  issued_at date,
  expires_at date,
  storage_path text,
  file_name text,
  file_type text,
  file_size integer check (file_size is null or file_size between 0 and 5242880),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dog_documents_dates_valid check (
    issued_at is null or expires_at is null or expires_at >= issued_at
  )
);

create index if not exists idx_dog_documents_dog_type
  on public.dog_documents(dog_id, type);
create index if not exists idx_dog_documents_owner_expiry
  on public.dog_documents(owner_id, expires_at);

drop trigger if exists dog_documents_updated_at on public.dog_documents;
create trigger dog_documents_updated_at
  before update on public.dog_documents
  for each row execute function public.update_updated_at_column();

alter table public.dog_documents enable row level security;

drop policy if exists "dog_documents_owner_read" on public.dog_documents;
create policy "dog_documents_owner_read"
  on public.dog_documents for select to authenticated
  using (owner_id = auth.uid() or public.user_role() = 'admin');

drop policy if exists "dog_documents_owner_insert" on public.dog_documents;
create policy "dog_documents_owner_insert"
  on public.dog_documents for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.dogs dog
      where dog.id = dog_documents.dog_id and dog.user_id = auth.uid()
    )
  );

drop policy if exists "dog_documents_owner_update" on public.dog_documents;
create policy "dog_documents_owner_update"
  on public.dog_documents for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.dogs dog
      where dog.id = dog_documents.dog_id and dog.user_id = auth.uid()
    )
  );

drop policy if exists "dog_documents_owner_delete" on public.dog_documents;
create policy "dog_documents_owner_delete"
  on public.dog_documents for delete to authenticated
  using (owner_id = auth.uid());

grant select, insert, update, delete on public.dog_documents to authenticated;
grant all on public.dog_documents to service_role;

-- Preserve the vaccination dates already collected in dog profiles as
-- metadata-only documents. Owners can attach a scan later.
insert into public.dog_documents (
  dog_id,
  owner_id,
  type,
  label,
  expires_at
)
select
  dog.id,
  dog.user_id,
  'rabies_vaccination',
  'Szczepienie przeciw wściekliźnie',
  dog.rabies_vaccine_expiry
from public.dogs dog
where dog.rabies_vaccine_expiry is not null
  and not exists (
    select 1 from public.dog_documents document
    where document.dog_id = dog.id and document.type = 'rabies_vaccination'
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'dog-documents',
  'dog-documents',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dog_documents_storage_owner_read" on storage.objects;
create policy "dog_documents_storage_owner_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dog-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.user_role() = 'admin')
  );

drop policy if exists "dog_documents_storage_owner_insert" on storage.objects;
create policy "dog_documents_storage_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dog-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "dog_documents_storage_owner_delete" on storage.objects;
create policy "dog_documents_storage_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'dog-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.user_role() = 'admin')
  );
