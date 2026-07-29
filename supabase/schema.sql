-- AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
--
-- Complete Supabase schema for provisioning a fresh Dogdex environment.
-- It is assembled, in order, from every numbered file in supabase/migrations.
--
-- Regenerate after adding or changing a migration:
--   npm run schema:build
--
-- Existing environments must receive only new incremental migrations.
-- Do not re-run this full snapshot against an already provisioned database.

-- ============================================================================
-- Source migration: 20260611083507_from_main.sql
-- ============================================================================




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
-- Source migration: 20260625123000_add_password_reset_throttle.sql
-- ============================================================================

-- Rate limit password reset emails to 1 request per 5 minutes per email address.

create table if not exists password_reset_requests (
  email         text primary key,
  last_sent_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function reserve_password_reset_link(
  p_email text,
  p_cooldown_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(coalesce(p_email, '')));
  cooldown interval := make_interval(secs => greatest(1, coalesce(p_cooldown_seconds, 300)));
  last_sent timestamptz;
begin
  if normalized_email = '' then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', 0);
  end if;

  insert into password_reset_requests (email, last_sent_at, created_at, updated_at)
  values (normalized_email, now(), now(), now())
  on conflict (email) do update
    set last_sent_at = excluded.last_sent_at,
        updated_at = excluded.updated_at
    where password_reset_requests.last_sent_at <= now() - cooldown
  returning last_sent_at into last_sent;

  if found then
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  select last_sent_at into last_sent
  from password_reset_requests
  where email = normalized_email;

  return jsonb_build_object(
    'allowed', false,
    'retry_after_seconds', greatest(
      1,
      ceil(extract(epoch from (cooldown - (now() - last_sent))))::int
    )
  );
end;
$$;

grant all on public.password_reset_requests to service_role;

-- ============================================================================
-- Source migration: 20260627120000_require_slugs.sql
-- ============================================================================

-- Require slugs for public-facing resources.
-- UUIDs stay as relational identifiers; routes should use slug values.

create extension if not exists unaccent;

create or replace function public._dogdex_slugify(input text, fallback text default 'item')
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      substr(
        trim(both '-' from regexp_replace(
          regexp_replace(
            regexp_replace(lower(unaccent(coalesce(input, ''))), '[^a-z0-9\s-]', '', 'g'),
            '\s+', '-', 'g'
          ),
          '-+', '-', 'g'
        )),
        1,
        80
      ),
      ''
    ),
    fallback
  );
$$;

alter table events add column if not exists slug text;

do $$
declare
  rec record;
  base text;
  candidate text;
  i int;
begin
  for rec in
    select id, title
    from events
    where slug is null or btrim(slug) = ''
    order by created_at, id
  loop
    base := public._dogdex_slugify(rec.title, 'event');
    candidate := base;
    i := 2;

    while exists (select 1 from events where slug = candidate and id <> rec.id) loop
      candidate := base || '-' || i;
      i := i + 1;
    end loop;

    update events set slug = candidate where id = rec.id;
  end loop;
end $$;

drop index if exists events_slug_key;
alter table events alter column slug set not null;
create unique index if not exists events_slug_key on events (slug);

do $$
declare
  rec record;
  base text;
  candidate text;
  i int;
begin
  if to_regclass('public.dogs') is null then
    return;
  end if;

  alter table dogs add column if not exists slug text;

  for rec in
    select id, user_id, name
    from dogs
    where slug is null or btrim(slug) = ''
    order by created_at, id
  loop
    base := public._dogdex_slugify(rec.name, 'pies');
    candidate := base;
    i := 2;

    while exists (
      select 1
      from dogs
      where user_id = rec.user_id
        and slug = candidate
        and id <> rec.id
    ) loop
      candidate := base || '-' || i;
      i := i + 1;
    end loop;

    update dogs set slug = candidate where id = rec.id;
  end loop;

  drop index if exists dogs_user_slug_unique;
  alter table dogs alter column slug set not null;
  create unique index if not exists dogs_user_slug_unique on dogs (user_id, slug);
end $$;

alter table trainer_profiles add column if not exists slug text;

do $$
declare
  rec record;
  base text;
  candidate text;
  i int;
begin
  for rec in
    select id, full_name
    from trainer_profiles
    where slug is null or btrim(slug) = ''
    order by created_at, id
  loop
    base := public._dogdex_slugify(rec.full_name, 'trener');
    candidate := base;
    i := 2;

    while exists (select 1 from trainer_profiles where slug = candidate and id <> rec.id) loop
      candidate := base || '-' || i;
      i := i + 1;
    end loop;

    update trainer_profiles set slug = candidate where id = rec.id;
  end loop;
end $$;

alter table trainer_profiles alter column slug set not null;
create unique index if not exists trainer_profiles_slug_key on trainer_profiles (slug);

alter table training_types add column if not exists slug text;

do $$
declare
  rec record;
  base text;
  candidate text;
  i int;
begin
  for rec in
    select id, trainer_id, name
    from training_types
    where slug is null or btrim(slug) = ''
    order by created_at, id
  loop
    base := public._dogdex_slugify(rec.name, 'trening');
    candidate := base;
    i := 2;

    while exists (
      select 1
      from training_types
      where trainer_id = rec.trainer_id
        and slug = candidate
        and id <> rec.id
    ) loop
      candidate := base || '-' || i;
      i := i + 1;
    end loop;

    update training_types set slug = candidate where id = rec.id;
  end loop;
end $$;

alter table training_types alter column slug set not null;
create unique index if not exists training_types_trainer_slug_key on training_types (trainer_id, slug);

drop function if exists public._dogdex_slugify(text, text);

-- ============================================================================
-- Source migration: 20260701120000_fix_multi_registration_schedule_access.sql
-- ============================================================================

-- Link existing participant records to auth users where possible and make
-- schedule assignment reads explicit under RLS.

update public.participants p
set user_id = u.id
from auth.users u
where p.user_id is null
  and p.owner_email is not null
  and lower(p.owner_email) = lower(u.email);

create index if not exists idx_participants_user_id
  on public.participants(user_id);

create index if not exists idx_participants_dog_id
  on public.participants(dog_id);

create index if not exists idx_participants_owner_email_lower
  on public.participants(lower(owner_email));

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'schedule_assignments'
      and policyname = 'schedule_assignments_public_read'
  ) then
    create policy "schedule_assignments_public_read" on public.schedule_assignments
      for select using (true);
  end if;
end $$;

-- ============================================================================
-- Source migration: 20260704120000_add_training_schema.sql
-- ============================================================================

-- The training tables previously existed only in supabase/schema.sql.
-- Keep this migration before role-upgrade migrations that reference them.

create table if not exists public.trainer_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  trainer_id uuid not null unique references auth.users(id) on delete cascade,
  is_active boolean not null default false,
  full_name text not null,
  bio text,
  profile_image_url text,
  location_city text,
  location_details text,
  price_per_hour numeric(8, 2) check (price_per_hour is null or price_per_hour >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  price_per_hour numeric(8, 2) check (price_per_hour is null or price_per_hour >= 0),
  duration_min integer not null default 60 check (duration_min between 15 and 480),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_availability (
  id uuid primary key default gen_random_uuid(),
  training_type_id uuid not null references public.training_types(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists public.training_bookings (
  id uuid primary key default gen_random_uuid(),
  training_type_id uuid not null references public.training_types(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid references public.dogs(id) on delete set null,
  scheduled_at timestamptz not null,
  duration_min integer not null default 60 check (duration_min between 15 and 480),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  cancellation_reason text,
  cancellation_requested_by text
    check (cancellation_requested_by is null or cancellation_requested_by in ('user', 'trainer')),
  cancellation_approved_at timestamptz,
  notes_user text,
  notes_trainer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.training_bookings(id) on delete cascade,
  amount numeric(10, 2) not null check (amount >= 0),
  currency text not null default 'PLN',
  stripe_session_id text,
  stripe_payment_intent_id text,
  stripe_account_id text,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'refunded')),
  payment_method_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trainer_date_availability (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  available_date date not null,
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trainer_id, available_date),
  check (end_time > start_time)
);

create unique index if not exists trainer_profiles_slug_key
  on public.trainer_profiles(slug);
create unique index if not exists training_types_trainer_slug_key
  on public.training_types(trainer_id, slug);
create unique index if not exists training_payments_stripe_session_key
  on public.training_payments(stripe_session_id)
  where stripe_session_id is not null;
create unique index if not exists training_payments_payment_intent_key
  on public.training_payments(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists idx_trainer_profiles_is_active
  on public.trainer_profiles(is_active);
create index if not exists idx_trainer_profiles_trainer_id
  on public.trainer_profiles(trainer_id);
create index if not exists idx_training_types_trainer_id
  on public.training_types(trainer_id);
create index if not exists idx_training_types_is_active
  on public.training_types(is_active);
create index if not exists idx_training_availability_training_type
  on public.training_availability(training_type_id);
create index if not exists idx_training_availability_active
  on public.training_availability(is_active);
create index if not exists idx_training_bookings_user_id
  on public.training_bookings(user_id);
create index if not exists idx_training_bookings_dog_id
  on public.training_bookings(dog_id);
create index if not exists idx_training_bookings_training_type
  on public.training_bookings(training_type_id);
create index if not exists idx_training_bookings_scheduled
  on public.training_bookings(scheduled_at);
create index if not exists idx_training_bookings_status
  on public.training_bookings(status);
create index if not exists idx_training_payments_booking
  on public.training_payments(booking_id);
create index if not exists idx_training_payments_status
  on public.training_payments(status);
create index if not exists idx_trainer_date_availability_trainer_id
  on public.trainer_date_availability(trainer_id);
create index if not exists idx_trainer_date_availability_date
  on public.trainer_date_availability(available_date);

alter table public.trainer_profiles enable row level security;
alter table public.training_types enable row level security;
alter table public.training_availability enable row level security;
alter table public.training_bookings enable row level security;
alter table public.training_payments enable row level security;
alter table public.trainer_date_availability enable row level security;

drop policy if exists "trainer_profiles_select_active" on public.trainer_profiles;
create policy "trainer_profiles_select_active" on public.trainer_profiles
  for select using (is_active or auth.uid() = trainer_id);
drop policy if exists "trainer_profiles_insert_own" on public.trainer_profiles;
create policy "trainer_profiles_insert_own" on public.trainer_profiles
  for insert with check (auth.uid() = trainer_id);
drop policy if exists "trainer_profiles_update_own" on public.trainer_profiles;
create policy "trainer_profiles_update_own" on public.trainer_profiles
  for update using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);
drop policy if exists "trainer_profiles_delete_own" on public.trainer_profiles;
create policy "trainer_profiles_delete_own" on public.trainer_profiles
  for delete using (auth.uid() = trainer_id);

drop policy if exists "training_types_select_public" on public.training_types;
create policy "training_types_select_public" on public.training_types
  for select using (
    auth.uid() = trainer_id
    or (
      is_active
      and exists (
        select 1
        from public.trainer_profiles
        where trainer_profiles.trainer_id = training_types.trainer_id
          and trainer_profiles.is_active
      )
    )
  );
drop policy if exists "training_types_insert_own" on public.training_types;
create policy "training_types_insert_own" on public.training_types
  for insert with check (auth.uid() = trainer_id);
drop policy if exists "training_types_update_own" on public.training_types;
create policy "training_types_update_own" on public.training_types
  for update using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);
drop policy if exists "training_types_delete_own" on public.training_types;
create policy "training_types_delete_own" on public.training_types
  for delete using (auth.uid() = trainer_id);

drop policy if exists "training_availability_select_public" on public.training_availability;
create policy "training_availability_select_public" on public.training_availability
  for select using (
    is_active
    or auth.uid() = (
      select training_types.trainer_id
      from public.training_types
      where training_types.id = training_type_id
    )
  );
drop policy if exists "training_availability_insert_own" on public.training_availability;
create policy "training_availability_insert_own" on public.training_availability
  for insert with check (
    auth.uid() = (
      select training_types.trainer_id
      from public.training_types
      where training_types.id = training_type_id
    )
  );
drop policy if exists "training_availability_update_own" on public.training_availability;
create policy "training_availability_update_own" on public.training_availability
  for update using (
    auth.uid() = (
      select training_types.trainer_id
      from public.training_types
      where training_types.id = training_type_id
    )
  );
drop policy if exists "training_availability_delete_own" on public.training_availability;
create policy "training_availability_delete_own" on public.training_availability
  for delete using (
    auth.uid() = (
      select training_types.trainer_id
      from public.training_types
      where training_types.id = training_type_id
    )
  );

drop policy if exists "training_bookings_select_own" on public.training_bookings;
create policy "training_bookings_select_own" on public.training_bookings
  for select using (
    auth.uid() = user_id
    or auth.uid() = (
      select training_types.trainer_id
      from public.training_types
      where training_types.id = training_type_id
    )
  );
drop policy if exists "training_bookings_insert_own" on public.training_bookings;
create policy "training_bookings_insert_own" on public.training_bookings
  for insert with check (auth.uid() = user_id);
drop policy if exists "training_bookings_update_own" on public.training_bookings;
create policy "training_bookings_update_own" on public.training_bookings
  for update using (
    auth.uid() = user_id
    or auth.uid() = (
      select training_types.trainer_id
      from public.training_types
      where training_types.id = training_type_id
    )
  );
drop policy if exists "training_bookings_delete_own" on public.training_bookings;
create policy "training_bookings_delete_own" on public.training_bookings
  for delete using (auth.uid() = user_id);

drop policy if exists "training_payments_select_own" on public.training_payments;
create policy "training_payments_select_own" on public.training_payments
  for select using (
    exists (
      select 1
      from public.training_bookings
      join public.training_types
        on training_types.id = training_bookings.training_type_id
      where training_bookings.id = training_payments.booking_id
        and (
          training_bookings.user_id = auth.uid()
          or training_types.trainer_id = auth.uid()
        )
    )
  );
drop policy if exists "training_payments_insert_own" on public.training_payments;
create policy "training_payments_insert_own" on public.training_payments
  for insert with check (
    auth.uid() = (
      select training_bookings.user_id
      from public.training_bookings
      where training_bookings.id = booking_id
    )
  );
drop policy if exists "training_payments_update_own" on public.training_payments;
create policy "training_payments_update_own" on public.training_payments
  for update using (
    exists (
      select 1
      from public.training_bookings
      join public.training_types
        on training_types.id = training_bookings.training_type_id
      where training_bookings.id = training_payments.booking_id
        and (
          training_bookings.user_id = auth.uid()
          or training_types.trainer_id = auth.uid()
        )
    )
  );

drop policy if exists "trainer_date_availability_select_public"
  on public.trainer_date_availability;
create policy "trainer_date_availability_select_public"
  on public.trainer_date_availability
  for select using (is_active or auth.uid() = trainer_id);
drop policy if exists "trainer_date_availability_insert_own"
  on public.trainer_date_availability;
create policy "trainer_date_availability_insert_own"
  on public.trainer_date_availability
  for insert with check (auth.uid() = trainer_id);
drop policy if exists "trainer_date_availability_update_own"
  on public.trainer_date_availability;
create policy "trainer_date_availability_update_own"
  on public.trainer_date_availability
  for update using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);
drop policy if exists "trainer_date_availability_delete_own"
  on public.trainer_date_availability;
create policy "trainer_date_availability_delete_own"
  on public.trainer_date_availability
  for delete using (auth.uid() = trainer_id);

grant all on public.trainer_profiles to service_role;
grant all on public.training_types to service_role;
grant all on public.training_availability to service_role;
grant all on public.training_bookings to service_role;
grant all on public.training_payments to service_role;
grant all on public.trainer_date_availability to service_role;

grant select on public.trainer_profiles to anon, authenticated;
grant select on public.training_types to anon, authenticated;
grant select on public.training_availability to anon, authenticated;
grant select on public.trainer_date_availability to anon, authenticated;
grant insert, update, delete on public.trainer_profiles to authenticated;
grant insert, update, delete on public.training_types to authenticated;
grant insert, update, delete on public.training_availability to authenticated;
grant insert, update, delete on public.trainer_date_availability to authenticated;
grant select, insert, update, delete on public.training_bookings to authenticated;
grant select, insert, update on public.training_payments to authenticated;

-- ============================================================================
-- Source migration: 20260705120000_add_role_upgrade_requests.sql
-- ============================================================================

create table if not exists public.role_upgrade_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_role text not null check (requested_role in ('organizer', 'trainer', 'organizer_trainer')),
  status text not null default 'pending' check (status in ('pending', 'needs_info', 'approved', 'rejected')),
  full_name text not null,
  business_name text,
  city text,
  phone text,
  experience text not null,
  verification_links jsonb not null default '[]'::jsonb check (jsonb_typeof(verification_links) = 'array'),
  certification_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(certification_urls) = 'array'),
  pricing_acknowledged boolean not null default false,
  terms_accepted boolean not null default false,
  admin_notes text,
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_role_upgrade_requests_user_id on public.role_upgrade_requests(user_id);
create index if not exists idx_role_upgrade_requests_status on public.role_upgrade_requests(status);
create index if not exists idx_role_upgrade_requests_created_at on public.role_upgrade_requests(created_at desc);

drop trigger if exists role_upgrade_requests_updated_at on public.role_upgrade_requests;
create trigger role_upgrade_requests_updated_at
  before update on public.role_upgrade_requests
  for each row execute function public.update_updated_at_column();

alter table public.role_upgrade_requests enable row level security;

drop policy if exists "role_upgrade_requests_select_own_or_admin" on public.role_upgrade_requests;
create policy "role_upgrade_requests_select_own_or_admin"
  on public.role_upgrade_requests for select
  using (auth.uid() = user_id or public.user_role() = 'admin');

drop policy if exists "role_upgrade_requests_insert_own" on public.role_upgrade_requests;
create policy "role_upgrade_requests_insert_own"
  on public.role_upgrade_requests for insert
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and pricing_acknowledged = true
    and terms_accepted = true
  );

drop policy if exists "role_upgrade_requests_update_own_active" on public.role_upgrade_requests;
create policy "role_upgrade_requests_update_own_active"
  on public.role_upgrade_requests for update
  using (auth.uid() = user_id and status in ('pending', 'needs_info'))
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and pricing_acknowledged = true
    and terms_accepted = true
  );

drop policy if exists "role_upgrade_requests_admin_update" on public.role_upgrade_requests;
create policy "role_upgrade_requests_admin_update"
  on public.role_upgrade_requests for update
  using (public.user_role() = 'admin')
  with check (public.user_role() = 'admin');

grant all on public.role_upgrade_requests to service_role;
grant select, insert on public.role_upgrade_requests to authenticated;

drop policy if exists "events_organizer_insert" on public.events;
create policy "events_organizer_insert" on public.events
  for insert with check (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "events_organizer_update" on public.events;
create policy "events_organizer_update" on public.events
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "events_organizer_delete" on public.events;
create policy "events_organizer_delete" on public.events
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "heats_organizer_insert" on public.heats;
create policy "heats_organizer_insert" on public.heats
  for insert with check (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "heats_organizer_update" on public.heats;
create policy "heats_organizer_update" on public.heats
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "heats_organizer_delete" on public.heats;
create policy "heats_organizer_delete" on public.heats
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "results_organizer_insert" on public.results;
create policy "results_organizer_insert" on public.results
  for insert with check (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "results_organizer_update" on public.results;
create policy "results_organizer_update" on public.results
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "results_organizer_delete" on public.results;
create policy "results_organizer_delete" on public.results
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "registrations_organizer_update" on public.registrations;
create policy "registrations_organizer_update" on public.registrations
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "registrations_organizer_delete" on public.registrations;
create policy "registrations_organizer_delete" on public.registrations
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "participants_organizer_update" on public.participants;
create policy "participants_organizer_update" on public.participants
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "participants_organizer_delete" on public.participants;
create policy "participants_organizer_delete" on public.participants
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "time_slots_organizer_insert" on public.time_slots;
create policy "time_slots_organizer_insert" on public.time_slots
  for insert with check (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "time_slots_organizer_update" on public.time_slots;
create policy "time_slots_organizer_update" on public.time_slots
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "time_slots_organizer_delete" on public.time_slots;
create policy "time_slots_organizer_delete" on public.time_slots
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "cancellation_requests_organizer_update" on public.cancellation_requests;
create policy "cancellation_requests_organizer_update"
  on public.cancellation_requests for update
  using (
    exists (
      select 1
      from public.events
      join public.profiles on profiles.id = auth.uid()
      where events.id = cancellation_requests.event_id
        and events.created_by = auth.uid()
        and profiles.role in ('organizer', 'organizer_trainer', 'admin')
    )
    or public.user_role() = 'admin'
  );

drop policy if exists "trainer_profiles_insert_own" on public.trainer_profiles;
create policy "trainer_profiles_insert_own" on public.trainer_profiles
  for insert with check (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "trainer_profiles_update_own" on public.trainer_profiles;
create policy "trainer_profiles_update_own" on public.trainer_profiles
  for update using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "trainer_profiles_delete_own" on public.trainer_profiles;
create policy "trainer_profiles_delete_own" on public.trainer_profiles
  for delete using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "training_types_insert_own" on public.training_types;
create policy "training_types_insert_own" on public.training_types
  for insert with check (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "training_types_update_own" on public.training_types;
create policy "training_types_update_own" on public.training_types
  for update using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "training_types_delete_own" on public.training_types;
create policy "training_types_delete_own" on public.training_types
  for delete using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "training_availability_insert_own" on public.training_availability;
create policy "training_availability_insert_own" on public.training_availability
  for insert with check (
    public.user_role() in ('trainer', 'organizer_trainer', 'admin')
    and auth.uid() = (select trainer_id from public.training_types where id = training_type_id)
  );

drop policy if exists "training_availability_update_own" on public.training_availability;
create policy "training_availability_update_own" on public.training_availability
  for update using (
    public.user_role() in ('trainer', 'organizer_trainer', 'admin')
    and auth.uid() = (select trainer_id from public.training_types where id = training_type_id)
  );

drop policy if exists "training_availability_delete_own" on public.training_availability;
create policy "training_availability_delete_own" on public.training_availability
  for delete using (
    public.user_role() in ('trainer', 'organizer_trainer', 'admin')
    and auth.uid() = (select trainer_id from public.training_types where id = training_type_id)
  );

drop policy if exists "trainer_date_availability_insert_own" on public.trainer_date_availability;
create policy "trainer_date_availability_insert_own" on public.trainer_date_availability
  for insert with check (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "trainer_date_availability_update_own" on public.trainer_date_availability;
create policy "trainer_date_availability_update_own" on public.trainer_date_availability
  for update using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "trainer_date_availability_delete_own" on public.trainer_date_availability;
create policy "trainer_date_availability_delete_own" on public.trainer_date_availability
  for delete using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

-- ============================================================================
-- Source migration: 20260706130000_add_event_draft_status.sql
-- ============================================================================

alter table public.events
  drop constraint if exists events_status_check;

alter table public.events
  add constraint events_status_check
  check (status in ('draft', 'upcoming', 'ongoing', 'finished', 'cancelled'));

-- ============================================================================
-- Source migration: 20260707120000_add_training_bookings_dog_fk.sql
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_bookings_dog_id_fkey'
      and conrelid = 'public.training_bookings'::regclass
  ) then
    alter table public.training_bookings
      add constraint training_bookings_dog_id_fkey
      foreign key (dog_id)
      references public.dogs(id)
      on delete set null
      not valid;
  end if;
end $$;

create index if not exists idx_training_bookings_dog_id
  on public.training_bookings(dog_id);

-- ============================================================================
-- Source migration: 20260724110000_harden_event_data_rls.sql
-- ============================================================================

-- Close public access to registration PII and scope organizer permissions
-- to events they own. The anon key is public, so RLS is the security boundary.

create or replace function public.is_event_manager(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.user_role() = 'admin'
    or exists (
      select 1
      from public.events event
      where event.id = target_event_id
        and event.created_by = auth.uid()
    );
$$;

create or replace function public.is_public_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events event
    where event.id = target_event_id
      and event.status <> 'draft'
  );
$$;

create or replace function public.are_event_results_public(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events event
    where event.id = target_event_id
      and event.status <> 'draft'
      and event.results_public = true
  );
$$;

create or replace function public.is_participant_owner(target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.participants participant
    where participant.id = target_participant_id
      and (
        participant.user_id = auth.uid()
        or (
          participant.owner_email is not null
          and lower(participant.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
  );
$$;

create or replace function public.is_participant_manager(target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.user_role() = 'admin'
    or exists (
      select 1
      from public.registrations registration
      join public.events event on event.id = registration.event_id
      where registration.participant_id = target_participant_id
        and event.created_by = auth.uid()
    );
$$;

revoke all on function public.is_event_manager(uuid) from public;
revoke all on function public.is_public_event(uuid) from public;
revoke all on function public.are_event_results_public(uuid) from public;
revoke all on function public.is_participant_owner(uuid) from public;
revoke all on function public.is_participant_manager(uuid) from public;

grant execute on function public.is_event_manager(uuid) to authenticated, service_role;
grant execute on function public.is_public_event(uuid) to anon, authenticated, service_role;
grant execute on function public.are_event_results_public(uuid) to anon, authenticated, service_role;
grant execute on function public.is_participant_owner(uuid) to authenticated, service_role;
grant execute on function public.is_participant_manager(uuid) to authenticated, service_role;

-- Events: drafts are private; organizers may only mutate their own events.
drop policy if exists "events_public_read" on public.events;
drop policy if exists "events_organizer_insert" on public.events;
drop policy if exists "events_organizer_update" on public.events;
drop policy if exists "events_organizer_delete" on public.events;

create policy "events_public_or_owner_read" on public.events
  for select using (
    status <> 'draft'
    or created_by = auth.uid()
    or public.user_role() = 'admin'
  );

create policy "events_owner_insert" on public.events
  for insert with check (
    public.user_role() in ('organizer', 'organizer_trainer', 'admin')
    and (created_by = auth.uid() or public.user_role() = 'admin')
  );

create policy "events_owner_update" on public.events
  for update
  using (created_by = auth.uid() or public.user_role() = 'admin')
  with check (created_by = auth.uid() or public.user_role() = 'admin');

create policy "events_owner_delete" on public.events
  for delete using (created_by = auth.uid() or public.user_role() = 'admin');

-- Participants and registrations contain personal data. They are visible only
-- to the participant, the event owner, and admins. Public registration uses
-- the server-side service role route instead of direct table inserts.
drop policy if exists "participants_public_read" on public.participants;
drop policy if exists "participants_public_insert" on public.participants;
drop policy if exists "participants_organizer_update" on public.participants;
drop policy if exists "participants_organizer_delete" on public.participants;

create policy "participants_owner_or_manager_read" on public.participants
  for select using (
    public.is_participant_owner(id)
    or public.is_participant_manager(id)
  );

create policy "participants_admin_update" on public.participants
  for update
  using (public.user_role() = 'admin')
  with check (public.user_role() = 'admin');

create policy "participants_admin_delete" on public.participants
  for delete using (public.user_role() = 'admin');

drop policy if exists "registrations_public_read" on public.registrations;
drop policy if exists "registrations_public_insert" on public.registrations;
drop policy if exists "registrations_organizer_update" on public.registrations;
drop policy if exists "registrations_organizer_delete" on public.registrations;

create policy "registrations_owner_or_manager_read" on public.registrations
  for select using (
    public.is_participant_owner(participant_id)
    or public.is_event_manager(event_id)
  );

create policy "registrations_manager_update" on public.registrations
  for update
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "registrations_manager_delete" on public.registrations
  for delete using (public.is_event_manager(event_id));

revoke all on table public.participants from anon;
revoke all on table public.registrations from anon;
revoke all on table public.participants from authenticated;
revoke all on table public.registrations from authenticated;
grant select, update, delete on table public.participants to authenticated;
grant select, update, delete on table public.registrations to authenticated;

-- Results and live data may be read publicly only when the owning event is
-- published and results_public is enabled.
drop policy if exists "results_public_read" on public.results;
drop policy if exists "results_organizer_insert" on public.results;
drop policy if exists "results_organizer_update" on public.results;
drop policy if exists "results_organizer_delete" on public.results;

create policy "results_public_or_manager_read" on public.results
  for select using (
    public.are_event_results_public(event_id)
    or public.is_event_manager(event_id)
  );

create policy "results_manager_insert" on public.results
  for insert with check (public.is_event_manager(event_id));

create policy "results_manager_update" on public.results
  for update
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "results_manager_delete" on public.results
  for delete using (public.is_event_manager(event_id));

drop policy if exists "heats_public_read" on public.heats;
drop policy if exists "heats_organizer_insert" on public.heats;
drop policy if exists "heats_organizer_update" on public.heats;
drop policy if exists "heats_organizer_delete" on public.heats;

create policy "heats_public_or_manager_read" on public.heats
  for select using (
    public.is_public_event(event_id)
    or public.is_event_manager(event_id)
  );

create policy "heats_manager_insert" on public.heats
  for insert with check (public.is_event_manager(event_id));

create policy "heats_manager_update" on public.heats
  for update
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "heats_manager_delete" on public.heats
  for delete using (public.is_event_manager(event_id));

drop policy if exists "time_slots_public_read" on public.time_slots;
drop policy if exists "time_slots_organizer_insert" on public.time_slots;
drop policy if exists "time_slots_organizer_update" on public.time_slots;
drop policy if exists "time_slots_organizer_delete" on public.time_slots;

create policy "time_slots_public_or_manager_read" on public.time_slots
  for select using (
    public.is_public_event(event_id)
    or public.is_event_manager(event_id)
  );

create policy "time_slots_manager_insert" on public.time_slots
  for insert with check (public.is_event_manager(event_id));

create policy "time_slots_manager_update" on public.time_slots
  for update
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "time_slots_manager_delete" on public.time_slots
  for delete using (public.is_event_manager(event_id));

-- Assignment rows reveal participant schedules. Public pages render them via a
-- server-side service-role query after applying their own disclosure rules.
alter table public.schedule_assignments enable row level security;
drop policy if exists "schedule_assignments_public_read" on public.schedule_assignments;

create policy "schedule_assignments_owner_or_manager_read" on public.schedule_assignments
  for select using (
    exists (
      select 1
      from public.registrations registration
      where registration.id = schedule_assignments.registration_id
        and (
          public.is_participant_owner(registration.participant_id)
          or public.is_event_manager(registration.event_id)
        )
    )
  );

create policy "schedule_assignments_manager_insert" on public.schedule_assignments
  for insert with check (
    exists (
      select 1
      from public.registrations registration
      join public.time_slots slot on slot.id = schedule_assignments.time_slot_id
      where registration.id = schedule_assignments.registration_id
        and registration.event_id = slot.event_id
        and public.is_event_manager(registration.event_id)
    )
  );

create policy "schedule_assignments_manager_update" on public.schedule_assignments
  for update
  using (
    exists (
      select 1
      from public.registrations registration
      where registration.id = schedule_assignments.registration_id
        and public.is_event_manager(registration.event_id)
    )
  )
  with check (
    exists (
      select 1
      from public.registrations registration
      join public.time_slots slot on slot.id = schedule_assignments.time_slot_id
      where registration.id = schedule_assignments.registration_id
        and registration.event_id = slot.event_id
        and public.is_event_manager(registration.event_id)
    )
  );

create policy "schedule_assignments_manager_delete" on public.schedule_assignments
  for delete using (
    exists (
      select 1
      from public.registrations registration
      where registration.id = schedule_assignments.registration_id
        and public.is_event_manager(registration.event_id)
    )
  );

revoke all on table public.schedule_assignments from anon;
grant select, insert, update, delete on table public.schedule_assignments to authenticated;

-- ============================================================================
-- Source migration: 20260724112000_harden_event_storage.sql
-- ============================================================================

-- Store event media below the uploader's user-id folder so one organizer
-- cannot overwrite or delete another organizer's files.

drop policy if exists "event_thumbnails_auth_insert" on storage.objects;
drop policy if exists "event_thumbnails_auth_delete" on storage.objects;

create policy "event_thumbnails_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-thumbnails'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.user_role() = 'admin'
    )
  );

create policy "event_thumbnails_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-thumbnails'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.user_role() = 'admin'
    )
  );

-- ============================================================================
-- Source migration: 20260724112500_add_stripe_profile_columns.sql
-- ============================================================================

alter table public.profiles
  add column if not exists stripe_account_id text;

alter table public.profiles
  add column if not exists stripe_onboarded boolean not null default false;

-- ============================================================================
-- Source migration: 20260724113000_enforce_registration_constraints.sql
-- ============================================================================

-- Serialize active registration changes per event so concurrent requests
-- cannot overbook capacity or create the same email + dog registration twice.

create or replace function public.enforce_registration_constraints()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  event_capacity integer;
  participant_email text;
  participant_dog_name text;
begin
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.event_id::text, 0));

  select event.max_participants
  into event_capacity
  from public.events event
  where event.id = new.event_id;

  if event_capacity is not null and event_capacity > 0 and (
    select count(*)
    from public.registrations registration
    where registration.event_id = new.event_id
      and registration.status in ('pending', 'confirmed')
      and registration.id <> new.id
  ) >= event_capacity then
    raise exception using
      errcode = 'P0001',
      message = 'event_capacity_reached';
  end if;

  select participant.owner_email, participant.dog_name
  into participant_email, participant_dog_name
  from public.participants participant
  where participant.id = new.participant_id;

  if participant_email is not null and participant_dog_name is not null and exists (
    select 1
    from public.registrations registration
    join public.participants participant on participant.id = registration.participant_id
    where registration.event_id = new.event_id
      and registration.status in ('pending', 'confirmed')
      and registration.id <> new.id
      and lower(participant.owner_email) = lower(participant_email)
      and lower(participant.dog_name) = lower(participant_dog_name)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'duplicate_active_registration';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_registration_constraints_trigger on public.registrations;
create trigger enforce_registration_constraints_trigger
  before insert or update of event_id, participant_id, status
  on public.registrations
  for each row
  execute function public.enforce_registration_constraints();

-- ============================================================================
-- Source migration: 20260724114000_harden_training_booking_writes.sql
-- ============================================================================

-- Booking and payment state must only be changed by validated server routes
-- and signed Stripe webhooks. Authenticated clients retain read access through
-- the existing owner/trainer SELECT policies.

drop policy if exists "training_bookings_insert_own" on public.training_bookings;
drop policy if exists "training_bookings_update_own" on public.training_bookings;
drop policy if exists "training_bookings_delete_own" on public.training_bookings;

revoke insert, update, delete on table public.training_bookings from authenticated;
grant select on table public.training_bookings to authenticated;

drop policy if exists "training_payments_insert_own" on public.training_payments;
drop policy if exists "training_payments_update_own" on public.training_payments;

revoke insert, update, delete on table public.training_payments from authenticated;
grant select on table public.training_payments to authenticated;

alter table public.training_bookings
  drop constraint if exists training_bookings_duration_positive;
alter table public.training_bookings
  add constraint training_bookings_duration_positive check (duration_min > 0);

-- A trainer may offer multiple training types, so a simple unique index on
-- training_type_id is insufficient. Serialize writes per trainer and reject
-- overlapping active bookings inside the database transaction.
create or replace function public.enforce_training_booking_conflict()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_trainer_id uuid;
begin
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  select training_type.trainer_id
  into target_trainer_id
  from public.training_types training_type
  where training_type.id = new.training_type_id;

  if target_trainer_id is null then
    raise exception using
      errcode = '23503',
      message = 'training_type_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_trainer_id::text, 0));

  if exists (
    select 1
    from public.training_bookings booking
    join public.training_types training_type on training_type.id = booking.training_type_id
    where training_type.trainer_id = target_trainer_id
      and booking.status in ('pending', 'confirmed')
      and booking.id <> new.id
      and booking.scheduled_at < new.scheduled_at + new.duration_min * interval '1 minute'
      and booking.scheduled_at + booking.duration_min * interval '1 minute' > new.scheduled_at
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'training_booking_conflict';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_training_booking_conflict_trigger on public.training_bookings;
create trigger enforce_training_booking_conflict_trigger
  before insert or update of training_type_id, scheduled_at, duration_min, status
  on public.training_bookings
  for each row
  execute function public.enforce_training_booking_conflict();

-- ============================================================================
-- Source migration: 20260724115000_add_public_rate_limits.sql
-- ============================================================================

create table if not exists public.public_rate_limits (
  scope text not null,
  identifier_hash text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0),
  primary key (scope, identifier_hash)
);

alter table public.public_rate_limits enable row level security;

revoke all on public.public_rate_limits from anon, authenticated;
grant all on public.public_rate_limits to service_role;

create or replace function public.consume_public_rate_limit(
  p_scope text,
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request_count integer;
begin
  if
    length(trim(coalesce(p_scope, ''))) = 0
    or length(trim(coalesce(p_identifier_hash, ''))) = 0
    or p_limit < 1
    or p_window_seconds < 1
  then
    raise exception 'invalid_rate_limit_parameters';
  end if;

  insert into public.public_rate_limits (
    scope,
    identifier_hash,
    window_started_at,
    request_count
  )
  values (
    p_scope,
    p_identifier_hash,
    now(),
    1
  )
  on conflict (scope, identifier_hash) do update
    set
      window_started_at = case
        when public.public_rate_limits.window_started_at
          <= now() - make_interval(secs => p_window_seconds)
        then now()
        else public.public_rate_limits.window_started_at
      end,
      request_count = case
        when public.public_rate_limits.window_started_at
          <= now() - make_interval(secs => p_window_seconds)
        then 1
        else public.public_rate_limits.request_count + 1
      end
  returning request_count into v_request_count;

  return v_request_count <= p_limit;
end;
$$;

revoke all on function public.consume_public_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, text, integer, integer)
  to service_role;

-- ============================================================================
-- Source migration: 20260724115500_harden_trainer_storage.sql
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('trainers', 'trainers', true)
on conflict (id) do update set public = true;

drop policy if exists "trainer_photos_public_read" on storage.objects;
create policy "trainer_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'trainers');

drop policy if exists "trainer_photos_insert_own_folder" on storage.objects;
create policy "trainer_photos_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trainers'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "trainer_photos_delete_own_folder" on storage.objects;
create policy "trainer_photos_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trainers'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

-- ============================================================================
-- Source migration: 20260724116000_add_training_payment_notification_state.sql
-- ============================================================================

alter table public.training_payments
  add column if not exists confirmation_sent_at timestamptz;

-- ============================================================================
-- Source migration: 20260729120000_add_configurable_competition_engine.sql
-- ============================================================================

-- Configurable competition formats are stored as immutable version rows.
-- Events keep their own definition snapshot so historical calculations remain
-- reproducible even when an organizer creates a newer version of a format.

create table public.competition_formats (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default gen_random_uuid(),
  previous_version_id uuid references public.competition_formats(id) on delete set null,
  version integer not null default 1 check (version > 0),
  name text not null check (char_length(name) between 1 and 120),
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  created_by uuid references auth.users(id) on delete cascade,
  is_system boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, version)
);

create unique index competition_formats_one_draft_per_family
  on public.competition_formats(family_id)
  where status = 'draft';
create index competition_formats_created_by_idx
  on public.competition_formats(created_by, updated_at desc);
create index competition_formats_public_idx
  on public.competition_formats(status, is_system)
  where status = 'published';

create or replace function public.prevent_published_competition_format_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('published', 'archived')
    and (
      new.definition is distinct from old.definition
      or new.name is distinct from old.name
      or new.description is distinct from old.description
      or new.family_id is distinct from old.family_id
      or new.version is distinct from old.version
      or new.previous_version_id is distinct from old.previous_version_id
      or new.created_by is distinct from old.created_by
      or new.is_system is distinct from old.is_system
    )
  then
    raise exception 'Published competition format versions are immutable';
  end if;
  return new;
end;
$$;

create trigger prevent_published_competition_format_change
  before update on public.competition_formats
  for each row execute function public.prevent_published_competition_format_change();

alter table public.events
  add column competition_format_id uuid references public.competition_formats(id) on delete set null,
  add column competition_config jsonb check (
    competition_config is null or jsonb_typeof(competition_config) = 'object'
  ),
  add column competition_values jsonb not null default '{}'::jsonb check (
    jsonb_typeof(competition_values) = 'object'
  ),
  add column competition_config_revision integer not null default 1 check (
    competition_config_revision > 0
  ),
  add column competition_config_locked_at timestamptz;

create index events_competition_format_id_idx
  on public.events(competition_format_id)
  where competition_format_id is not null;

create table public.competition_result_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  stage_id text not null,
  attempt_id text not null,
  status text,
  values jsonb not null default '{}'::jsonb check (jsonb_typeof(values) = 'object'),
  revision integer not null default 1 check (revision > 0),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, participant_id, stage_id, attempt_id)
);

create index competition_result_entries_event_idx
  on public.competition_result_entries(event_id, stage_id, attempt_id);
create index competition_result_entries_participant_idx
  on public.competition_result_entries(participant_id);

create table public.competition_calculated_results (
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  computed jsonb not null default '{}'::jsonb check (jsonb_typeof(computed) = 'object'),
  groups jsonb not null default '{}'::jsonb check (jsonb_typeof(groups) = 'object'),
  ranks jsonb not null default '{}'::jsonb check (jsonb_typeof(ranks) = 'object'),
  source_revision integer not null default 1 check (source_revision > 0),
  engine_version integer not null default 1 check (engine_version > 0),
  recalculated_at timestamptz not null default now(),
  primary key (event_id, participant_id)
);

create index competition_calculated_results_event_idx
  on public.competition_calculated_results(event_id);

create table public.competition_live_state (
  event_id uuid primary key references public.events(id) on delete cascade,
  view_id text,
  phase text,
  current_stage_id text,
  current_attempt_id text,
  current_participant_id uuid references public.participants(id) on delete set null,
  cursor integer not null default 0 check (cursor >= 0),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.lock_event_competition_config()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.events
  set competition_config_locked_at = coalesce(competition_config_locked_at, now())
  where id = new.event_id;
  return new;
end;
$$;

create trigger lock_event_competition_config_on_first_entry
  before insert on public.competition_result_entries
  for each row execute function public.lock_event_competition_config();

create or replace function public.prevent_locked_competition_config_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.competition_config_locked_at is not null
    and (
      new.competition_config is distinct from old.competition_config
      or new.competition_format_id is distinct from old.competition_format_id
      or new.competition_values is distinct from old.competition_values
    )
  then
    raise exception 'Competition configuration is locked after the first result entry';
  end if;
  return new;
end;
$$;

create trigger prevent_locked_event_competition_config_change
  before update on public.events
  for each row execute function public.prevent_locked_competition_config_change();

revoke all on function public.prevent_published_competition_format_change() from public;
revoke all on function public.lock_event_competition_config() from public;
revoke all on function public.prevent_locked_competition_config_change() from public;

alter table public.competition_formats enable row level security;
alter table public.competition_result_entries enable row level security;
alter table public.competition_calculated_results enable row level security;
alter table public.competition_live_state enable row level security;

create policy "competition_formats_visible"
  on public.competition_formats for select
  using (
    created_by = auth.uid()
    or (is_system = true and status = 'published')
    or public.user_role() = 'admin'
  );

create policy "competition_formats_owner_insert"
  on public.competition_formats for insert
  with check (
    public.user_role() in ('organizer', 'organizer_trainer', 'admin')
    and (
      (created_by = auth.uid() and is_system = false)
      or public.user_role() = 'admin'
    )
  );

create policy "competition_formats_owner_update_draft"
  on public.competition_formats for update
  using (
    (created_by = auth.uid() and status = 'draft' and is_system = false)
    or public.user_role() = 'admin'
  )
  with check (
    (created_by = auth.uid() and is_system = false)
    or public.user_role() = 'admin'
  );

create policy "competition_formats_owner_delete_draft"
  on public.competition_formats for delete
  using (
    (created_by = auth.uid() and status = 'draft' and is_system = false)
    or public.user_role() = 'admin'
  );

create policy "competition_entries_public_or_manager_read"
  on public.competition_result_entries for select
  using (
    public.are_event_results_public(event_id)
    or public.is_event_manager(event_id)
  );

create policy "competition_entries_manager_insert"
  on public.competition_result_entries for insert
  with check (
    public.is_event_manager(event_id)
    and recorded_by = auth.uid()
  );

create policy "competition_entries_manager_update"
  on public.competition_result_entries for update
  using (public.is_event_manager(event_id))
  with check (
    public.is_event_manager(event_id)
    and recorded_by = auth.uid()
  );

create policy "competition_entries_manager_delete"
  on public.competition_result_entries for delete
  using (public.is_event_manager(event_id));

create policy "competition_calculated_public_or_manager_read"
  on public.competition_calculated_results for select
  using (
    public.are_event_results_public(event_id)
    or public.is_event_manager(event_id)
  );

create policy "competition_calculated_manager_insert"
  on public.competition_calculated_results for insert
  with check (public.is_event_manager(event_id));

create policy "competition_calculated_manager_update"
  on public.competition_calculated_results for update
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "competition_calculated_manager_delete"
  on public.competition_calculated_results for delete
  using (public.is_event_manager(event_id));

create policy "competition_live_public_or_manager_read"
  on public.competition_live_state for select
  using (
    public.are_event_results_public(event_id)
    or public.is_event_manager(event_id)
  );

create policy "competition_live_manager_insert"
  on public.competition_live_state for insert
  with check (
    public.is_event_manager(event_id)
    and updated_by = auth.uid()
  );

create policy "competition_live_manager_update"
  on public.competition_live_state for update
  using (public.is_event_manager(event_id))
  with check (
    public.is_event_manager(event_id)
    and updated_by = auth.uid()
  );

create policy "competition_live_manager_delete"
  on public.competition_live_state for delete
  using (public.is_event_manager(event_id));

revoke all on table public.competition_formats from anon;
revoke all on table public.competition_result_entries from anon;
revoke all on table public.competition_calculated_results from anon;
revoke all on table public.competition_live_state from anon;

grant select on table public.competition_formats to anon;
grant select on table public.competition_result_entries to anon;
grant select on table public.competition_calculated_results to anon;
grant select on table public.competition_live_state to anon;

grant select, insert, update, delete on table public.competition_formats to authenticated;
grant select, insert, update, delete on table public.competition_result_entries to authenticated;
grant select, insert, update, delete on table public.competition_calculated_results to authenticated;
grant select, insert, update, delete on table public.competition_live_state to authenticated;

grant all on table public.competition_formats to service_role;
grant all on table public.competition_result_entries to service_role;
grant all on table public.competition_calculated_results to service_role;
grant all on table public.competition_live_state to service_role;

alter publication supabase_realtime add table public.competition_calculated_results;
alter publication supabase_realtime add table public.competition_live_state;
