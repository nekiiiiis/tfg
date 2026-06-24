/**
 * Endpoint para enriquecer la tabla del leaderboard con saldos por address.
 *
 *   POST /api/leaderboard/saldos
 *   body: { mercado, token, addresses: string[] }
 *   → { mercado, token, tokenSymbol, saldos: LeaderboardBalance[] }
 *
 * Se acepta como máximo `LeaderboardBalancesService.maxBatch` direcciones por
 * llamada (configurado a 100). Si vienen más, las restantes se ignoran;
 * el front es responsable de pedir por páginas si quiere más.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MERCADOS, esAddressValida } from '../../domain/types.ts';
import type { LeaderboardBalancesService } from './leaderboard-balances.service.ts';

const bodySchema = z.object({
  mercado: z.enum(MERCADOS),
  token: z.string().min(1).max(64),
  addresses: z
    .array(z.string().refine(esAddressValida, 'Dirección inválida'))
    .min(1)
    .max(100),
});

export function registerLeaderboardBalancesRoutes(
  app: FastifyInstance,
  service: LeaderboardBalancesService,
): void {
  app.post('/leaderboard/saldos', async (req) => {
    const { mercado, token, addresses } = bodySchema.parse(req.body);
    const saldos = await service.getBatch(mercado, token, addresses);
    return {
      mercado,
      token,
      tokenSymbol: saldos[0]?.tokenSymbol ?? token,
      saldos,
    };
  });
}
