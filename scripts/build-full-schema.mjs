import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const migrationsDirectory = path.join(repositoryRoot, "supabase", "migrations");
const outputPath = path.join(repositoryRoot, "supabase", "schema.sql");
const numberedMigrationPattern = /^\d{14}_.+\.sql$/;
const checkOnly = process.argv.includes("--check");

const migrationFiles = (await readdir(migrationsDirectory, {
  withFileTypes: true,
}))
  .filter(
    (entry) => entry.isFile() && numberedMigrationPattern.test(entry.name),
  )
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, "en"));

if (migrationFiles.length === 0) {
  throw new Error(
    `No numbered migrations found in ${path.relative(repositoryRoot, migrationsDirectory)}.`,
  );
}

const sections = await Promise.all(
  migrationFiles.map(async (migrationFile) => {
    const migrationPath = path.join(migrationsDirectory, migrationFile);
    const sql = (await readFile(migrationPath, "utf8"))
      .replace(/\r\n/g, "\n")
      .trimEnd();

    return [
      "-- ============================================================================",
      `-- Source migration: ${migrationFile}`,
      "-- ============================================================================",
      "",
      sql,
    ].join("\n");
  }),
);

const generatedSchema = [
  "-- AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.",
  "--",
  "-- Complete Supabase schema for provisioning a fresh Dogdex environment.",
  "-- It is assembled, in order, from every numbered file in supabase/migrations.",
  "--",
  "-- Regenerate after adding or changing a migration:",
  "--   npm run schema:build",
  "--",
  "-- Existing environments must receive only new incremental migrations.",
  "-- Do not re-run this full snapshot against an already provisioned database.",
  "",
  ...sections.flatMap((section, index) =>
    index === sections.length - 1 ? [section] : [section, ""],
  ),
  "",
].join("\n");

if (checkOnly) {
  let currentSchema;

  try {
    currentSchema = (await readFile(outputPath, "utf8")).replace(/\r\n/g, "\n");
  } catch {
    process.stderr.write(
      "supabase/schema.sql is missing. Run `npm run schema:build`.\n",
    );
    process.exitCode = 1;
    process.exit();
  }

  if (currentSchema !== generatedSchema) {
    process.stderr.write(
      "supabase/schema.sql is stale. Run `npm run schema:build` and commit the result.\n",
    );
    process.exitCode = 1;
    process.exit();
  }

  process.stdout.write(
    `supabase/schema.sql is current (${migrationFiles.length} migrations).\n`,
  );
} else {
  await writeFile(outputPath, generatedSchema, "utf8");
  process.stdout.write(
    `Generated supabase/schema.sql from ${migrationFiles.length} migrations.\n`,
  );
}
