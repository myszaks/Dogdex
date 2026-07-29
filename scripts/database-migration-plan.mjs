// The production snapshot was exported into this migration before the
// timestamped migration chain was introduced.
export const productionSnapshotMigration =
  "20260611083507_from_main.sql";

// `require_slugs` also configures trainer slugs, so a fresh database needs the
// training tables first even though the older migration timestamp sorts first.
const migrationDependencies = new Map([
  [
    "20260627120000_require_slugs.sql",
    ["20260704120000_add_training_schema.sql"],
  ],
]);

export function orderDatabaseMigrations(migrationFiles) {
  const ordered = [...migrationFiles].sort((left, right) =>
    left.localeCompare(right, "en"),
  );

  for (const [migration, dependencies] of migrationDependencies) {
    if (!ordered.includes(migration)) continue;

    const withoutMigration = ordered.filter((item) => item !== migration);
    const dependencyIndexes = dependencies
      .map((dependency) => withoutMigration.indexOf(dependency))
      .filter((index) => index >= 0);

    if (dependencyIndexes.length !== dependencies.length) {
      const missing = dependencies.filter(
        (dependency) => !withoutMigration.includes(dependency),
      );
      throw new Error(
        `${migration} requires missing migration(s): ${missing.join(", ")}.`,
      );
    }

    const insertionIndex = Math.max(...dependencyIndexes) + 1;
    withoutMigration.splice(insertionIndex, 0, migration);
    ordered.splice(0, ordered.length, ...withoutMigration);
  }

  return ordered;
}
