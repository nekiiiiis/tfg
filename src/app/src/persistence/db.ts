/**
 * Cliente Postgres compartido (`postgres-js`) y handle Drizzle.
 *
 * El cliente `sql` se exporta crudo para el health-check; `db` es el handle
 * Drizzle con el esquema tipado para los servicios.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { config } from '../config.ts';
import { logger } from '../shared/logger.ts';
import * as schema from './schema/index.ts';

export const sql = postgres(config.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  // pgcrypto necesita un cast bytea; postgres-js lo soporta de serie.
  // Las `NOTICE` (p.ej. `CREATE TABLE IF NOT EXISTS` informando de tabla ya
  // existente) las enruta `postgres-js` por defecto a `console.log`, lo que
  // ensucia stdout y se salta el formato de pino. Las degradamos a `debug`
  // para que sólo se vean cuando se sube el LOG_LEVEL.
  onnotice: (notice) => {
    logger.debug(
      {
        code: notice.code,
        severity: notice.severity,
        routine: notice.routine,
        msg: notice.message,
      },
      'postgres notice',
    );
  },
});

export const db = drizzle(sql, { schema });
export type DB = typeof db;
