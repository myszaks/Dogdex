import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  orderDatabaseMigrations,
  productionSnapshotMigration,
} from "./database-migration-plan.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const migrationsDirectory = path.join(repositoryRoot, "supabase", "migrations");
const productionStoragePath = path.join(
  repositoryRoot,
  "supabase",
  "production",
  "storage_buckets.sql",
);
const outputDirectory = path.join(repositoryRoot, "supabase", "development");
const productionOutputPath = path.join(
  outputDirectory,
  "01_production_schema.sql",
);
const deltaOutputPath = path.join(
  outputDirectory,
  "02_production_to_branch.sql",
);
const storageRepairOutputPath = path.join(
  outputDirectory,
  "repair_storage_buckets.sql",
);
const numberedMigrationPattern = /^\d{14}_.+\.sql$/;
const checkOnly = process.argv.includes("--check");

const migrationFiles = orderDatabaseMigrations(
  (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter(
      (entry) => entry.isFile() && numberedMigrationPattern.test(entry.name),
    )
    .map((entry) => entry.name),
);

const productionIndex = migrationFiles.indexOf(productionSnapshotMigration);
if (productionIndex < 0) {
  throw new Error(
    `Production snapshot migration ${productionSnapshotMigration} is missing.`,
  );
}
if (productionIndex !== 0) {
  throw new Error(
    `Production snapshot migration must be first, but is at index ${productionIndex}.`,
  );
}

async function migrationContents(migrationFile) {
  return (
    await readFile(path.join(migrationsDirectory, migrationFile), "utf8")
  )
    .replace(/\r\n/g, "\n")
    .trimEnd();
}

function section(migrationFile, sql) {
  return [
    "-- ============================================================================",
    `-- Source migration: ${migrationFile}`,
    "-- ============================================================================",
    "",
    sql,
  ].join("\n");
}

const productionSql = await migrationContents(productionSnapshotMigration);
const productionStorageSql = (await readFile(productionStoragePath, "utf8"))
  .replace(/\r\n/g, "\n")
  .trimEnd();
const productionArtifact = [
  "-- AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.",
  "--",
  "-- Schema-only snapshot of the Dogdex production database.",
  "-- Verified against production PostgREST metadata on 2026-07-29.",
  "-- Apply only to a fresh Supabase project.",
  "--",
  `-- Source: supabase/migrations/${productionSnapshotMigration}`,
  "-- Storage configuration source: supabase/production/storage_buckets.sql",
  "",
  productionSql,
  "",
  "-- ============================================================================",
  "-- Production Storage bucket configuration",
  "-- ============================================================================",
  "",
  productionStorageSql,
  "",
].join("\n");

const deltaMigrations = migrationFiles.slice(productionIndex + 1);
const deltaSections = await Promise.all(
  deltaMigrations.map(async (migrationFile) =>
    section(migrationFile, await migrationContents(migrationFile)),
  ),
);
const deltaArtifact = [
  "-- AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.",
  "--",
  "-- One-shot schema migration from the verified production snapshot to the",
  "-- current Dogdex branch.",
  "-- Apply only after 01_production_schema.sql.",
  "-- The transaction prevents a partially upgraded development schema.",
  "--",
  "-- Important: this file is a deployment bundle, not an additional migration.",
  "-- Do not apply it together with the individual source migrations.",
  "",
  "begin;",
  "",
  ...deltaSections.flatMap((item, index) =>
    index === deltaSections.length - 1 ? [item] : [item, ""],
  ),
  "",
  "commit;",
  "",
].join("\n");
const storageRepairArtifact = [
  "-- Idempotent repair for development databases provisioned before the",
  "-- production Storage bucket configuration was included in the snapshot.",
  "-- This changes configuration only; it does not create or copy user files.",
  "",
  "begin;",
  "",
  productionStorageSql,
  "",
  "commit;",
  "",
].join("\n");

async function checkArtifact(filePath, expected) {
  let current;
  try {
    current = (await readFile(filePath, "utf8")).replace(/\r\n/g, "\n");
  } catch {
    throw new Error(
      `${path.relative(repositoryRoot, filePath)} is missing. Run npm run db:dev:build.`,
    );
  }

  if (current !== expected) {
    throw new Error(
      `${path.relative(repositoryRoot, filePath)} is stale. Run npm run db:dev:build.`,
    );
  }
}

if (checkOnly) {
  await checkArtifact(productionOutputPath, productionArtifact);
  await checkArtifact(deltaOutputPath, deltaArtifact);
  await checkArtifact(storageRepairOutputPath, storageRepairArtifact);
  process.stdout.write(
    `Development database SQL is current (${deltaMigrations.length} delta migrations).\n`,
  );
} else {
  await writeFile(productionOutputPath, productionArtifact, "utf8");
  await writeFile(deltaOutputPath, deltaArtifact, "utf8");
  await writeFile(storageRepairOutputPath, storageRepairArtifact, "utf8");
  process.stdout.write(
    `Generated production snapshot and ${deltaMigrations.length}-migration development delta.\n`,
  );
}
