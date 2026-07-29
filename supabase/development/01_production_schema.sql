-- AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
--
-- Schema-only snapshot of the Dogdex production database.
-- Verified against production PostgREST metadata on 2026-07-29.
-- Apply only to a fresh Supabase project.
--
-- Source: supabase/migrations/20260611083507_from_main.sql
-- Storage configuration source: supabase/production/storage_buckets.sql




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'user',
    coalesce(new.raw_user_meta_data->>'full_name', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'user'
  )
$$;


ALTER FUNCTION "public"."user_role"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."cancellation_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "registration_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "cancelled_dates" "text"[],
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_by" "uuid",
    "processed_at" timestamp with time zone,
    "processed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cancellation_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."cancellation_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dogs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "breed" "text",
    "gender" "text",
    "pedigree_or_chip" "text",
    "coat_color" "text",
    "weight_kg" numeric(5,2),
    "height_cm" numeric(5,1),
    "agility_level" "text",
    "photo_url" "text",
    "rabies_vaccine_expiry" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slug" "text",
    CONSTRAINT "dogs_agility_level_check" CHECK (("agility_level" = ANY (ARRAY['none'::"text", 'beginner'::"text", 'intermediate'::"text", 'advanced'::"text", 'competition'::"text"]))),
    CONSTRAINT "dogs_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text"])))
);


ALTER TABLE "public"."dogs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "start_at" timestamp with time zone,
    "end_at" timestamp with time zone,
    "location" "text",
    "created_by" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_type_id" "text",
    "form_fields" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "registration_deadline" timestamp with time zone,
    "has_results" boolean DEFAULT false NOT NULL,
    "results_public" boolean DEFAULT true NOT NULL,
    "auto_confirm" boolean DEFAULT false NOT NULL,
    "max_participants" integer,
    "organizer_name" "text",
    "slug" "text",
    "lat" double precision,
    "lng" double precision,
    "gallery_images" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "grouping_field" "text",
    "last_significant_change" timestamp with time zone,
    "changed_fields" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "current_start_index" integer DEFAULT 0 NOT NULL,
    "track_distance_m" numeric(6,2),
    "live_phase" "text",
    "has_schedule" boolean DEFAULT false NOT NULL,
    "entry_fee" numeric(10,2) DEFAULT NULL::numeric,
    "form_template_id" "uuid",
    CONSTRAINT "events_status_check" CHECK (("status" = ANY (ARRAY['upcoming'::"text", 'ongoing'::"text", 'finished'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."form_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "event_type_id" "text",
    "created_by" "uuid",
    "fields" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."form_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."heats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "name" "text",
    "start_time" timestamp with time zone,
    "order_index" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."heats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "dog_name" "text",
    "dog_breed" "text",
    "owner_name" "text",
    "owner_email" "text",
    "extra" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "dog_id" "uuid"
);


ALTER TABLE "public"."participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "company" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "form_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "order_index" integer,
    "time_slot_id" "uuid",
    "schedule_sent_at" timestamp with time zone,
    "checked_in" boolean DEFAULT false,
    "checked_in_at" timestamp with time zone,
    "reminder_sent_at" "jsonb",
    CONSTRAINT "registrations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "heat_id" "uuid",
    "event_id" "uuid",
    "participant_id" "uuid" NOT NULL,
    "time_ms" integer,
    "rank" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "run1_ms" integer,
    "run2_ms" integer,
    "best_ms" integer,
    "speed_kmh" numeric(5,2),
    "size_class" "text",
    "class_rank" integer,
    "run1_status" "text",
    "run2_status" "text",
    CONSTRAINT "results_run1_status_check" CHECK (("run1_status" = ANY (ARRAY['DNS'::"text", 'DNF'::"text"]))),
    CONSTRAINT "results_run2_status_check" CHECK (("run2_status" = ANY (ARRAY['DNS'::"text", 'DNF'::"text"])))
);


ALTER TABLE "public"."results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "registration_id" "uuid" NOT NULL,
    "time_slot_id" "uuid" NOT NULL,
    "item_date" "text" DEFAULT ''::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."schedule_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."time_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "slot_date" "date" NOT NULL,
    "slot_time" time without time zone NOT NULL,
    "label" "text",
    "max_participants" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."time_slots" OWNER TO "postgres";


ALTER TABLE ONLY "public"."cancellation_requests"
    ADD CONSTRAINT "cancellation_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dogs"
    ADD CONSTRAINT "dogs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."form_templates"
    ADD CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."heats"
    ADD CONSTRAINT "heats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_assignments"
    ADD CONSTRAINT "schedule_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_assignments"
    ADD CONSTRAINT "schedule_assignments_registration_id_item_date_key" UNIQUE ("registration_id", "item_date");



ALTER TABLE ONLY "public"."time_slots"
    ADD CONSTRAINT "time_slots_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "dogs_user_slug_unique" ON "public"."dogs" USING "btree" ("user_id", "slug") WHERE ("slug" IS NOT NULL);



CREATE UNIQUE INDEX "events_slug_key" ON "public"."events" USING "btree" ("slug") WHERE ("slug" IS NOT NULL);



CREATE INDEX "idx_cancellation_requests_event_id" ON "public"."cancellation_requests" USING "btree" ("event_id");



CREATE INDEX "idx_cancellation_requests_registration_id" ON "public"."cancellation_requests" USING "btree" ("registration_id");



CREATE INDEX "idx_cancellation_requests_status" ON "public"."cancellation_requests" USING "btree" ("status");



CREATE INDEX "idx_dogs_user_id" ON "public"."dogs" USING "btree" ("user_id");



CREATE INDEX "idx_events_start_at" ON "public"."events" USING "btree" ("start_at");



CREATE INDEX "idx_events_status" ON "public"."events" USING "btree" ("status");



CREATE INDEX "idx_form_templates_created_by" ON "public"."form_templates" USING "btree" ("created_by");



CREATE INDEX "idx_form_templates_event_type_id" ON "public"."form_templates" USING "btree" ("event_type_id");



CREATE INDEX "idx_registrations_event_id" ON "public"."registrations" USING "btree" ("event_id");



CREATE INDEX "idx_registrations_order_index" ON "public"."registrations" USING "btree" ("event_id", "order_index");



CREATE INDEX "idx_registrations_participant_id" ON "public"."registrations" USING "btree" ("participant_id");



CREATE INDEX "idx_registrations_time_slot_id" ON "public"."registrations" USING "btree" ("time_slot_id");



CREATE INDEX "idx_results_event_id" ON "public"."results" USING "btree" ("event_id");



CREATE INDEX "idx_results_rank" ON "public"."results" USING "btree" ("rank");



CREATE INDEX "idx_results_size_class" ON "public"."results" USING "btree" ("event_id", "size_class", "best_ms");



CREATE INDEX "idx_sa_registration" ON "public"."schedule_assignments" USING "btree" ("registration_id");



CREATE INDEX "idx_sa_slot" ON "public"."schedule_assignments" USING "btree" ("time_slot_id");



CREATE INDEX "idx_time_slots_event_id" ON "public"."time_slots" USING "btree" ("event_id");



CREATE INDEX "registrations_reminder_sent_at_idx" ON "public"."registrations" USING "btree" ("event_id") WHERE (("reminder_sent_at" IS NULL) AND ("status" = 'confirmed'::"text"));



CREATE OR REPLACE TRIGGER "dogs_updated_at" BEFORE UPDATE ON "public"."dogs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."cancellation_requests"
    ADD CONSTRAINT "cancellation_requests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cancellation_requests"
    ADD CONSTRAINT "cancellation_requests_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cancellation_requests"
    ADD CONSTRAINT "cancellation_requests_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cancellation_requests"
    ADD CONSTRAINT "cancellation_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dogs"
    ADD CONSTRAINT "dogs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_form_template_id_fkey" FOREIGN KEY ("form_template_id") REFERENCES "public"."form_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."form_templates"
    ADD CONSTRAINT "form_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."heats"
    ADD CONSTRAINT "heats_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_time_slot_id_fkey" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_heat_id_fkey" FOREIGN KEY ("heat_id") REFERENCES "public"."heats"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_assignments"
    ADD CONSTRAINT "schedule_assignments_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_assignments"
    ADD CONSTRAINT "schedule_assignments_time_slot_id_fkey" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_slots"
    ADD CONSTRAINT "time_slots_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



CREATE POLICY "Users can delete own dogs" ON "public"."dogs" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own dogs" ON "public"."dogs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own dogs" ON "public"."dogs" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own dogs" ON "public"."dogs" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."cancellation_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cancellation_requests_authenticated_insert" ON "public"."cancellation_requests" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "cancellation_requests_organizer_update" ON "public"."cancellation_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['organizer'::"text", 'admin'::"text"]))))));



CREATE POLICY "cancellation_requests_read" ON "public"."cancellation_requests" FOR SELECT USING ((("requested_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "cancellation_requests"."event_id") AND ("events"."created_by" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



ALTER TABLE "public"."dogs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events_organizer_delete" ON "public"."events" FOR DELETE USING (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "events_organizer_insert" ON "public"."events" FOR INSERT WITH CHECK (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "events_organizer_update" ON "public"."events" FOR UPDATE USING (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "events_public_read" ON "public"."events" FOR SELECT USING (true);



ALTER TABLE "public"."form_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."heats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "heats_organizer_delete" ON "public"."heats" FOR DELETE USING (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "heats_organizer_insert" ON "public"."heats" FOR INSERT WITH CHECK (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "heats_organizer_update" ON "public"."heats" FOR UPDATE USING (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "heats_public_read" ON "public"."heats" FOR SELECT USING (true);



ALTER TABLE "public"."participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "participants_organizer_delete" ON "public"."participants" FOR DELETE USING (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "participants_organizer_update" ON "public"."participants" FOR UPDATE USING (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "participants_public_insert" ON "public"."participants" FOR INSERT WITH CHECK (true);



CREATE POLICY "participants_public_read" ON "public"."participants" FOR SELECT USING (true);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_trigger_only" ON "public"."profiles" FOR INSERT WITH CHECK (false);



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK ((("auth"."uid"() = "id") AND ("role" = ( SELECT "profiles_1"."role"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())))));



ALTER TABLE "public"."registrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "registrations_organizer_delete" ON "public"."registrations" FOR DELETE USING (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "registrations_organizer_update" ON "public"."registrations" FOR UPDATE USING (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "registrations_public_insert" ON "public"."registrations" FOR INSERT WITH CHECK (true);



CREATE POLICY "registrations_public_read" ON "public"."registrations" FOR SELECT USING (true);



ALTER TABLE "public"."results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "results_organizer_delete" ON "public"."results" FOR DELETE USING (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "results_organizer_insert" ON "public"."results" FOR INSERT WITH CHECK (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "results_organizer_update" ON "public"."results" FOR UPDATE USING (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "results_public_read" ON "public"."results" FOR SELECT USING (true);



ALTER TABLE "public"."schedule_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "templates_delete_own" ON "public"."form_templates" FOR DELETE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "templates_insert_own" ON "public"."form_templates" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "templates_select_own" ON "public"."form_templates" FOR SELECT USING (("auth"."uid"() = "created_by"));



CREATE POLICY "templates_update_own" ON "public"."form_templates" FOR UPDATE USING (("auth"."uid"() = "created_by"));



ALTER TABLE "public"."time_slots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "time_slots_organizer_delete" ON "public"."time_slots" FOR DELETE USING (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "time_slots_organizer_insert" ON "public"."time_slots" FOR INSERT WITH CHECK (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "time_slots_organizer_update" ON "public"."time_slots" FOR UPDATE USING (("public"."user_role"() = ANY (ARRAY['organizer'::"text", 'admin'::"text"])));



CREATE POLICY "time_slots_public_read" ON "public"."time_slots" FOR SELECT USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."events";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."results";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "service_role";


















GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cancellation_requests" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."cancellation_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."cancellation_requests" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."dogs" TO "anon";
GRANT ALL ON TABLE "public"."dogs" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."dogs" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."form_templates" TO "anon";
GRANT ALL ON TABLE "public"."form_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."form_templates" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."heats" TO "anon";
GRANT ALL ON TABLE "public"."heats" TO "authenticated";
GRANT ALL ON TABLE "public"."heats" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."participants" TO "anon";
GRANT ALL ON TABLE "public"."participants" TO "authenticated";
GRANT ALL ON TABLE "public"."participants" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT UPDATE("full_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("company") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."registrations" TO "anon";
GRANT ALL ON TABLE "public"."registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."registrations" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."results" TO "anon";
GRANT ALL ON TABLE "public"."results" TO "authenticated";
GRANT ALL ON TABLE "public"."results" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."schedule_assignments" TO "anon";
GRANT ALL ON TABLE "public"."schedule_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_assignments" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."time_slots" TO "anon";
GRANT ALL ON TABLE "public"."time_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."time_slots" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";



































drop extension if exists "pg_net";

revoke delete on table "public"."cancellation_requests" from "anon";

revoke insert on table "public"."cancellation_requests" from "anon";

revoke update on table "public"."cancellation_requests" from "anon";

revoke delete on table "public"."cancellation_requests" from "authenticated";

revoke delete on table "public"."dogs" from "anon";

revoke insert on table "public"."dogs" from "anon";

revoke update on table "public"."dogs" from "anon";

revoke delete on table "public"."dogs" from "service_role";

revoke insert on table "public"."dogs" from "service_role";

revoke select on table "public"."dogs" from "service_role";

revoke update on table "public"."dogs" from "service_role";

revoke delete on table "public"."events" from "anon";

revoke insert on table "public"."events" from "anon";

revoke update on table "public"."events" from "anon";

revoke delete on table "public"."form_templates" from "anon";

revoke insert on table "public"."form_templates" from "anon";

revoke select on table "public"."form_templates" from "anon";

revoke update on table "public"."form_templates" from "anon";

revoke delete on table "public"."heats" from "anon";

revoke insert on table "public"."heats" from "anon";

revoke update on table "public"."heats" from "anon";

revoke delete on table "public"."participants" from "anon";

revoke insert on table "public"."participants" from "anon";

revoke update on table "public"."participants" from "anon";

revoke delete on table "public"."profiles" from "anon";

revoke insert on table "public"."profiles" from "anon";

revoke select on table "public"."profiles" from "anon";

revoke update on table "public"."profiles" from "anon";

revoke delete on table "public"."profiles" from "authenticated";

revoke insert on table "public"."profiles" from "authenticated";

revoke update on table "public"."profiles" from "authenticated";

revoke delete on table "public"."registrations" from "anon";

revoke insert on table "public"."registrations" from "anon";

revoke update on table "public"."registrations" from "anon";

revoke delete on table "public"."results" from "anon";

revoke insert on table "public"."results" from "anon";

revoke update on table "public"."results" from "anon";

revoke delete on table "public"."schedule_assignments" from "anon";

revoke insert on table "public"."schedule_assignments" from "anon";

revoke update on table "public"."schedule_assignments" from "anon";

revoke delete on table "public"."time_slots" from "anon";

revoke insert on table "public"."time_slots" from "anon";

revoke update on table "public"."time_slots" from "anon";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "Dog photo delete own folder"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'dog-photos'::text) AND ((auth.uid())::text = (string_to_array(name, '/'::text))[1])));



  create policy "Dog photo public read"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'dog-photos'::text));



  create policy "Dog photo upload own folder"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'dog-photos'::text) AND ((auth.uid())::text = (string_to_array(name, '/'::text))[1])));



  create policy "event_thumbnails_auth_delete"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'event-thumbnails'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "event_thumbnails_auth_insert"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'event-thumbnails'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "event_thumbnails_public_read"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'event-thumbnails'::text));

-- ============================================================================
-- Production Storage bucket configuration
-- ============================================================================

-- Storage buckets are configuration rows and are therefore not included in a
-- schema-only pg_dump. Keep them with the production snapshot explicitly.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'dog-photos',
  'dog-photos',
  true,
  null,
  null
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'event-thumbnails',
  'event-thumbnails',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
