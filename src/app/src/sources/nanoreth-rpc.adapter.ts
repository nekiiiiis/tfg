/**
 * Adaptador hacia un nodo nanoreth local (https://github.com/hl-archive-node/nanoreth).
 *
 * ESTADO: ESQUELETO.
 *
 * Diseño previsto:
 *  - Conexión JSON-RPC sobre HTTP a `NANORETH_RPC_URL` (p. ej.
 *    `http://nanoreth:8545`).
 *  - Suscripción a logs/eventos vía `eth_subscribe` sobre el endpoint WS del
 *    nodo (cuando esté disponible).
 *  - Recuperación de bloques con `eth_getBlockReceiptsWithSystemTx` para
 *    traducirlos al modelo de dominio (`Operacion`, `Precio`).
 *
 * La función `subscribeTrades` y compañía aún no están implementadas — al
 * estar el sistema diseñado tras `IHyperliquidSource`, la integración consiste
 * en completar este fichero (y cualquier helper que necesite) sin tocar el
 * núcleo.
 *
 * Para activarlo basta con poner `HYPERLIQUID_SOURCE=nanoreth` en `.env`.
 */

import { logger } from '../shared/logger.ts';
import type { Address, Operacion, TokenSymbol } from '../domain/types.ts';
import type {
  AllMidsMap,
  ClearinghouseSummary,
  Fill,
  IHyperliquidSource,
  SaldosSpot,
  StakingSummary,
  Unsubscribe,
} from './hyperliquid.port.ts';

interface AdapterOptions {
  rpcUrl: string;
}

export class NanorethRpcAdapter implements IHyperliquidSource {
  readonly name = 'nanoreth';

  constructor(private readonly opts: AdapterOptions) {
    logger.warn(
      { rpcUrl: this.opts.rpcUrl },
      'NanorethRpcAdapter instanciado — esqueleto pendiente de integración',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async subscribeTrades(
    _token: TokenSymbol,
    _onTrade: (op: Operacion) => void,
  ): Promise<Unsubscribe> {
    throw new Error('NanorethRpcAdapter.subscribeTrades: pending integration');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async subscribeAllMids(_onMids: (mids: AllMidsMap) => void): Promise<Unsubscribe> {
    throw new Error('NanorethRpcAdapter.subscribeAllMids: pending integration');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getRecentTrades(_coin: TokenSymbol): Promise<Operacion[]> {
    throw new Error('NanorethRpcAdapter.getRecentTrades: pending integration');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getSpotState(_address: Address): Promise<SaldosSpot> {
    throw new Error('NanorethRpcAdapter.getSpotState: pending integration');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getPerpState(_address: Address): Promise<ClearinghouseSummary> {
    throw new Error('NanorethRpcAdapter.getPerpState: pending integration');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getStakingSummary(_address: Address): Promise<StakingSummary> {
    throw new Error('NanorethRpcAdapter.getStakingSummary: pending integration');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getUserFills(_address: Address, _since?: number): Promise<Fill[]> {
    throw new Error('NanorethRpcAdapter.getUserFills: pending integration');
  }

  lastMessageAt(): number | null {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  lastTradeAt(_coin: TokenSymbol): number | null {
    return null;
  }

  async close(): Promise<void> {
    /* no-op hasta que haya conexión activa */
  }
}
