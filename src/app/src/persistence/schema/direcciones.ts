/**
 * Tabla `direcciones`. Soporta CU-06..CU-08.
 *
 * Una dirección pertenece a UNA entidad (FK + UNIQUE). Si la entidad se borra,
 * se borran en cascada (RS implícito: CU-05 con borrado en cascada de vínculos).
 */

import { sql } from 'drizzle-orm';
import {
  char,
  check,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { entidades } from './entidades.ts';

export const direcciones = pgTable(
  'direcciones',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    // "0x" + 40 hex en minúsculas. CHECK añadido abajo.
    valor: char('valor', { length: 42 }).notNull(),
    entidadId: uuid('entidad_id')
      .notNull()
      .references(() => entidades.id, { onDelete: 'cascade' }),
    aniadidaEn: timestamp('aniadida_en', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    valorUq: unique('direcciones_valor_unico').on(t.valor),
    formato: check('direcciones_formato', sql`${t.valor} ~ '^0x[a-f0-9]{40}$'`),
    porEntidad: index('direcciones_entidad').on(t.entidadId),
  }),
);

export type Direccion = typeof direcciones.$inferSelect;
export type NuevaDireccion = typeof direcciones.$inferInsert;
