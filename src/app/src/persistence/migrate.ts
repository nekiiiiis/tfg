/**
 * Ejecuta las migraciones de Drizzle contra la base de datos configurada en
 * `DATABASE_URL`. Diseñado para ejecutarse como `npm run db:migrate` antes
 * del primer arranque y en cada redeploy.
 *
 * Antes de ejecutar las migraciones generadas por Drizzle, garantizamos que
 * existe la extensión `pgcrypto` (necesaria para `pgp_sym_encrypt` y
 * `gen_random_uuid()`).
 */

import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

async function main(): Promise<void> {
  const url =
    process.env['DATABASE_URL'] ??
    'postgres://fieldx:fieldx_dev_password_change_me@localhost:5432/infinite_fieldx';
  const sql = postgres(url, { max: 1 });
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  const db = drizzle(sql);
  const migrationsFolder = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    'migrations',
  );
  await migrate(db, { migrationsFolder });
  await sql.end({ timeout: 5 });
  // eslint-disable-next-line no-console
  console.log('Migraciones aplicadas');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
