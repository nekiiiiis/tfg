/**
 * Rutas REST del Catálogo (CU-02..CU-08).
 *
 * Convenciones (cap. 3, diseñoCdU):
 *   - 201 en creación, 200 en consulta/edición, 204 en eliminación.
 *   - 409 conflicto, 404 inexistente, 422 validación.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { esAddressValida } from '../../domain/types.ts';
import type { CatalogoService } from './catalogo.service.ts';

const crearEntidadSchema = z.object({
  nombre: z.string().min(1).max(64),
});
const editarEntidadSchema = crearEntidadSchema;
const listarEntidadesQuery = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(200).optional(),
});
const idParam = z.object({ id: z.string().uuid() });
const aniadirDireccionSchema = z.object({
  valor: z
    .string()
    .refine((v) => esAddressValida(v), {
      message: 'Formato de dirección inválido (esperado 0x + 40 hex)',
    }),
});
const dirIdParam = z.object({
  id: z.string().uuid(),
  direccionId: z.string().uuid(),
});

export function registerCatalogoRoutes(
  app: FastifyInstance,
  service: CatalogoService,
): void {
  // CU-02
  app.post('/entidades', async (req, reply) => {
    const body = crearEntidadSchema.parse(req.body);
    const entidad = await service.crearEntidad(body.nombre);
    return reply.status(201).send(entidad);
  });

  // CU-03
  app.get('/entidades', async (req) => {
    const q = listarEntidadesQuery.parse(req.query);
    const page = await service.listarEntidades({
      query: q.q,
      page: q.page,
      size: q.size,
    });
    return page;
  });

  // CU-04
  app.patch('/entidades/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = editarEntidadSchema.parse(req.body);
    return service.editarEntidad(id, body.nombre);
  });

  // CU-05
  app.delete('/entidades/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await service.eliminarEntidad(id);
    return reply.status(204).send();
  });

  // CU-06
  app.post('/entidades/:id/direcciones', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = aniadirDireccionSchema.parse(req.body);
    const dir = await service.aniadirDireccion(id, body.valor);
    return reply.status(201).send(dir);
  });

  // CU-07
  const listarDireccionesQuery = z.object({
    q: z.string().optional(),
  });
  app.get('/entidades/:id/direcciones', async (req) => {
    const { id } = idParam.parse(req.params);
    const q = listarDireccionesQuery.parse(req.query);
    return service.listarDirecciones(id, { query: q.q });
  });

  // CU-08
  app.delete('/entidades/:id/direcciones/:direccionId', async (req, reply) => {
    const { direccionId } = dirIdParam.parse(req.params);
    await service.eliminarDireccion(direccionId);
    return reply.status(204).send();
  });

  // Resolución masiva (utilizada internamente por el front del leaderboard).
  const resolverSchema = z.object({
    direcciones: z.array(z.string()).min(1).max(500),
  });
  app.post('/direcciones/resolver', async (req) => {
    const body = resolverSchema.parse(req.body);
    const mapped = await service.resolverDirecciones(body.direcciones);
    return {
      entradas: Array.from(mapped.entries()).map(([valor, info]) => ({
        valor,
        entidadId: info.entidadId,
        nombre: info.nombre,
      })),
    };
  });
}
