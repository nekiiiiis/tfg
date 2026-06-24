/**
 * Factory de fuente Hyperliquid.
 *
 * Selecciona el adaptador según `HYPERLIQUID_SOURCE` y lo construye con los
 * parámetros del entorno. Es el único punto del proceso que conoce ambas
 * implementaciones — el resto del código depende sólo de `IHyperliquidSource`.
 */

import { config } from '../config.ts';
import { logger } from '../shared/logger.ts';
import type { IHyperliquidSource } from './hyperliquid.port.ts';
import { PublicWsAdapter } from './public-ws.adapter.ts';
import { NanorethRpcAdapter } from './nanoreth-rpc.adapter.ts';

export function createHyperliquidSource(): IHyperliquidSource {
  if (config.HYPERLIQUID_SOURCE === 'nanoreth') {
    logger.info('Hyperliquid source: nanoreth (RPC)');
    return new NanorethRpcAdapter({ rpcUrl: config.NANORETH_RPC_URL });
  }
  logger.info('Hyperliquid source: public-ws');
  return new PublicWsAdapter({
    wsUrl: config.HYPERLIQUID_WS_URL,
    infoUrl: config.HYPERLIQUID_INFO_URL,
    infoMinIntervalMs: config.HYPERLIQUID_INFO_MIN_INTERVAL_MS,
    tradesInfoMinIntervalMs: config.HYPERLIQUID_TRADES_INFO_MIN_INTERVAL_MS,
  });
}

export type { IHyperliquidSource } from './hyperliquid.port.ts';
