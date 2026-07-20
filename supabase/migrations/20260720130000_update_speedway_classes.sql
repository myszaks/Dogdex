-- Speedway classes:
-- - XL is merged into L
-- - every Speedway event/template receives the Sport checkbox

update public.results
set size_class = 'L'
where upper(trim(size_class)) = 'XL';

-- Reclassify already stored results using the registration breed snapshot
-- and the current dog profile breed.
with participant_breeds as (
  select
    participants.id,
    translate(
      lower(
        coalesce(participants.dog_breed, '') || ' ' ||
        coalesce(dogs.breed, '')
      ),
      'ąćęłńóśźż',
      'acelnoszz'
    ) as breed
  from public.participants
  left join public.dogs on dogs.id = participants.dog_id
)
update public.results
set size_class = 'CHART'
from participant_breeds
where results.participant_id = participant_breeds.id
  and (
    participant_breeds.breed like '%chart%'
    or participant_breeds.breed like '%sighthound%'
    or participant_breeds.breed like '%afghan hound%'
    or participant_breeds.breed like '%saluki%'
    or participant_breeds.breed like '%borzoi%'
    or participant_breeds.breed like '%borzoj%'
    or participant_breeds.breed like '%russkaya psovaya borzaya%'
    or participant_breeds.breed like '%deerhound%'
    or participant_breeds.breed like '%irish wolfhound%'
    or participant_breeds.breed like '%wilczarz irlandzki%'
    or participant_breeds.breed like '%greyhound%'
    or participant_breeds.breed like '%whippet%'
    or participant_breeds.breed like '%magyar agar%'
    or participant_breeds.breed like '%charcik wloski%'
    or participant_breeds.breed like '%piccolo levriero italiano%'
    or participant_breeds.breed like '%azawakh%'
    or participant_breeds.breed like '%sloughi%'
    or participant_breeds.breed like '%galgo%'
    or participant_breeds.breed like '%kazakh tazy%'
    or participant_breeds.breed like '%tazy%'
  );

-- Sport has the highest priority, including for any pre-existing custom field.
with sport_registrations as (
  select registrations.event_id, registrations.participant_id
  from public.registrations
  where exists (
    select 1
    from jsonb_each_text(coalesce(registrations.form_data, '{}'::jsonb)) as field
    where (
      field.key like 'sport_class%'
      or field.key like 'speedway_sport_class%'
      or field.key like 'klasa_sport%'
    )
      and lower(field.value) in ('true', '1', 'yes', 'tak', 'on', 'sport')
  )
  or exists (
    select 1
    from jsonb_each_text(coalesce(registrations.form_data, '{}'::jsonb)) as field
    where upper(field.value) = 'SPORT'
  )
)
update public.results
set size_class = 'SPORT'
from sport_registrations
where results.event_id = sport_registrations.event_id
  and results.participant_id = sport_registrations.participant_id;

update public.events
set form_fields = coalesce(form_fields, '[]'::jsonb) || jsonb_build_array(
  jsonb_build_object(
    'id', 'sport_class',
    'label', 'Klasa sport',
    'type', 'checkbox',
    'required', false,
    'description', 'Dla psów będących w treningu sportowym'
  )
)
where event_type_id = 'speedway'
  and not exists (
    select 1
    from jsonb_array_elements(coalesce(form_fields, '[]'::jsonb)) as field
    where field->>'id' like 'sport_class%'
       or field->>'id' like 'speedway_sport_class%'
       or field->>'id' like 'klasa_sport%'
  );

update public.form_templates
set fields = coalesce(fields, '[]'::jsonb) || jsonb_build_array(
  jsonb_build_object(
    'id', 'sport_class',
    'label', 'Klasa sport',
    'type', 'checkbox',
    'required', false,
    'description', 'Dla psów będących w treningu sportowym'
  )
)
where event_type_id = 'speedway'
  and not exists (
    select 1
    from jsonb_array_elements(coalesce(fields, '[]'::jsonb)) as field
    where field->>'id' like 'sport_class%'
       or field->>'id' like 'speedway_sport_class%'
       or field->>'id' like 'klasa_sport%'
  );
