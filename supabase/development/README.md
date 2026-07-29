# Development database bootstrap

These files reproduce the database state used by the current Dogdex branch
without copying production data.

## Fresh Supabase development project

Run the files in this exact order in the Supabase SQL Editor:

1. `01_production_schema.sql`
2. `02_production_to_branch.sql`

The first file recreates the verified production schema. The second file is one
transaction containing every schema change present in the branch but absent
from production.

The upgrade includes:

- password-reset throttling,
- multi-registration schedule access,
- the complete trainer and training-booking schema,
- required event, dog, trainer, and training-type slugs,
- role-upgrade requests and organizer/trainer permissions,
- draft events and the training-booking dog relation,
- event, registration, training, and storage security hardening,
- Stripe profile identifiers and training-payment notification state,
- public endpoint rate limits,
- the configurable competition engine, result storage, and live state,
- the event-creator tutorial preference.

Do not additionally apply `supabase/schema.sql` or the individual files from
`supabase/migrations` to the same database. They contain the same changes.

The files are schema-only. They do not copy users, registrations, dogs, events,
storage objects, secrets, or any other production records.

## Regeneration and verification

```bash
npm run db:dev:build
npm run db:dev:check
```

The source of truth remains `supabase/migrations`. Generated SQL files must not
be edited manually.

The production snapshot was verified on 2026-07-29 against the production
project. Before using these files after another production database deployment,
update the production baseline and regenerate the artifacts.
