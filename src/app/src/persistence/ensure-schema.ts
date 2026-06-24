/**
 * Auto-aplicador idempotente del esquema mínimo para módulos opcionales.
 *
 * Las tablas "core" (entidades, alertas, …) viven en la migración 0000_init y
 * se aplican con `drizzle-kit`. Para módulos añadidos después (como la
 * persistencia de trades del leaderboard) preferimos un `CREATE TABLE IF NOT
 * EXISTS` ejecutado al boot, así un `npm run dev` en limpio no requiere correr
 * migraciones manualmente.
 */

import type postgres from 'postgres';
import { logger } from '../shared/logger.ts';

export async function ensureLbTradesSchema(sql: postgres.Sql): Promise<void> {
  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "lb_trades" (
        "tid" text PRIMARY KEY NOT NULL,
        "mercado" varchar(16) NOT NULL,
        "token" varchar(64) NOT NULL,
        "direccion" char(42) NOT NULL,
        "lado" varchar(4) NOT NULL,
        "volumen_usd" double precision NOT NULL,
        "ts" double precision NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "lb_trades_ventana" ON "lb_trades" USING btree ("mercado","token","ts");
      CREATE INDEX IF NOT EXISTS "lb_trades_ts" ON "lb_trades" USING btree ("ts");
    `);
    logger.info('Persistencia leaderboard: tabla lb_trades lista');
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      'No se pudo crear/verificar la tabla lb_trades',
    );
    throw err;
  }
}
