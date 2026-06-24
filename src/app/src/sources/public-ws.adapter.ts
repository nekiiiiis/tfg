/**
 * Adaptador activo de la fuente Hyperliquid: WebSocket público + REST /info.
 *
 * - Mantiene UNA conexión WebSocket multiplexada con suscripciones bajo demanda
 *   (`subscribe-trades` / `subscribe-allMids`).
 * - Reconecta con backoff exponencial al perder conexión y re-suscribe los
 *   canales que tenía activos.
 * - Para datos puntuales (saldos, fills, staking) llama al endpoint REST
 *   `POST /info` con el `type` correspondiente.
 *
 * El cuerpo de los mensajes WS de Hyperliquid se documenta en:
 *   https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket
 */

import WebSocket, { type RawData } from 'ws';
import { logger } from '../shared/logger.ts';
import type {
  Address,
  Mercado,
  Operacion,
  TokenSymbol,
} from '../domain/types.ts';
import type {
  AllMidsMap,
  ClearinghouseSummary,
  Fill,
  IHyperliquidSource,
  PosicionPerp,
  SaldosSpot,
  StakingSummary,
  Unsubscribe,
} from './hyperliquid.port.ts';

interface AdapterOptions {
  wsUrl: string;
  infoUrl: string;
  /** Mercado por defecto a asignar a las operaciones publicadas. */
  defaultMercado?: Mercado;
  /** Intervalo mínimo entre llamadas a `/info` (anti rate-limit). */
  infoMinIntervalMs?: number;
  /** Intervalo mínimo para `recentTrades` (más agresivo que el resto). */
  tradesInfoMinIntervalMs?: number;
  /** Número máximo de reintentos ante 429/timeouts. */
  infoMaxRetries?: number;
}

type TradeListener = (op: Operacion) => void;
type MidsListener = (mids: AllMidsMap) => void;

interface TradeSubscription {
  token: TokenSymbol;
  listeners: Set<TradeListener>;
}

const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 5000, 10_000, 20_000, 30_000];

/**
 * Token bucket cooperativo: serializa llamadas dejando al menos
 * `intervalMs` entre dos peticiones. Cuando hay varias en cola, las
 * encadena sin permitir ráfagas.
 */
class TokenBucket {
  private nextSlot = 0;
  constructor(private readonly intervalMs: number) {}
  async acquire(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.intervalMs;
    const wait = slot - now;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
}

export class PublicWsAdapter implements IHyperliquidSource {
  readonly name = 'public-ws';

  private ws: WebSocket | null = null;
  private connecting = false;
  private explicitlyClosed = false;
  private reconnectAttempts = 0;
  private lastMsgAt: number | null = null;
  private readonly lastTradeAtPerCoin = new Map<TokenSymbol, number>();

  private readonly tradeSubs = new Map<TokenSymbol, TradeSubscription>();
  private readonly midsListeners = new Set<MidsListener>();
  /** Mensajes pendientes de enviar hasta que se abra el socket. */
  private readonly pendingSends: string[] = [];

  private readonly infoBucket: TokenBucket;
  /** Cola rápida sólo para `recentTrades` (leaderboard). */
  private readonly tradesInfoBucket: TokenBucket;
  private readonly infoMaxRetries: number;

  constructor(private readonly opts: AdapterOptions) {
    this.infoBucket = new TokenBucket(opts.infoMinIntervalMs ?? 350);
    this.tradesInfoBucket = new TokenBucket(opts.tradesInfoMinIntervalMs ?? 80);
    this.infoMaxRetries = opts.infoMaxRetries ?? 4;
  }

  // ----- API pública (IHyperliquidSource) -----

  async subscribeTrades(
    token: TokenSymbol,
    onTrade: TradeListener,
  ): Promise<Unsubscribe> {
    await this.ensureConnection();
    let sub = this.tradeSubs.get(token);
    if (!sub) {
      sub = { token, listeners: new Set() };
      this.tradeSubs.set(token, sub);
      this.send({
        method: 'subscribe',
        subscription: { type: 'trades', coin: token },
      });
    }
    sub.listeners.add(onTrade);
    return () => this.unsubscribeTrades(token, onTrade);
  }

  async subscribeAllMids(onMids: MidsListener): Promise<Unsubscribe> {
    await this.ensureConnection();
    const first = this.midsListeners.size === 0;
    this.midsListeners.add(onMids);
    if (first) {
      this.send({ method: 'subscribe', subscription: { type: 'allMids' } });
    }
    return () => {
      this.midsListeners.delete(onMids);
      if (this.midsListeners.size === 0) {
        this.send({
          method: 'unsubscribe',
          subscription: { type: 'allMids' },
        });
      }
    };
  }

  async getSpotState(address: Address): Promise<SaldosSpot> {
    const res = await this.callInfo({
      type: 'spotClearinghouseState',
      user: address,
    });
    type R = {
      balances?: Array<{
        coin: string;
        total: string;
        hold: string;
        entryNtl?: string;
      }>;
    };
    const r = res as R;
    return {
      balances: (r.balances ?? []).map((b) => ({
        token: b.coin,
        total: Number(b.total),
        hold: Number(b.hold),
        entryNtl: b.entryNtl !== undefined ? Number(b.entryNtl) : undefined,
      })),
    };
  }

  async getPerpState(address: Address): Promise<ClearinghouseSummary> {
    const res = await this.callInfo({
      type: 'clearinghouseState',
      user: address,
    });
    type R = {
      assetPositions?: Array<{
        position: {
          coin: string;
          szi: string;
          entryPx?: string;
          markPx?: string;
          liquidationPx?: string | null;
          positionValue?: string;
          unrealizedPnl?: string;
          returnOnEquity?: string;
          marginUsed?: string;
          maxLeverage?: number;
          leverage?: { value?: number; type?: string; rawUsd?: string };
          cumFunding?: {
            allTime?: string;
            sinceOpen?: string;
            sinceChange?: string;
          };
        };
      }>;
      marginSummary?: {
        accountValue?: string;
        totalNtlPos?: string;
        totalRawUsd?: string;
      };
      crossMarginSummary?: { marginUsed?: string };
      withdrawable?: string;
      crossMaintenanceMarginUsed?: string;
    };
    const r = res as R;
    const posiciones: PosicionPerp[] = (r.assetPositions ?? []).map((p) => {
      const pos = p.position;
      const liq = pos.liquidationPx;
      return {
        token: pos.coin,
        szi: Number(pos.szi),
        entryPx: Number(pos.entryPx ?? 0),
        markPx: pos.markPx !== undefined ? Number(pos.markPx) : undefined,
        liquidationPx:
          liq !== undefined && liq !== null && liq !== ''
            ? Number(liq)
            : undefined,
        positionValue: Number(pos.positionValue ?? 0),
        unrealizedPnl: Number(pos.unrealizedPnl ?? 0),
        returnOnEquity:
          pos.returnOnEquity !== undefined
            ? Number(pos.returnOnEquity)
            : undefined,
        leverage: Number(pos.leverage?.value ?? 0),
        leverageType: pos.leverage?.type,
        maxLeverage: pos.maxLeverage,
        marginUsed:
          pos.marginUsed !== undefined ? Number(pos.marginUsed) : undefined,
        cumFundingSinceOpen:
          pos.cumFunding?.sinceOpen !== undefined
            ? Number(pos.cumFunding.sinceOpen)
            : undefined,
        cumFundingAllTime:
          pos.cumFunding?.allTime !== undefined
            ? Number(pos.cumFunding.allTime)
            : undefined,
      };
    });
    return {
      posiciones,
      marginUsed: Number(r.crossMarginSummary?.marginUsed ?? 0),
      totalNtlPos: Number(r.marginSummary?.totalNtlPos ?? 0),
      totalRawUsd: Number(r.marginSummary?.totalRawUsd ?? 0),
      accountValue: Number(r.marginSummary?.accountValue ?? 0),
      withdrawable:
        r.withdrawable !== undefined ? Number(r.withdrawable) : undefined,
      crossMaintenanceMarginUsed:
        r.crossMaintenanceMarginUsed !== undefined
          ? Number(r.crossMaintenanceMarginUsed)
          : undefined,
    };
  }

  async getStakingSummary(address: Address): Promise<StakingSummary> {
    const [summary, delegations] = await Promise.all([
      this.callInfo({ type: 'delegatorSummary', user: address }),
      this.callInfo({ type: 'delegations', user: address }),
    ]);
    type SumR = {
      delegated?: string;
      undelegated?: string;
      totalPendingWithdrawal?: string;
      nPendingWithdrawals?: number;
    };
    type DelR = Array<{
      validator: string;
      amount: string;
      lockedUntilTimestamp?: number;
    }>;
    const s = summary as SumR;
    const d = delegations as DelR;
    return {
      delegated: Number(s.delegated ?? 0),
      undelegated: Number(s.undelegated ?? 0),
      totalPendingWithdrawal: Number(s.totalPendingWithdrawal ?? 0),
      nPendingWithdrawals: Number(s.nPendingWithdrawals ?? 0),
      delegations: d.map((x) => ({
        validator: x.validator,
        amount: Number(x.amount),
        lockedUntilTimestamp: Number(x.lockedUntilTimestamp ?? 0),
      })),
    };
  }

  async getUserFills(address: Address, since?: number): Promise<Fill[]> {
    const req: Record<string, unknown> = { type: 'userFills', user: address };
    if (since !== undefined) req['startTime'] = since;
    const res = await this.callInfo(req);
    type R = Array<{
      coin: string;
      px: string;
      sz: string;
      side: 'A' | 'B' | 'BUY' | 'SELL';
      time: number;
      hash?: string;
      fee?: string;
      closedPnl?: string;
      dir?: string;
    }>;
    const r = res as R;
    return r.map((f) => ({
      coin: f.coin,
      px: Number(f.px),
      sz: Number(f.sz),
      // En el feed de Hyperliquid 'B' es BUY y 'A' es SELL (ask).
      side: f.side === 'B' || f.side === 'BUY' ? 'BUY' : 'SELL',
      time: f.time,
      hash: f.hash,
      fee: f.fee !== undefined ? Number(f.fee) : undefined,
      closedPnl: f.closedPnl !== undefined ? Number(f.closedPnl) : undefined,
      dir: f.dir,
    }));
  }

  lastMessageAt(): number | null {
    return this.lastMsgAt;
  }

  lastTradeAt(coin: TokenSymbol): number | null {
    return this.lastTradeAtPerCoin.get(coin) ?? null;
  }

  async close(): Promise<void> {
    this.explicitlyClosed = true;
    this.tradeSubs.clear();
    this.midsListeners.clear();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  // ----- gestión WS -----

  private async ensureConnection(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connecting) {
      // Esperamos a que termine la conexión en curso.
      await new Promise<void>((resolve) => {
        const check = () => {
          if (
            this.ws?.readyState === WebSocket.OPEN ||
            this.explicitlyClosed
          ) {
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
      return;
    }
    this.connect();
  }

  private connect(): void {
    if (this.connecting || this.explicitlyClosed) return;
    this.connecting = true;
    const url = this.opts.wsUrl;
    logger.info({ url, name: this.name }, 'Connecting to Hyperliquid WS');

    const ws = new WebSocket(url, { handshakeTimeout: 10_000 });
    this.ws = ws;

    ws.on('open', () => {
      this.connecting = false;
      this.reconnectAttempts = 0;
      logger.info({ name: this.name }, 'Hyperliquid WS connected');
      // Drenar pendientes.
      for (const m of this.pendingSends.splice(0)) ws.send(m);
      // Re-suscribir lo que estaba activo.
      for (const sub of this.tradeSubs.values()) {
        ws.send(
          JSON.stringify({
            method: 'subscribe',
            subscription: { type: 'trades', coin: sub.token },
          }),
        );
      }
      if (this.midsListeners.size > 0) {
        ws.send(
          JSON.stringify({
            method: 'subscribe',
            subscription: { type: 'allMids' },
          }),
        );
      }
    });

    ws.on('message', (raw: RawData) => {
      this.lastMsgAt = Date.now();
      try {
        this.handleMessage(raw.toString('utf8'));
      } catch (err) {
        logger.warn({ err }, 'Failed to handle WS message');
      }
    });

    ws.on('close', (code) => {
      this.connecting = false;
      this.ws = null;
      if (this.explicitlyClosed) return;
      const delay =
        RECONNECT_BACKOFF_MS[
          Math.min(this.reconnectAttempts, RECONNECT_BACKOFF_MS.length - 1)
        ];
      this.reconnectAttempts += 1;
      logger.warn(
        { code, delay, attempt: this.reconnectAttempts },
        'Hyperliquid WS closed, scheduling reconnect',
      );
      setTimeout(() => this.connect(), delay);
    });

    ws.on('error', (err) => {
      logger.error({ err: String(err) }, 'Hyperliquid WS error');
    });
  }

  private send(payload: unknown): void {
    const msg = JSON.stringify(payload);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      this.pendingSends.push(msg);
      this.ensureConnection().catch(() => undefined);
    }
  }

  private handleMessage(text: string): void {
    let msg: { channel?: string; data?: unknown };
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (!msg || typeof msg.channel !== 'string') return;

    switch (msg.channel) {
      case 'trades':
        this.dispatchTrades(msg.data as RawTrade[]);
        break;
      case 'allMids':
        this.dispatchMids(msg.data as RawAllMids);
        break;
      case 'subscriptionResponse':
      case 'pong':
        // Ack, ignoramos.
        break;
      default:
        // Otros canales no nos interesan en It.1.
        break;
    }
  }

  private dispatchTrades(trades: RawTrade[]): void {
    if (!Array.isArray(trades) || trades.length === 0) return;
    const mercadoDefault = this.opts.defaultMercado ?? 'PerpNativo';
    const now = Date.now();
    for (const t of trades) {
      const token = t.coin;
      this.lastTradeAtPerCoin.set(token, now);
      const sub = this.tradeSubs.get(token);
      if (!sub || sub.listeners.size === 0) continue;
      const px = Number(t.px);
      const sz = Number(t.sz);
      if (!Number.isFinite(px) || !Number.isFinite(sz)) continue;
      const raw = pickTaker(t.users) ?? t.users?.[0] ?? '0x';
      const op: Operacion = {
        token,
        mercado: this.resolverMercado(token, mercadoDefault),
        // Cuando hay un único taker, t.users tiene [maker, taker].
        // Imputamos la operación al taker (el que cruzó el precio).
        direccion: raw.toLowerCase(),
        volumenUsd: px * sz,
        lado: t.side === 'B' ? 'BUY' : 'SELL',
        ts: Number(t.time) || Date.now(),
        tid: t.hash,
      };
      for (const l of sub.listeners) l(op);
    }
  }

  private dispatchMids(raw: RawAllMids): void {
    if (this.midsListeners.size === 0 || !raw || !raw.mids) return;
    const mids: AllMidsMap = {};
    for (const [k, v] of Object.entries(raw.mids)) {
      const n = Number(v);
      if (Number.isFinite(n)) mids[k] = n;
    }
    for (const l of this.midsListeners) l(mids);
  }

  /**
   * Heurística mínima para distinguir mercados. En It.1 lo dejamos como
   * `defaultMercado`; en iteraciones siguientes resolveremos contra el
   * catálogo de metadatos de Hyperliquid.
   */
  private resolverMercado(_token: TokenSymbol, fallback: Mercado): Mercado {
    return fallback;
  }

  private unsubscribeTrades(token: TokenSymbol, onTrade: TradeListener): void {
    const sub = this.tradeSubs.get(token);
    if (!sub) return;
    sub.listeners.delete(onTrade);
    if (sub.listeners.size === 0) {
      this.tradeSubs.delete(token);
      this.send({
        method: 'unsubscribe',
        subscription: { type: 'trades', coin: token },
      });
    }
  }

  // ----- REST /info -----

  /**
   * Ejecuta `POST /info` con throttle y reintentos:
   *   - TokenBucket → respeta intervalo mínimo entre llamadas (anti 429).
   *   - 429 / red caída → backoff exponencial con jitter.
   *   - Se respeta el header `Retry-After` cuando viene.
   */
  private async callInfo(
    body: Record<string, unknown>,
    bucket: TokenBucket = this.infoBucket,
  ): Promise<unknown> {
    let intento = 0;
    let lastErr: unknown;
    while (intento <= this.infoMaxRetries) {
      await bucket.acquire();
      try {
        const res = await fetch(this.opts.infoUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status === 429) {
          const ra = Number(res.headers.get('retry-after'));
          const wait =
            Number.isFinite(ra) && ra > 0
              ? ra * 1000
              : Math.min(
                  8_000,
                  400 * 2 ** intento + Math.floor(Math.random() * 200),
                );
          await new Promise((r) => setTimeout(r, wait));
          intento += 1;
          continue;
        }
        if (!res.ok) {
          throw new Error(
            `Hyperliquid /info ${body['type']} → HTTP ${res.status}`,
          );
        }
        return await res.json();
      } catch (err) {
        lastErr = err;
        const wait = Math.min(
          5_000,
          300 * 2 ** intento + Math.floor(Math.random() * 200),
        );
        await new Promise((r) => setTimeout(r, wait));
        intento += 1;
      }
    }
    throw new Error(
      `Hyperliquid /info ${body['type']} agotó reintentos: ${
        (lastErr as Error)?.message ?? 'desconocido'
      }`,
    );
  }

  /** Trades recientes para un coin. Devuelve siempre ascendente por ts. */
  async getRecentTrades(coin: TokenSymbol): Promise<Operacion[]> {
    const res = (await this.callInfo(
      {
        type: 'recentTrades',
        coin,
      },
      this.tradesInfoBucket,
    )) as RawTrade[] | null;
    if (!Array.isArray(res)) return [];
    const mercadoDefault = this.opts.defaultMercado ?? 'PerpNativo';
    const out: Operacion[] = [];
    for (const t of res) {
      const px = Number(t.px);
      const sz = Number(t.sz);
      if (!Number.isFinite(px) || !Number.isFinite(sz)) continue;
      const taker = pickTaker(t.users) ?? t.users?.[0];
      if (!taker) continue;
      out.push({
        token: coin,
        mercado: this.resolverMercado(coin, mercadoDefault),
        direccion: taker.toLowerCase(),
        volumenUsd: px * sz,
        lado: t.side === 'B' ? 'BUY' : 'SELL',
        ts: Number(t.time) || Date.now(),
        tid: t.hash,
      });
    }
    out.sort((a, b) => a.ts - b.ts);
    return out;
  }
}

// ---- formas de los payloads WS de Hyperliquid (subset que usamos) ----

interface RawTrade {
  coin: string;
  side: 'A' | 'B';
  px: string;
  sz: string;
  time: number;
  hash?: string;
  /** [maker, taker] en exchanges Hyperliquid. */
  users?: [string, string];
}

interface RawAllMids {
  mids: Record<string, string>;
}

function pickTaker(users?: [string, string]): string | null {
  if (!users || users.length < 2) return null;
  return users[1] ?? null;
}
