/**
 * Servicio de aplicación del leaderboard (CU-01).
 *
 * Resuelve `display token → feedCoin`, gestiona suscripciones WS y aplica una
 * política de polling REST adaptativa por canal:
 *
 *   - El WS de trades es la vía primaria (cada trade llega al instante).
 *   - El REST `recentTrades` actúa como red de seguridad:
 *       · si NO hay trades por WS recientes para ESE coin → poll rápido
 *         (típicamente cada 200–400 ms) hasta que vuelvan a llegar trades;
 *       · si SÍ hay trades frescos → poll lento (~1 s) anti-huecos;
 *       · si N polls consecutivos no traen novedades → relajamos hasta el
 *         máximo configurado (token poco activo).
 *
 *   - Dedupe por `tid` (hash de Hyperliquid) además de `ts > lastTs`, así un
 *     trade visto por WS no se re-ingerirá aunque venga también por REST.
 *
 * Esta capa NO conoce WebSocket de clientes ni HTTP: emite eventos al bus,
 * y el gateway WS de presentación los traduce a mensajes al navegador.
 */

import { bus } from '../../bus.ts';
import { logger } from '../../shared/logger.ts';
import type {
  Lado,
  Mercado,
  Operacion,
  Temporalidad,
  Terna,
  TokenSymbol,
} from '../../domain/types.ts';
import type {
  IHyperliquidSource,
  Unsubscribe as SourceUnsubscribe,
} from '../../sources/hyperliquid.port.ts';
import type { MetaService } from '../meta/meta.service.ts';
import {
  LeaderboardState,
  type LeaderboardSnapshot,
} from './leaderboard.state.ts';
import type { TradePersistence } from './trade-persistence.service.ts';

export const HARD_TOP_N_CAP = 1_000;
export const DEFAULT_TOP_N = 200;

/** Tamaño del set de hashes recientes (FIFO) para deduplicar entre WS y REST. */
const SEEN_TIDS_MAX = 4096;

/** Tope de trades cacheados por canal (todas las temporalidades comparten este buffer). */
const CHANNEL_TRADE_BUFFER_MAX = 50_000;

/**
 * Grace period antes de cerrar un canal sin suscriptores. Cubre el caso de
 * que el cliente cambie token/temporalidad rápidamente y queremos preservar
 * el buffer ya capturado del coin saliente por si vuelve enseguida.
 */
const CHANNEL_IDLE_GRACE_MS = 30_000;

/**
 * Máximo de canales que se mantienen abiertos en background ("keep-alive")
 * cuando ya no hay clientes mirándolos. Sirve para que el WS siga trayendo
 * trades y la BD acumule cobertura aunque nadie esté suscrito al token.
 * Cuando se supera, se desaloja al canal menos usado recientemente (LRU).
 */
const KEEPALIVE_MAX_CHANNELS = 30;

export interface PollPolicy {
  /** Poll mínimo (cuando el WS está silencioso y vimos novedades). */
  minIntervalMs: number;
  /** Poll máximo (token poco activo / WS estable). */
  maxIntervalMs: number;
  /** Poll cuando el WS de este coin recibió trades hace `< wsFreshMs`. */
  wsFreshMs: number;
  /** Si el WS es fresco, esperar este intervalo (anti-huecos). */
  freshIntervalMs: number;
  /** Polls vacíos consecutivos que doblan el intervalo (cap a `maxIntervalMs`). */
  emptyBackoffEvery: number;
}

const DEFAULT_POLL_POLICY: PollPolicy = {
  minIntervalMs: 200,
  maxIntervalMs: 1_500,
  wsFreshMs: 600,
  freshIntervalMs: 1_000,
  emptyBackoffEvery: 3,
};

interface TokenChannel {
  refcount: number;
  unsubscribe: SourceUnsubscribe;
  feedCoin: string;
  displayToken: TokenSymbol;
  mercado: Mercado;
  /** Último ts (ms) ingerido por backfill/poll. Dedupe primario. */
  lastBackfillTs: number;
  /** Set FIFO de tids vistos (por WS o REST). Dedupe secundario. */
  seenTids: Set<string>;
  seenTidsOrder: string[];
  /** Polls vacíos consecutivos (para backoff progresivo). */
  emptyPolls: number;
  pollTimer?: NodeJS.Timeout;
  /** Timer del grace period antes de cerrar definitivamente el canal. */
  closeTimer?: NodeJS.Timeout;
  /**
   * Buffer global de trades del canal, ordenado por ts. Comparte historia
   * entre todas las temporalidades del mismo (mercado, displayToken), de
   * modo que cambiar 1h→4h siembre la nueva ventana al instante con todo
   * lo que el server ya ha capturado del coin.
   */
  buffer: Operacion[];
  /**
   * Marca temporal de la última vez que el canal tuvo actividad relevante
   * (apertura o nuevo suscriptor). Usada para LRU del keep-alive.
   */
  lastTouchedAt: number;
  /** El canal sigue vivo sin suscriptores activos (keep-alive). */
  keepAlive: boolean;
}

export interface SubscribeOptions {
  topN?: number;
  lado?: Lado;
}

export class LeaderboardService {
  private readonly state: LeaderboardState;
  private readonly channels = new Map<string, TokenChannel>();
  private readonly ternasRefcount = new Map<string, number>();
  private readonly policy: PollPolicy;

  constructor(
    private readonly source: IHyperliquidSource,
    private readonly meta: MetaService,
    private readonly windowSeconds: Record<Temporalidad, number>,
    maxOpsPerTerna: number,
    policy: Partial<PollPolicy> = {},
    private readonly persistence?: TradePersistence,
  ) {
    this.state = new LeaderboardState(windowSeconds, maxOpsPerTerna);
    this.policy = { ...DEFAULT_POLL_POLICY, ...policy };
  }

  async subscribe(
    terna: Terna,
    opts: SubscribeOptions = {},
  ): Promise<{
    snapshot: LeaderboardSnapshot;
    unsubscribe: () => void;
  }> {
    const info = await this.meta.resolveToken(terna.mercado, terna.token);
    if (!info) {
      throw new Error(
        `Token desconocido para mercado ${terna.mercado}: ${terna.token}`,
      );
    }
    const ternaNorm: Terna = { ...terna, token: info.id };
    this.state.ensureTerna(ternaNorm);
    this.incrementTerna(ternaNorm);
    const channelOpened = await this.openTokenChannel(
      ternaNorm.mercado,
      info.id,
      info.feedCoin,
    );

    // Sembrado inmediato desde el buffer del canal: si otra temporalidad del
    // mismo coin ya tiene trades capturados, los aplicamos aquí ya filtrados
    // por nuestra ventana. Esto hace que cambiar 1h→4h sea instantáneo si
    // el server lleva tiempo viendo trades del coin.
    this.seedTernaFromChannelBuffer(ternaNorm);

    // Sembrado desde BD: historia real previa al arranque del proceso. La
    // ventana 1d/1w sólo es "real" si la BD lleva tiempo acumulando.
    await this.seedTernaFromDb(ternaNorm).catch((err) =>
      logger.warn(
        { err: (err as Error).message, terna: ternaNorm },
        'Seed desde BD falló — el snapshot arranca solo con buffer',
      ),
    );

    // Backfill REST en background (red de seguridad).
    void this.backfillTerna(ternaNorm, info.feedCoin, channelOpened).catch(
      (err) => {
        logger.warn(
          { err: (err as Error).message, terna: ternaNorm },
          'Backfill inicial falló — el snapshot empieza vacío',
        );
      },
    );

    const snapshot = this.state.snapshot(
      ternaNorm,
      clampTopN(opts.topN),
      opts.lado ?? 'ALL',
    );
    return {
      snapshot,
      unsubscribe: () => {
        this.decrementTerna(ternaNorm);
        this.closeTokenChannelIfIdle(ternaNorm.mercado, info.id);
      },
    };
  }

  snapshot(
    terna: Terna,
    topN: number = DEFAULT_TOP_N,
    lado: Lado = 'ALL',
  ): LeaderboardSnapshot {
    return this.state.snapshot(terna, clampTopN(topN), lado);
  }

  async close(): Promise<void> {
    for (const c of this.channels.values()) {
      if (c.pollTimer) clearTimeout(c.pollTimer);
      if (c.closeTimer) clearTimeout(c.closeTimer);
      try {
        c.unsubscribe();
      } catch {
        /* ignore */
      }
    }
    this.channels.clear();
  }

  // ---- gestión de canales ----

  private async openTokenChannel(
    mercado: Mercado,
    displayToken: TokenSymbol,
    feedCoin: string,
  ): Promise<boolean> {
    const key = `${mercado}|${displayToken}`;
    const existing = this.channels.get(key);
    if (existing) {
      existing.refcount += 1;
      existing.keepAlive = false;
      existing.lastTouchedAt = Date.now();
      // Si estaba en grace period, lo cancelamos: el canal vuelve a vivo.
      if (existing.closeTimer) {
        clearTimeout(existing.closeTimer);
        existing.closeTimer = undefined;
      }
      return false;
    }
    logger.info(
      { mercado, displayToken, feedCoin },
      'Abriendo canal Hyperliquid trades para token',
    );
    const channel: TokenChannel = {
      refcount: 1,
      unsubscribe: () => undefined,
      feedCoin,
      displayToken,
      mercado,
      lastBackfillTs: 0,
      seenTids: new Set(),
      seenTidsOrder: [],
      emptyPolls: 0,
      buffer: [],
      lastTouchedAt: Date.now(),
      keepAlive: false,
    };
    channel.unsubscribe = await this.source.subscribeTrades(feedCoin, (op) => {
      // Marcamos hash del WS para que el polling REST no lo re-ingiera.
      if (op.tid) this.rememberTid(channel, op.tid);
      const opNorm: Operacion = { ...op, token: displayToken, mercado };
      this.pushToChannelBuffer(channel, opNorm);
      this.persistence?.enqueue(opNorm);
      this.onTrade(mercado, opNorm);
    });
    this.channels.set(key, channel);
    this.enforceKeepAliveCap();

    // Poll inmediato + scheduler adaptativo.
    void this.pollChannel(channel).catch((err) => {
      logger.warn(
        { err: (err as Error).message, feedCoin, displayToken },
        'Poll inicial recentTrades falló',
      );
    });
    this.schedulePoll(channel);
    return true;
  }

  private schedulePoll(channel: TokenChannel): void {
    const delay = this.nextPollDelay(channel);
    channel.pollTimer = setTimeout(() => {
      if (channel.refcount <= 0) return;
      void this.pollChannel(channel)
        .catch((err) => {
          logger.warn(
            {
              err: (err as Error).message,
              feedCoin: channel.feedCoin,
              displayToken: channel.displayToken,
            },
            'Polling recentTrades falló',
          );
        })
        .finally(() => {
          if (channel.refcount > 0) this.schedulePoll(channel);
        });
    }, delay) as unknown as NodeJS.Timeout;
  }

  /**
   * Calcula el intervalo del próximo poll en función del estado del WS y de
   * cuántos polls consecutivos volvieron vacíos.
   */
  private nextPollDelay(channel: TokenChannel): number {
    const lastTrade = this.source.lastTradeAt(channel.feedCoin);
    const wsFresh =
      lastTrade !== null && Date.now() - lastTrade < this.policy.wsFreshMs;
    if (wsFresh) return this.policy.freshIntervalMs;
    const factor = 1 << Math.min(
      channel.emptyPolls / this.policy.emptyBackoffEvery,
      6,
    );
    return Math.min(
      this.policy.maxIntervalMs,
      Math.max(this.policy.minIntervalMs, Math.floor(this.policy.minIntervalMs * factor)),
    );
  }

  private closeTokenChannelIfIdle(
    mercado: Mercado,
    displayToken: TokenSymbol,
  ): void {
    const key = `${mercado}|${displayToken}`;
    const ch = this.channels.get(key);
    if (!ch) return;
    ch.refcount -= 1;
    if (ch.refcount > 0) return;
    // Tras el grace period, en vez de cerrar pasamos el canal a "keep-alive":
    // el WS sigue trayendo trades que se persisten en BD para enriquecer
    // ventanas largas. El cap LRU se aplica en `enforceKeepAliveCap`.
    if (ch.closeTimer) clearTimeout(ch.closeTimer);
    ch.closeTimer = setTimeout(() => {
      const current = this.channels.get(key);
      if (!current || current.refcount > 0) return;
      current.keepAlive = true;
      current.closeTimer = undefined;
      this.enforceKeepAliveCap();
    }, CHANNEL_IDLE_GRACE_MS) as unknown as NodeJS.Timeout;
  }

  /**
   * Mantiene el número de canales en keep-alive por debajo de
   * `KEEPALIVE_MAX_CHANNELS`. Cierra los menos usados recientemente.
   */
  private enforceKeepAliveCap(): void {
    const keepalives = Array.from(this.channels.values()).filter(
      (c) => c.keepAlive && c.refcount === 0,
    );
    if (keepalives.length <= KEEPALIVE_MAX_CHANNELS) return;
    keepalives.sort((a, b) => a.lastTouchedAt - b.lastTouchedAt);
    const toClose = keepalives.length - KEEPALIVE_MAX_CHANNELS;
    for (let i = 0; i < toClose; i += 1) {
      const ch = keepalives[i]!;
      const key = `${ch.mercado}|${ch.displayToken}`;
      logger.info(
        { mercado: ch.mercado, displayToken: ch.displayToken, feedCoin: ch.feedCoin },
        'Cerrando canal en keep-alive por límite LRU',
      );
      if (ch.pollTimer) clearTimeout(ch.pollTimer);
      try {
        ch.unsubscribe();
      } catch {
        /* ignore */
      }
      this.channels.delete(key);
    }
  }

  // ---- backfill / polling ----

  private async backfillTerna(
    terna: Terna,
    feedCoin: string,
    channelOpened: boolean,
  ): Promise<void> {
    const ops = await this.source.getRecentTrades(feedCoin);
    if (ops.length === 0) return;
    const channelKey = `${terna.mercado}|${terna.token}`;
    const channel = this.channels.get(channelKey);
    const filtered = channel ? this.filterUnseen(channel, ops) : ops;
    if (filtered.length === 0) return;
    const opsDisplay: Operacion[] = filtered.map((o) => ({
      ...o,
      token: terna.token,
      mercado: terna.mercado,
    }));
    if (channel) {
      channel.lastBackfillTs = opsDisplay[opsDisplay.length - 1]!.ts;
      for (const op of opsDisplay) this.pushToChannelBuffer(channel, op);
    }
    this.persistence?.enqueueMany(opsDisplay);

    if (channelOpened) {
      const temps = this.state.ternasActivasFor(terna.mercado, terna.token);
      for (const t of temps) {
        const tern: Terna = {
          mercado: terna.mercado,
          token: terna.token,
          temporalidad: t,
        };
        this.state.ingestBackfill(tern, opsDisplay);
        this.emitSnapshot(tern);
      }
    } else {
      this.state.ingestBackfill(terna, opsDisplay);
      this.emitSnapshot(terna);
    }
  }

  /**
   * Siembra el estado de una terna con los trades del buffer del canal que
   * caigan dentro de su ventana temporal. Idempotente (el state ya hace
   * dedupe por ts) y barato.
   */
  private seedTernaFromChannelBuffer(terna: Terna): void {
    const channel = this.channels.get(`${terna.mercado}|${terna.token}`);
    if (!channel || channel.buffer.length === 0) return;
    const windowMs = this.windowSeconds[terna.temporalidad] * 1000;
    const cutoff = Date.now() - windowMs;
    const ops = channel.buffer.filter((o) => o.ts >= cutoff);
    if (ops.length === 0) return;
    this.state.ingestBackfill(terna, ops);
    this.emitSnapshot(terna);
  }

  /**
   * Siembra el estado de una terna leyendo los trades persistidos en BD
   * dentro de su ventana temporal. Los marca como vistos en el canal para
   * que el polling REST posterior no los re-ingerir.
   */
  private async seedTernaFromDb(terna: Terna): Promise<void> {
    if (!this.persistence) return;
    const windowMs = this.windowSeconds[terna.temporalidad] * 1000;
    const cutoff = Date.now() - windowMs;
    const ops = await this.persistence.getHistorical(
      terna.mercado,
      terna.token,
      cutoff,
    );
    if (ops.length === 0) return;
    const channel = this.channels.get(`${terna.mercado}|${terna.token}`);
    if (channel) {
      for (const op of ops) {
        if (op.tid) this.rememberTid(channel, op.tid);
        this.pushToChannelBuffer(channel, op);
      }
      const last = ops[ops.length - 1]!;
      if (last.ts > channel.lastBackfillTs) channel.lastBackfillTs = last.ts;
    }
    this.state.ingestBackfill(terna, ops);
    this.emitSnapshot(terna);
    logger.debug(
      { terna, n: ops.length, sinceMs: cutoff },
      'Leaderboard: seed desde BD',
    );
  }

  /** Inserta una operación en el buffer ordenado del canal (cap por count). */
  private pushToChannelBuffer(channel: TokenChannel, op: Operacion): void {
    const buf = channel.buffer;
    if (buf.length === 0 || op.ts >= buf[buf.length - 1]!.ts) {
      buf.push(op);
    } else {
      // Inserción ordenada (raro: solo en backfill REST tras WS).
      let lo = 0;
      let hi = buf.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (buf[mid]!.ts <= op.ts) lo = mid + 1;
        else hi = mid;
      }
      buf.splice(lo, 0, op);
    }
    if (buf.length > CHANNEL_TRADE_BUFFER_MAX) {
      buf.splice(0, buf.length - CHANNEL_TRADE_BUFFER_MAX);
    }
  }

  /**
   * Pasada de polling: trae `recentTrades`, filtra por `tid` no visto y
   * `ts > lastBackfillTs`, e ingiere lo nuevo en TODAS las temporalidades
   * suscritas para el canal.
   */
  private async pollChannel(channel: TokenChannel): Promise<void> {
    if (channel.refcount === 0) return;
    const ops = await this.source.getRecentTrades(channel.feedCoin);
    if (ops.length === 0) {
      channel.emptyPolls += 1;
      return;
    }
    const nuevas = this.filterUnseen(channel, ops);
    if (nuevas.length === 0) {
      channel.emptyPolls += 1;
      return;
    }
    channel.emptyPolls = 0;
    channel.lastBackfillTs = nuevas[nuevas.length - 1]!.ts;
    const opsDisplay: Operacion[] = nuevas.map((o) => ({
      ...o,
      token: channel.displayToken,
      mercado: channel.mercado,
    }));
    for (const op of opsDisplay) this.pushToChannelBuffer(channel, op);
    this.persistence?.enqueueMany(opsDisplay);
    const temps = this.state.ternasActivasFor(
      channel.mercado,
      channel.displayToken,
    );
    for (const t of temps) {
      const tern: Terna = {
        mercado: channel.mercado,
        token: channel.displayToken,
        temporalidad: t,
      };
      this.state.ingestBackfill(tern, opsDisplay);
      this.emitSnapshot(tern);
    }
  }

  /** Filtra ops no vistas (por `tid` o, en su defecto, por `ts > lastBackfillTs`). */
  private filterUnseen(
    channel: TokenChannel,
    ops: Operacion[],
  ): Operacion[] {
    const out: Operacion[] = [];
    for (const op of ops) {
      if (op.tid) {
        if (channel.seenTids.has(op.tid)) continue;
        this.rememberTid(channel, op.tid);
      } else if (op.ts <= channel.lastBackfillTs) {
        continue;
      }
      out.push(op);
    }
    return out;
  }

  private rememberTid(channel: TokenChannel, tid: string): void {
    if (channel.seenTids.has(tid)) return;
    channel.seenTids.add(tid);
    channel.seenTidsOrder.push(tid);
    if (channel.seenTidsOrder.length > SEEN_TIDS_MAX) {
      const drop = channel.seenTidsOrder.shift();
      if (drop) channel.seenTids.delete(drop);
    }
  }

  private emitSnapshot(terna: Terna): void {
    const snap = this.state.snapshot(terna, HARD_TOP_N_CAP, 'ALL');
    bus.emit('LeaderboardActualizado', {
      name: 'LeaderboardActualizado',
      ocurridoEn: Date.now(),
      terna,
      topN: snap.filas.map((f) => ({
        direccion: f.direccion,
        volumenCompra: f.volumenCompra,
        volumenVenta: f.volumenVenta,
      })),
    });
  }

  private incrementTerna(t: Terna): void {
    const key = `${t.mercado}|${t.token}|${t.temporalidad}`;
    this.ternasRefcount.set(key, (this.ternasRefcount.get(key) ?? 0) + 1);
  }

  private decrementTerna(t: Terna): void {
    const key = `${t.mercado}|${t.token}|${t.temporalidad}`;
    const cur = this.ternasRefcount.get(key) ?? 0;
    if (cur <= 1) this.ternasRefcount.delete(key);
    else this.ternasRefcount.set(key, cur - 1);
  }

  // ---- pipeline de ingesta (WS) ----

  private onTrade(mercado: Mercado, op: Operacion): void {
    const opMercado: Operacion = op.mercado === mercado ? op : { ...op, mercado };
    bus.emit('OperacionRecibida', {
      name: 'OperacionRecibida',
      ocurridoEn: Date.now(),
      operacion: opMercado,
    });

    const ternas = this.state.ternasActivasFor(mercado, op.token);
    for (const temporalidad of ternas) {
      const terna: Terna = { mercado, token: op.token, temporalidad };
      const refcount =
        this.ternasRefcount.get(`${mercado}|${op.token}|${temporalidad}`) ?? 0;
      if (refcount === 0) continue;
      this.state.ingest(terna, opMercado);
      const snap = this.state.snapshot(terna, HARD_TOP_N_CAP, 'ALL');
      bus.emit('LeaderboardActualizado', {
        name: 'LeaderboardActualizado',
        ocurridoEn: Date.now(),
        terna,
        topN: snap.filas.map((f) => ({
          direccion: f.direccion,
          volumenCompra: f.volumenCompra,
          volumenVenta: f.volumenVenta,
        })),
      });
    }
  }
}

function clampTopN(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value <= 0) return DEFAULT_TOP_N;
  return Math.min(HARD_TOP_N_CAP, Math.floor(value));
}
