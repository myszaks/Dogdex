# Dogdex database schema

`schema.sql` is the generated, complete database snapshot for a **new Supabase
project**. It contains all numbered migrations in chronological order. Do not edit
it manually.

## Making a schema change

1. Add a timestamped migration to `supabase/migrations`, for example
   `20260725120000_add_feature.sql`.
2. Run `npm run schema:build`.
3. Commit both the new migration and the regenerated `supabase/schema.sql`.
4. Run `npm run schema:check` or the full `npm run ci`.

CI fails when the generated snapshot is not current.

## Applying the schema

- For a new Supabase project, apply `supabase/schema.sql` once.
- For an existing project, apply only the new incremental migrations. Never
  re-run the full snapshot over an existing database.
- Use either the full snapshot or the migration history when provisioning a new
  project, not both.

The snapshot expects the standard Supabase `auth`, `storage`, and `extensions`
schemas to exist. Legacy migration files without a 14-digit timestamp remain for
historical reference and are intentionally excluded from the generated snapshot.
