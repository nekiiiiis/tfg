/**
 * Tabla `entidades` — materializa la entidad del dominio `Entidad`.
 * Soporta CU-02..CU-05.
 *
 * Decisiones:
 *  - `id` UUID v4 generado por `gen_random_uuid()` (pgcrypto / Postgres 16).
 *  - `nombre` único; CHECK no-vacío.
 *  - Trigger BEFORE UPDATE para `actualizada` se añade en la migración.
 */

import { sql } from 'drizzle-orm';
import {
  check,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const entidades = pgTable(
  'entidades',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    nombre: varchar('nombre', { length: 64 }).notNull(),
    creadaEn: timestamp('creada_en', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    actualizada: timestamp('actualizada', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    nombreUq: unique('entidades_nombre_unico').on(t.nombre),
    nombreNoVacio: check(
      'entidades_nombre_no_vacio',
      sql`length(trim(${t.nombre})) > 0`,
    ),
  }),
);

export type Entidad = typeof entidades.$inferSelect;
export type NuevaEntidad = typeof entidades.$inferInsert;
