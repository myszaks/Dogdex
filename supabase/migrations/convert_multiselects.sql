-- Convert top-level string form_data values containing commas into JSON arrays
-- Run in Supabase SQL editor if you want to migrate existing registrations.

UPDATE registrations
SET form_data = (
  SELECT jsonb_object_agg(k, CASE
    WHEN jsonb_typeof(v) = 'string' AND (v::text LIKE '%\,%') THEN to_jsonb(string_to_array(trim(both '"' from v::text), ','))
    ELSE v
  END)
  FROM jsonb_each(form_data) AS e(k, v)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_each(form_data) AS e(k, v) WHERE jsonb_typeof(v) = 'string' AND (v::text LIKE '%\,%')
);
