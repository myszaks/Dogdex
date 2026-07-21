-- Speedway classification fields are system-owned and cannot be removed or
-- changed into a different field type by the event/template editor.

update public.events as event
set form_fields = (
  select coalesce(jsonb_agg(
    case
      when field->>'id' like 'height_cm%' then
        (field - 'options') || jsonb_build_object(
          'label', 'Wzrost psa w kłębie (cm)',
          'type', 'number',
          'required', true,
          'placeholder', 'np. 45',
          'description', 'Klasa startowa zostanie przydzielona automatycznie: XS (<30cm), S (30–39.9cm), M (40–49.9cm), L (≥50cm). Charty trafiają do osobnej klasy.'
        )
      when field->>'id' like 'sport_class%'
        or field->>'id' like 'speedway_sport_class%'
        or field->>'id' like 'klasa_sport%' then
        (field - 'options' - 'placeholder') || jsonb_build_object(
          'label', 'Klasa sport',
          'type', 'checkbox',
          'required', false,
          'description', 'Dla psów będących w treningu sportowym'
        )
      else field
    end
    order by position
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(event.form_fields, '[]'::jsonb))
    with ordinality as item(field, position)
)
where event.event_type_id = 'speedway';

update public.events
set form_fields = form_fields || jsonb_build_array(jsonb_build_object(
  'id', 'height_cm',
  'label', 'Wzrost psa w kłębie (cm)',
  'type', 'number',
  'required', true,
  'placeholder', 'np. 45',
  'description', 'Klasa startowa zostanie przydzielona automatycznie: XS (<30cm), S (30–39.9cm), M (40–49.9cm), L (≥50cm). Charty trafiają do osobnej klasy.'
))
where event_type_id = 'speedway'
  and not exists (
    select 1 from jsonb_array_elements(form_fields) as field
    where field->>'id' like 'height_cm%'
  );

update public.events
set form_fields = form_fields || jsonb_build_array(jsonb_build_object(
  'id', 'sport_class',
  'label', 'Klasa sport',
  'type', 'checkbox',
  'required', false,
  'description', 'Dla psów będących w treningu sportowym'
))
where event_type_id = 'speedway'
  and not exists (
    select 1 from jsonb_array_elements(form_fields) as field
    where field->>'id' like 'sport_class%'
       or field->>'id' like 'speedway_sport_class%'
       or field->>'id' like 'klasa_sport%'
  );

update public.form_templates as template
set fields = (
  select coalesce(jsonb_agg(
    case
      when field->>'id' like 'height_cm%' then
        (field - 'options') || jsonb_build_object(
          'label', 'Wzrost psa w kłębie (cm)',
          'type', 'number',
          'required', true,
          'placeholder', 'np. 45',
          'description', 'Klasa startowa zostanie przydzielona automatycznie: XS (<30cm), S (30–39.9cm), M (40–49.9cm), L (≥50cm). Charty trafiają do osobnej klasy.'
        )
      when field->>'id' like 'sport_class%'
        or field->>'id' like 'speedway_sport_class%'
        or field->>'id' like 'klasa_sport%' then
        (field - 'options' - 'placeholder') || jsonb_build_object(
          'label', 'Klasa sport',
          'type', 'checkbox',
          'required', false,
          'description', 'Dla psów będących w treningu sportowym'
        )
      else field
    end
    order by position
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(template.fields, '[]'::jsonb))
    with ordinality as item(field, position)
)
where template.event_type_id = 'speedway';

update public.form_templates
set fields = fields || jsonb_build_array(jsonb_build_object(
  'id', 'height_cm',
  'label', 'Wzrost psa w kłębie (cm)',
  'type', 'number',
  'required', true,
  'placeholder', 'np. 45',
  'description', 'Klasa startowa zostanie przydzielona automatycznie: XS (<30cm), S (30–39.9cm), M (40–49.9cm), L (≥50cm). Charty trafiają do osobnej klasy.'
))
where event_type_id = 'speedway'
  and not exists (
    select 1 from jsonb_array_elements(fields) as field
    where field->>'id' like 'height_cm%'
  );

update public.form_templates
set fields = fields || jsonb_build_array(jsonb_build_object(
  'id', 'sport_class',
  'label', 'Klasa sport',
  'type', 'checkbox',
  'required', false,
  'description', 'Dla psów będących w treningu sportowym'
))
where event_type_id = 'speedway'
  and not exists (
    select 1 from jsonb_array_elements(fields) as field
    where field->>'id' like 'sport_class%'
       or field->>'id' like 'speedway_sport_class%'
       or field->>'id' like 'klasa_sport%'
  );
