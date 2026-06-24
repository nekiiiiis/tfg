/**
 * Rutas REST de detalle global de dirección (extensión de CU-07).
 *
 * Rutas:
 *   GET /api/direcciones/:addr/spot     → SpotSummaryDTO
 *   GET /api/direcciones/:addr/perps    → PerpSummaryDTO
 *   GET /api/direcciones/:addr/staking  → StakingSummaryDTO
 *   GET /api/direcciones/:addr/fills?since=<epoch_ms>  → FillDTO[]
 *
 * Todos los tokens vienen ya mapeados al display token (`HYPE.p`,
 * `HYPE/USDC`, `xyz:SP500`).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { esAddressValida } from '../../domain/types.ts';
import type { AddressDetailService } from './address-detail.service.ts';

const addrParam = z.object({
  addr: z.string().refine(esAddressValida, 'Dirección con formato inválido'),
});
const fillsQuery = z.object({
  since: z.coerce.number().int().nonnegative().optional(),
});

export function registerDireccionDetalleRoutes(
  app: FastifyInstance,
  service: AddressDetailService,
): void {
  app.get('/direcciones/:addr/spot', async (req) => {
    const { addr } = addrParam.parse(req.params);
    return service.spot(addr);
  });
  app.get('/direcciones/:addr/perps', async (req) => {
    const { addr } = addrParam.parse(req.params);
    return service.perps(addr);
  });
  app.get('/direcciones/:addr/staking', async (req) => {
    const { addr } = addrParam.parse(req.params);
    return service.staking(addr);
  });
  app.get('/direcciones/:addr/fills', async (req) => {
    const { addr } = addrParam.parse(req.params);
    const { since } = fillsQuery.parse(req.query);
    return service.fills(addr, since);
  });
}
