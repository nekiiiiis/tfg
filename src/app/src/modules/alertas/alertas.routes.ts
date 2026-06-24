/**
 * Rutas REST de Alertas (CU-09..CU-12).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CRUCES,
  ESTADOS_ALERTA,
  MERCADOS,
  esTokenValido,
} from '../../domain/types.ts';
import type { AlertasService } from './alertas.service.ts';

const crearSchema = z.object({
  token: z.string().refine(esTokenValido, 'Formato de token inválido'),
  mercado: z.enum(MERCADOS),
  umbralValor: z.number().positive(),
  umbralCruce: z.enum(CRUCES),
  webhookUrl: z.string().url().max(2048),
});
const editarSchema = z.object({
  token: z.string().refine(esTokenValido, 'Formato de token inválido').optional(),
  mercado: z.enum(MERCADOS).optional(),
  umbralValor: z.number().positive().optional(),
  umbralCruce: z.enum(CRUCES).optional(),
  webhookUrl: z.string().url().max(2048).optional(),
});
const listarQuery = z.object({
  estado: z.enum(ESTADOS_ALERTA).optional(),
  token: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(200).optional(),
});
const idParam = z.object({ id: z.string().uuid() });

export function registerAlertasRoutes(
  app: FastifyInstance,
  service: AlertasService,
): void {
  // CU-09
  app.post('/alertas', async (req, reply) => {
    const body = crearSchema.parse(req.body);
    const result = await service.crear(body);
    return reply.status(201).send(result);
  });

  // CU-10
  app.get('/alertas', async (req) => {
    const q = listarQuery.parse(req.query);
    return service.listar({
      estado: q.estado,
      token: q.token,
      page: q.page,
      size: q.size,
    });
  });

  // Detalle (compatible con UI; no rompe la cobertura CRUD).
  app.get('/alertas/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    return service.obtener(id);
  });

  // CU-11
  app.patch('/alertas/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = editarSchema.parse(req.body);
    return service.editar(id, body);
  });

  // CU-12
  app.delete('/alertas/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await service.eliminar(id);
    return reply.status(204).send();
  });
}
