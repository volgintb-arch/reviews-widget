/**
 * Bootstrap migration: introduce Project model and migrate existing data.
 *
 * Run BEFORE `prisma db push` — creates the default project row so the FK
 * constraint on cities.project_id doesn't fail when db push adds it.
 *
 * Idempotent: safe to run multiple times.
 *
 *   npx tsx scripts/bootstrap-projects.ts
 */
import { prisma } from '../src/lib/prisma.js';

const DEFAULT_PROJECT_ID = 1;
const DEFAULT_PROJECT_SLUG = 'reviews';
const DEFAULT_PROJECT_NAME = 'QuestLegends Reviews';

async function main() {
  console.log('[bootstrap] starting projects migration');

  // Step 1: ensure projects table exists (idempotent via CREATE TABLE IF NOT EXISTS)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT NOW()
    );
  `);

  // Step 2: create default project if missing
  await prisma.$executeRawUnsafe(`
    INSERT INTO projects (id, slug, name)
    VALUES ($1, $2, $3)
    ON CONFLICT (id) DO NOTHING;
  `, DEFAULT_PROJECT_ID, DEFAULT_PROJECT_SLUG, DEFAULT_PROJECT_NAME);

  // Step 3: sync sequence so next auto-id is past DEFAULT_PROJECT_ID
  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('projects', 'id'),
      GREATEST(${DEFAULT_PROJECT_ID}, (SELECT COALESCE(MAX(id), 1) FROM projects))
    );
  `);

  // Step 4: ensure project_settings table exists
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS project_settings (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (project_id, key)
    );
  `);

  // Step 5: copy legacy Setting rows to ProjectSetting for the default project
  const copied = await prisma.$executeRawUnsafe(`
    INSERT INTO project_settings (project_id, key, value)
    SELECT ${DEFAULT_PROJECT_ID}, key, value FROM settings
    ON CONFLICT (project_id, key) DO NOTHING;
  `);
  console.log(`[bootstrap] copied ${copied} settings -> project_settings`);

  // Step 6: ensure project_id column exists on cities (for pre-push state)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE cities
    ADD COLUMN IF NOT EXISTS project_id INTEGER NOT NULL DEFAULT ${DEFAULT_PROJECT_ID};
  `);

  // Step 7: ensure config_override column exists on cities
  await prisma.$executeRawUnsafe(`
    ALTER TABLE cities
    ADD COLUMN IF NOT EXISTS config_override JSONB;
  `);

  // Step 8: attach FK if missing (Postgres has no "add constraint if not exists",
  // so we check information_schema first)
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'cities_project_id_fkey'
          AND table_name = 'cities'
      ) THEN
        ALTER TABLE cities
          ADD CONSTRAINT cities_project_id_fkey
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
      END IF;
    END $$;
  `);

  // Step 9: drop old unique on slug, add composite unique (project_id, slug)
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'cities_slug_key' AND tablename = 'cities'
      ) THEN
        ALTER TABLE cities DROP CONSTRAINT cities_slug_key;
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'cities_project_id_slug_key' AND tablename = 'cities'
      ) THEN
        ALTER TABLE cities
          ADD CONSTRAINT cities_project_id_slug_key UNIQUE (project_id, slug);
      END IF;
    END $$;
  `);

  console.log('[bootstrap] done');
  console.log('[bootstrap] next step: run `npx prisma db push` to sync any remaining changes');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('[bootstrap] failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
