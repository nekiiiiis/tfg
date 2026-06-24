/**
 * Configuración validada por zod. Una sola fuente de verdad para todo el proceso.
 */

import 'dotenv/config';
import { z } from 'zod';

const csvIntListString = (def: string) =>
  z
    .string()
    .default(def)
    .transform((s) => s.split(',').map((x) => Number.parseInt(x.trim(), 10)))
    .pipe(
      z
        .array(z.number().int().positive())
        .min(1, 'Se esperaba una lista CSV de enteros positivos'),
    );

/**
 * Parser para `LEADERBOARD_PREWARM`: lista CSV de pares `Mercado|Token` que se
 * abren al arrancar para que el canal Hyperliquid (WS + polling REST + persistencia
 * de trades) esté caliente desde el primer instante, sin esperar a que un usuario
 * abra la web.
 *
 * Se usa `|` como separador entre mercado y token porque los identificadores
 * de PerpHIP3 ya contienen `:` (formato `<dex>:<symbol>`, p.ej. `xyz:SP500`).
 *
 * Ejemplos válidos:
 *   PerpNativo|BTC.p
 *   Spot|HYPE/USDC
 *   PerpHIP3|xyz:SP500
 *
 * El catálogo de tokens (resolución `display → feedCoin`) se valida en runtime
 * al hacer `LeaderboardService.subscribe`, no aquí: aquí sólo verificamos
 * forma y mercado.
 */
const prewarmPairsString = z
  .string()
  .default('')
  .transform((raw, ctx) => {
    const trimmed = raw.trim();
    if (!trimmed) return [] as Array<{ mercado: 'Spot' | 'PerpNativo' | 'PerpHIP3'; token: string }>;
    const out: Array<{ mercado: 'Spot' | 'PerpNativo' | 'PerpHIP3'; token: string }> = [];
    const entries = trimmed.split(',');
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]!.trim();
      if (!entry) continue;
      const sepIdx = entry.indexOf('|');
      if (sepIdx === -1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `LEADERBOARD_PREWARM[${i}]: falta '|' entre mercado y token (formato 'Mercado|Token'), recibí '${entry}'`,
        });
        return z.NEVER;
      }
      const mercado = entry.slice(0, sepIdx).trim();
      const token = entry.slice(sepIdx + 1).trim();
      if (mercado !== 'Spot' && mercado !== 'PerpNativo' && mercado !== 'PerpHIP3') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `LEADERBOARD_PREWARM[${i}]: mercado debe ser Spot, PerpNativo o PerpHIP3 (recibí '${mercado}')`,
        });
        return z.NEVER;
      }
      if (!token) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `LEADERBOARD_PREWARM[${i}]: token vacío después de '|'`,
        });
        return z.NEVER;
      }
      out.push({ mercado, token });
    }
    return out;
  });

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  HYPERLIQUID_SOURCE: z.enum(['public-ws', 'nanoreth']).default('public-ws'),
  HYPERLIQUID_WS_URL: z.string().url().default('wss://api.hyperliquid.xyz/ws'),
  HYPERLIQUID_INFO_URL: z
    .string()
    .url()
    .default('https://api.hyperliquid.xyz/info'),
  NANORETH_RPC_URL: z.string().url().default('http://localhost:8545'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL es obligatoria')
    .default(
      'postgres://fieldx:fieldx_dev_password_change_me@localhost:5432/infinite_fieldx',
    ),

  APP_SECRET: z
    .string()
    .min(16, 'APP_SECRET debe tener al menos 16 caracteres')
    .default('dev-only-app-secret-please-change-me-in-production'),

  LEADERBOARD_WINDOW_1H: z.coerce.number().int().positive().default(3600),
  LEADERBOARD_WINDOW_4H: z.coerce.number().int().positive().default(14_400),
  LEADERBOARD_WINDOW_6H: z.coerce.number().int().positive().default(21_600),
  LEADERBOARD_WINDOW_12H: z.coerce.number().int().positive().default(43_200),
  LEADERBOARD_WINDOW_1D: z.coerce.number().int().positive().default(86_400),
  LEADERBOARD_WINDOW_1W: z.coerce.number().int().positive().default(604_800),
  LEADERBOARD_MAX_OPS_PER_TERNA: z.coerce
    .number()
    .int()
    .positive()
    .default(200_000),

  NOTIFICATION_RETRY_BACKOFF_SECONDS: csvIntListString('1,5,30,300,1800,3600'),
  NOTIFICATION_RETRY_TICK_SECONDS: z.coerce.number().int().positive().default(5),

  HYPERLIQUID_FEED_STALE_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15),

  /** Intervalo mínimo entre llamadas REST /info del adaptador WS (ms). */
  HYPERLIQUID_INFO_MIN_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(120),

  /** Intervalo mínimo entre peticiones REST `recentTrades` (anti-burst). */
  HYPERLIQUID_TRADES_INFO_MIN_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60),

  /** Poll rápido cuando el WS está silencioso para ese coin (ms). */
  LEADERBOARD_POLL_MIN_MS: z.coerce.number().int().positive().default(80),

  /** Poll máximo tras varios polls vacíos (token poco activo). */
  LEADERBOARD_POLL_MAX_MS: z.coerce.number().int().positive().default(1_500),

  /** Edad máxima (ms) de un trade WS para considerar el feed "fresco". */
  LEADERBOARD_POLL_WS_FRESH_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(600),

  /** Poll lento cuando el WS está fresco (red de seguridad). */
  LEADERBOARD_POLL_FRESH_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(1_000),

  /**
   * Pares (mercado|token) que se abren automáticamente al arrancar. Sirven
   * para que el WS de Hyperliquid + el polling REST + la persistencia de
   * trades estén capturando datos 24/7 sin depender de que un usuario tenga
   * la web abierta. Lista CSV, separador `|` por compatibilidad con HIP3.
   * Vacío = no se precalienta nada (comportamiento original).
   */
  LEADERBOARD_PREWARM: prewarmPairsString,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Configuración inválida:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;

export const leaderboardWindowSeconds = {
  '1h': config.LEADERBOARD_WINDOW_1H,
  '4h': config.LEADERBOARD_WINDOW_4H,
  '6h': config.LEADERBOARD_WINDOW_6H,
  '12h': config.LEADERBOARD_WINDOW_12H,
  '1d': config.LEADERBOARD_WINDOW_1D,
  '1w': config.LEADERBOARD_WINDOW_1W,
} as const;
