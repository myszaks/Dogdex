-- The production snapshot granted service_role only maintenance privileges on
-- dogs. Training booking hydration and deterministic dev seeding require the
-- server-side role to read and manage dog records.

grant all on table public.dogs to service_role;
