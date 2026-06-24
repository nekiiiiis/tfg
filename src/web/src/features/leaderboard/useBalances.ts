import { useEffect, useRef, useState } from 'react';
import {
  api,
  type LeaderboardBalance,
  type LeaderboardBalancesResponse,
  type Mercado,
} from '@/core/api';

interface UseBalancesArgs {
  mercado: Mercado;
  token: string;
  addresses: string[];
  /** Si false, no se hacen peticiones (p. ej. lado en modo combinado). */
  enabled?: boolean;
}

interface UseBalancesState {
  byAddr: Map<string, LeaderboardBalance>;
  tokenSymbol: string;
  loading: boolean;
}

const BATCH = 50;
const DEBOUNCE_MS = 400;

/**
 * Carga saldos USD y de token para las direcciones del leaderboard.
 * Hace batching por chunks de 50 y debounce de 400ms para evitar fuegos
 * artificiales cuando el ranking se actualiza muchas veces por segundo.
 * El backend cachea por (mercado, token, addr) durante 20s, así que las
 * llamadas redundantes no salen del servidor.
 */
export function useBalances({
  mercado,
  token,
  addresses,
  enabled = true,
}: UseBalancesArgs): UseBalancesState {
  const cacheRef = useRef<Map<string, LeaderboardBalance>>(new Map());
  const fetchedKeyRef = useRef<string>('');
  const [tokenSymbol, setTokenSymbol] = useState<string>(token);
  const [loading, setLoading] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    cacheRef.current = new Map();
    setTokenSymbol(token);
    fetchedKeyRef.current = '';
    tick((n) => n + 1);
  }, [mercado, token]);

  useEffect(() => {
    if (!enabled || addresses.length === 0) return;
    const cache = cacheRef.current;
    const need = addresses.filter((a) => !cache.has(a.toLowerCase()));
    if (need.length === 0) return;
    const key = `${mercado}|${token}|${need.slice(0, 3).join(',')}|${need.length}`;
    if (key === fetchedKeyRef.current) return;
    fetchedKeyRef.current = key;

    const timer = setTimeout(() => {
      let cancelled = false;
      setLoading(true);
      const chunks: string[][] = [];
      for (let i = 0; i < need.length; i += BATCH) {
        chunks.push(need.slice(i, i + BATCH));
      }
      Promise.all(
        chunks.map((chunk) =>
          api
            .post<LeaderboardBalancesResponse>('/api/leaderboard/saldos', {
              mercado,
              token,
              addresses: chunk,
            })
            .catch(() => null),
        ),
      )
        .then((responses) => {
          if (cancelled) return;
          for (const r of responses) {
            if (!r) continue;
            setTokenSymbol(r.tokenSymbol);
            for (const s of r.saldos) cache.set(s.direccion.toLowerCase(), s);
          }
          tick((n) => n + 1);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [mercado, token, addresses, enabled]);

  return { byAddr: cacheRef.current, tokenSymbol, loading };
}
