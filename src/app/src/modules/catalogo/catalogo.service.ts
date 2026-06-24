/**
 * Servicio de aplicación del Catálogo (CU-02..CU-08).
 *
 * Encapsula el acceso a las tablas `entidades` y `direcciones` y aplica las
 * reglas del dominio (unicidad de nombre, unicidad de dirección, cascada de
 * borrado). Las rutas REST son finos *adapters* sobre este servicio.
 */

import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { DB } from '../../persistence/db.ts';
import { entidades, type Entidad } from '../../persistence/schema/entidades.ts';
import {
  direcciones,
  type Direccion,
} from '../../persistence/schema/direcciones.ts';
import {
  DireccionInvalida,
  DireccionYaAsignada,
  EntidadDuplicada,
  EntidadNoEncontrada,
} from '../../domain/errors.ts';
import { esAddressValida } from '../../domain/types.ts';

export interface ListarEntidadesOpts {
  query?: string;
  page?: number;
  size?: number;
}

export interface PaginaEntidades {
  items: Array<Entidad & { numDirecciones: number }>;
  total: number;
  page: number;
  size: number;
}

export class CatalogoService {
  constructor(private readonly db: DB) {}

  // ---- CU-02 ----
  async crearEntidad(nombre: string): Promise<Entidad> {
    const normalized = nombre.trim();
    if (normalized.length === 0) {
      throw new EntidadDuplicada('El nombre no puede estar vacío');
    }
    const existing = await this.db
      .select({ id: entidades.id })
      .from(entidades)
      .where(eq(entidades.nombre, normalized))
      .limit(1);
    if (existing.length > 0) {
      throw new EntidadDuplicada(`Ya existe una entidad con el nombre "${normalized}"`);
    }
    const [created] = await this.db
      .insert(entidades)
      .values({ nombre: normalized })
      .returning();
    if (!created) throw new Error('Insert returned no row');
    return created;
  }

  // ---- CU-03 ----
  async listarEntidades(opts: ListarEntidadesOpts = {}): Promise<PaginaEntidades> {
    const page = Math.max(1, opts.page ?? 1);
    const size = Math.min(200, Math.max(1, opts.size ?? 20));
    const filtros: SQL[] = [];
    if (opts.query && opts.query.trim().length > 0) {
      const q = `%${opts.query.trim()}%`;
      filtros.push(ilike(entidades.nombre, q) as SQL);
    }
    const whereClause = filtros.length > 0 ? and(...filtros) : undefined;
    const rows = await this.db
      .select()
      .from(entidades)
      .where(whereClause)
      .orderBy(asc(entidades.nombre))
      .limit(size)
      .offset((page - 1) * size);

    const counts = await this.contarDireccionesPorEntidad(rows.map((r) => r.id));
    const total = await this.contarEntidades(whereClause);
    return {
      items: rows.map((r) => ({ ...r, numDirecciones: counts.get(r.id) ?? 0 })),
      total,
      page,
      size,
    };
  }

  async obtenerEntidad(id: string): Promise<Entidad> {
    const [row] = await this.db
      .select()
      .from(entidades)
      .where(eq(entidades.id, id))
      .limit(1);
    if (!row) throw new EntidadNoEncontrada(`Entidad ${id} no existe`);
    return row;
  }

  // ---- CU-04 ----
  async editarEntidad(id: string, nuevoNombre: string): Promise<Entidad> {
    const normalized = nuevoNombre.trim();
    if (normalized.length === 0) {
      throw new EntidadDuplicada('El nombre no puede estar vacío');
    }
    await this.obtenerEntidad(id);
    const clash = await this.db
      .select({ id: entidades.id })
      .from(entidades)
      .where(and(eq(entidades.nombre, normalized)))
      .limit(1);
    if (clash.length > 0 && clash[0]!.id !== id) {
      throw new EntidadDuplicada(
        `Ya existe otra entidad con el nombre "${normalized}"`,
      );
    }
    const [updated] = await this.db
      .update(entidades)
      .set({ nombre: normalized, actualizada: new Date() })
      .where(eq(entidades.id, id))
      .returning();
    if (!updated) throw new EntidadNoEncontrada(`Entidad ${id} no existe`);
    return updated;
  }

  // ---- CU-05 ----
  async eliminarEntidad(id: string): Promise<void> {
    const deleted = await this.db
      .delete(entidades)
      .where(eq(entidades.id, id))
      .returning({ id: entidades.id });
    if (deleted.length === 0) throw new EntidadNoEncontrada(`Entidad ${id} no existe`);
  }

  // ---- CU-06 ----
  async aniadirDireccion(entidadId: string, valor: string): Promise<Direccion> {
    const normalized = valor.trim().toLowerCase();
    if (!esAddressValida(normalized)) {
      throw new DireccionInvalida(`Dirección con formato inválido: ${valor}`);
    }
    await this.obtenerEntidad(entidadId);
    const existing = await this.db
      .select({ entidadId: direcciones.entidadId })
      .from(direcciones)
      .where(eq(direcciones.valor, normalized))
      .limit(1);
    if (existing.length > 0) {
      throw new DireccionYaAsignada(
        `La dirección ${normalized} ya está asociada a otra entidad`,
      );
    }
    const [created] = await this.db
      .insert(direcciones)
      .values({ valor: normalized, entidadId })
      .returning();
    if (!created) throw new Error('Insert returned no row');
    return created;
  }

  // ---- CU-07 ----
  async listarDirecciones(
    entidadId: string,
    opts: { query?: string } = {},
  ): Promise<Direccion[]> {
    await this.obtenerEntidad(entidadId);
    const filtros: SQL[] = [eq(direcciones.entidadId, entidadId) as SQL];
    if (opts.query && opts.query.trim().length > 0) {
      const q = `%${opts.query.trim().toLowerCase()}%`;
      filtros.push(ilike(direcciones.valor, q) as SQL);
    }
    return await this.db
      .select()
      .from(direcciones)
      .where(and(...filtros))
      .orderBy(asc(direcciones.aniadidaEn));
  }

  // ---- CU-08 ----
  async eliminarDireccion(direccionId: string): Promise<void> {
    const deleted = await this.db
      .delete(direcciones)
      .where(eq(direcciones.id, direccionId))
      .returning({ id: direcciones.id });
    if (deleted.length === 0) {
      throw new DireccionInvalida(`Dirección ${direccionId} no existe`);
    }
  }

  // ---- resolución para leaderboard ----
  /**
   * Resuelve un conjunto de direcciones a sus entidades.
   * Devuelve un mapa {address → {entidadId, nombre}}.
   */
  async resolverDirecciones(
    valores: ReadonlyArray<string>,
  ): Promise<Map<string, { entidadId: string; nombre: string }>> {
    if (valores.length === 0) return new Map();
    const normalized = valores.map((v) => v.trim().toLowerCase());
    const rows = await this.db
      .select({
        valor: direcciones.valor,
        entidadId: direcciones.entidadId,
        nombre: entidades.nombre,
      })
      .from(direcciones)
      .innerJoin(entidades, eq(direcciones.entidadId, entidades.id))
      .where(
        // PostgreSQL acepta ANY($1::text[])
        or(...normalized.map((v) => eq(direcciones.valor, v))),
      );
    const map = new Map<string, { entidadId: string; nombre: string }>();
    for (const r of rows) {
      map.set(r.valor, { entidadId: r.entidadId, nombre: r.nombre });
    }
    return map;
  }

  // ---- helpers ----

  private async contarEntidades(where: SQL | undefined): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(entidades)
      .where(where);
    return Number(row?.value ?? 0);
  }

  private async contarDireccionesPorEntidad(
    ids: string[],
  ): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ entidadId: direcciones.entidadId })
      .from(direcciones)
      .where(or(...ids.map((id) => eq(direcciones.entidadId, id))));
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.entidadId, (map.get(r.entidadId) ?? 0) + 1);
    }
    return map;
  }
}
