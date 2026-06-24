/**
 * Puerto de salida hacia la L1 de Hyperliquid (RS-08).
 *
 * El núcleo no conoce el protocolo concreto: la implementación se inyecta
 * en `sources/index.ts` y se selecciona por la variable de entorno
 * `HYPERLIQUID_SOURCE`.
 *
 * Existen dos implementaciones planificadas:
 *  - PublicWsAdapter — feed público WebSocket + REST `/info` (activo)
 *  - NanorethRpcAdapter — JSON-RPC contra un nodo nanoreth local (esqueleto)
 *
 * Esta interfaz es el contrato que ambas deben respetar.
 */

import type {
  Address,
  Operacion,
  TokenSymbol,
} from '../domain/types.ts';

export type Unsubscribe = () => void;

/**
 * Diccionario `token → precio` para `allMids`. Las claves son los símbolos
 * que devuelve Hyperliquid; el adaptador es responsable de normalizar a
 * `TokenSymbol`.
 */
export type AllMidsMap = Record<TokenSymbol, number>;

export interface SaldoSpot {
  /** Símbolo crudo como lo devuelve Hyperliquid (`USDC`, `HYPE`, `@107`…). */
  token: TokenSymbol;
  total: number;
  hold: number;
  entryNtl?: number;
}

export interface PosicionPerp {
  /** Coin tal como llega de Hyperliquid: `BTC` (nativo) o `dex:SYMBOL` (HIP-3). */
  token: TokenSymbol;
  /** Tamaño con signo: positivo = long, negativo = short. */
  szi: number;
  entryPx: number;
  /** Precio mark del momento de la consulta (cuando lo devuelve la API). */
  markPx?: number;
  /** Precio de liquidación estimado. */
  liquidationPx?: number;
  positionValue: number;
  unrealizedPnl: number;
  /** Porcentaje de retorno sobre margen (return on equity). */
  returnOnEquity?: number;
  /** Apalancamiento efectivo (value). */
  leverage: number;
  /** 'cross' | 'isolated'. */
  leverageType?: string;
  /** Apalancamiento máximo permitido por el mercado. */
  maxLeverage?: number;
  /** Margen usado por esta posición. */
  marginUsed?: number;
  /** Funding pagado/recibido desde que se abrió la posición. */
  cumFundingSinceOpen?: number;
  /** Funding acumulado de toda la vida de la cuenta para este coin. */
  cumFundingAllTime?: number;
}

export interface ClearinghouseSummary {
  posiciones: PosicionPerp[];
  marginUsed: number;
  totalNtlPos: number;
  totalRawUsd: number;
  accountValue: number;
  /** Saldo retirable (puede salir a spot). */
  withdrawable?: number;
  /** Margen de mantenimiento usado en cross. */
  crossMaintenanceMarginUsed?: number;
}

export interface SaldosSpot {
  balances: SaldoSpot[];
}

export interface Delegation {
  validator: string;
  amount: number;
  lockedUntilTimestamp: number;
}

export interface StakingSummary {
  delegated: number;
  undelegated: number;
  totalPendingWithdrawal: number;
  nPendingWithdrawals: number;
  delegations: Delegation[];
}

export interface Fill {
  coin: TokenSymbol;
  px: number;
  sz: number;
  side: 'BUY' | 'SELL';
  time: number; // epoch ms
  hash?: string;
  fee?: number;
  closedPnl?: number;
  dir?: string;
}

/**
 * Resultado de una suscripción a trades. Se emite una `Operacion` por trade,
 * ya normalizada al dominio (volumen en USD, mercado resuelto).
 */
export interface IHyperliquidSource {
  /** Nombre legible para logs y health-check. */
  readonly name: string;

  /**
   * Suscribe a los trades en vivo de un token. El callback se invoca por
   * cada trade individual (no por batch agregado).
   */
  subscribeTrades(
    token: TokenSymbol,
    onTrade: (op: Operacion) => void,
  ): Promise<Unsubscribe>;

  /**
   * Suscribe al canal `allMids` (precios medios de todos los tokens listados).
   * El callback recibe el snapshot completo cada vez que llega un mensaje.
   */
  subscribeAllMids(onMids: (mids: AllMidsMap) => void): Promise<Unsubscribe>;

  /**
   * Trades recientes de un coin (REST `/info recentTrades`). Devuelve los
   * últimos ~500 trades ya normalizados al dominio (`Operacion`), ordenados
   * de más antiguo a más reciente. Pensado para hacer backfill cuando se abre
   * un canal de leaderboard y para *polling* de seguridad ante huecos del WS.
   */
  getRecentTrades(coin: TokenSymbol): Promise<Operacion[]>;

  /** Estado spot (saldos) de una dirección. */
  getSpotState(address: Address): Promise<SaldosSpot>;

  /** Estado perp (clearinghouse) de una dirección. */
  getPerpState(address: Address): Promise<ClearinghouseSummary>;

  /** Resumen de staking + delegaciones de una dirección. */
  getStakingSummary(address: Address): Promise<StakingSummary>;

  /** Últimas operaciones (fills) ejecutadas por una dirección. */
  getUserFills(address: Address, since?: number): Promise<Fill[]>;

  /**
   * Marca temporal en ms del último mensaje recibido en vivo (cualquier canal).
   * El health-check lo consulta para detectar feeds obsoletos.
   * Devuelve `null` si aún no se ha recibido ningún mensaje.
   */
  lastMessageAt(): number | null;

  /**
   * Último trade en vivo por WS para un coin concreto. Devuelve `null` si
   * todavía no se ha recibido ningún trade de ese coin.
   * El leaderboard usa esto para decidir si hace poll REST por canal.
   */
  lastTradeAt(coin: TokenSymbol): number | null;

  /** Cierra todas las conexiones. */
  close(): Promise<void>;
}
