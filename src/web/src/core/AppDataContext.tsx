/**
 * Estado global precargado al arrancar la app:
 *   - Catálogo de tokens (Spot, Perps, HIP3) en paralelo.
 *   - Top volumen 24h.
 *   - WebSocket único (mids + leaderboard) desde el primer render.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  api,
  MERCADOS,
  type FilaLeaderboard,
  type Lado,
  type Mercado,
  type MetaToken,
  type MetaTokensResponse,
  type Temporalidad,
  type TopVolumeResponse,
  type TopVolumeToken,
} from './api';
import { DEFAULT_TOKEN_BY_MERCADO, type LeaderboardLado } from './domain';

function getWsUrl(path: string): string {
  const isHttps = window.location.protocol === 'https:';
  const scheme = isHttps ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}${path}`;
}

type WsState = 'connecting' | 'open' | 'closed' | 'error';

interface IncomingSnapshot {
  type: 'snapshot' | 'update';
  terna: { mercado: Mercado; token: string; temporalidad: Temporalidad };
  lado?: Lado;
  filas: FilaLeaderboard[];
  ts: number;
}
interface IncomingMids {
  type: 'mids';
  mids: Record<string, number>;
  ts: number;
}
interface IncomingError {
  type: 'error';
  code: string;
  message: string;
}

type Incoming = IncomingSnapshot | IncomingMids | { type: 'pong' } | IncomingError;

export interface LeaderboardSelection {
  mercado: Mercado;
  token: string;
  temporalidad: Temporalidad;
  lado: LeaderboardLado;
}

interface ActiveSub {
  mercado: Mercado;
  token: string;
  temporalidad: Temporalidad;
  lado: Lado;
}

interface AppDataValue {
  catalogs: Record<Mercado, MetaToken[]>;
  catalogsReady: boolean;
  topVolume: TopVolumeToken[];
  getTokenMeta: (mercado: Mercado, tokenId: string) => MetaToken | undefined;
  defaultTokenFor: (mercado: Mercado) => string;
  stream: {
    status: WsState;
    filas: FilaLeaderboard[];
    mids: Record<string, number>;
    lastUpdateTs: number | null;
    errorMessage: string | null;
  };
  selection: LeaderboardSelection;
  setSelection: (patch: Partial<LeaderboardSelection>) => void;
}

const AppDataContext = createContext<AppDataValue | null>(null);

const BACKOFF = [500, 1000, 2000, 4000, 8000, 15_000];

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [selection, setSelectionState] = useState<LeaderboardSelection>({
    mercado: 'PerpNativo',
    token: DEFAULT_TOKEN_BY_MERCADO.PerpNativo,
    temporalidad: '1h',
    lado: 'BUY',
  });

  const [status, setStatus] = useState<WsState>('connecting');
  const [filas, setFilas] = useState<FilaLeaderboard[]>([]);
  const [mids, setMids] = useState<Record<string, number>>({});
  const [lastUpdateTs, setLastUpdateTs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const catalogQueries = useQueries({
    queries: MERCADOS.map((mercado) => ({
      queryKey: ['meta', 'tokens', mercado],
      queryFn: () =>
        api.get<MetaTokensResponse>(`/api/meta/tokens?mercado=${mercado}`),
      staleTime: Infinity,
      gcTime: Infinity,
    })),
  });

  const topQuery = useQueries({
    queries: [
      {
        queryKey: ['meta-top-volumen', 40],
        queryFn: () =>
          api.get<TopVolumeResponse>('/api/meta/top-volumen?limit=40'),
        staleTime: 60_000,
        refetchInterval: 60_000,
      },
    ],
  });

  const catalogs = useMemo(() => {
    const out = {} as Record<Mercado, MetaToken[]>;
    for (let i = 0; i < MERCADOS.length; i += 1) {
      const m = MERCADOS[i]!;
      out[m] = catalogQueries[i]?.data?.tokens ?? [];
    }
    return out;
  }, [catalogQueries]);

  const catalogsReady = catalogQueries.every((q) => q.isSuccess);

  const topVolume = topQuery[0]?.data?.tokens ?? [];

  const tokenIndex = useMemo(() => {
    const map = new Map<string, MetaToken>();
    for (const m of MERCADOS) {
      for (const t of catalogs[m]) {
        map.set(`${m}|${t.id}`, t);
      }
    }
    return map;
  }, [catalogs]);

  const getTokenMeta = useCallback(
    (mercado: Mercado, tokenId: string) =>
      tokenIndex.get(`${mercado}|${tokenId}`),
    [tokenIndex],
  );

  const defaultTokenFor = useCallback(
    (mercado: Mercado): string => {
      const list = catalogs[mercado];
      if (list.length === 0) return DEFAULT_TOKEN_BY_MERCADO[mercado];
      const preferred = DEFAULT_TOKEN_BY_MERCADO[mercado];
      if (list.some((t) => t.id === preferred)) return preferred;
      const fromTop = topVolume.find((t) => t.mercado === mercado);
      if (fromTop && list.some((t) => t.id === fromTop.id)) return fromTop.id;
      return list[0]!.id;
    },
    [catalogs, topVolume],
  );

  useEffect(() => {
    if (!catalogsReady) return;
    const list = catalogs[selection.mercado];
    if (list.length === 0) return;
    if (!list.some((t) => t.id === selection.token)) {
      setSelectionState((s) => ({
        ...s,
        token: defaultTokenFor(s.mercado),
      }));
    }
  }, [catalogsReady, catalogs, defaultTokenFor, selection.mercado, selection.token]);

  const setSelection = useCallback(
    (patch: Partial<LeaderboardSelection>) => {
      setSelectionState((prev) => {
        const next = { ...prev, ...patch };
        if (patch.mercado !== undefined && patch.mercado !== prev.mercado) {
          const list = catalogs[patch.mercado] ?? [];
          next.token = list.some((t) => t.id === prev.token)
            ? prev.token
            : defaultTokenFor(patch.mercado);
        }
        return next;
      });
    },
    [catalogs, defaultTokenFor],
  );

  const wsRef = useRef<WebSocket | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const activeRef = useRef<ActiveSub | null>(null);

  const syncRef = useRef<(ws: WebSocket) => void>(() => undefined);
  syncRef.current = (ws: WebSocket) => {
    if (ws.readyState !== ws.OPEN) return;
    const { mercado, token, temporalidad, lado } = selectionRef.current;
    const prev = activeRef.current;
    const next: ActiveSub = { mercado, token, temporalidad, lado };

    if (!token) {
      if (prev) {
        ws.send(
          JSON.stringify({
            type: 'unsubscribe-leaderboard',
            mercado: prev.mercado,
            token: prev.token,
            temporalidad: prev.temporalidad,
          }),
        );
        activeRef.current = null;
      }
      return;
    }

    // Subscribe ANTES de unsubscribe para que el refcount del canal no baje
    // momentáneamente a 0 y el backend pueda sembrar la nueva temporalidad
    // desde el buffer del canal.
    ws.send(
      JSON.stringify({
        type: 'subscribe-leaderboard',
        mercado: next.mercado,
        token: next.token,
        temporalidad: next.temporalidad,
        lado: next.lado,
      }),
    );
    if (prev && !mismaTerna(prev, next)) {
      ws.send(
        JSON.stringify({
          type: 'unsubscribe-leaderboard',
          mercado: prev.mercado,
          token: prev.token,
          temporalidad: prev.temporalidad,
        }),
      );
    }
    activeRef.current = next;
  };

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = (): void => {
      if (stopped) return;
      const ws = new WebSocket(getWsUrl('/ws/leaderboard'));
      wsRef.current = ws;
      setStatus('connecting');

      ws.onopen = () => {
        attempt = 0;
        setStatus('open');
        setErrorMessage(null);
        ws.send(JSON.stringify({ type: 'subscribe-mids' }));
        activeRef.current = null;
        syncRef.current(ws);
      };

      ws.onmessage = (ev) => {
        let data: Incoming;
        try {
          data = JSON.parse(ev.data) as Incoming;
        } catch {
          return;
        }
        if (data.type === 'snapshot' || data.type === 'update') {
          const sel = selectionRef.current;
          if (
            data.terna.mercado !== sel.mercado ||
            data.terna.token !== sel.token ||
            data.terna.temporalidad !== sel.temporalidad
          ) {
            return;
          }
          setLastUpdateTs(data.ts);
          setFilas(
            data.filas.map((f) => ({
              ...f,
              volumenTotal: f.volumenCompra + f.volumenVenta,
            })),
          );
        } else if (data.type === 'mids') {
          setMids(data.mids);
        } else if (data.type === 'error') {
          setErrorMessage(data.message);
        }
      };

      ws.onerror = () => setStatus('error');
      ws.onclose = () => {
        if (stopped) return;
        setStatus('closed');
        activeRef.current = null;
        const delay =
          BACKOFF[Math.min(attempt, BACKOFF.length - 1)] ?? 15_000;
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    const ws = wsRef.current;
    if (ws) syncRef.current(ws);
  }, [
    selection.mercado,
    selection.token,
    selection.temporalidad,
    selection.lado,
  ]);

  const value = useMemo<AppDataValue>(
    () => ({
      catalogs,
      catalogsReady,
      topVolume,
      getTokenMeta,
      defaultTokenFor,
      stream: { status, filas, mids, lastUpdateTs, errorMessage },
      selection,
      setSelection,
    }),
    [
      catalogs,
      catalogsReady,
      topVolume,
      getTokenMeta,
      defaultTokenFor,
      status,
      filas,
      mids,
      lastUpdateTs,
      errorMessage,
      selection,
      setSelection,
    ],
  );

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData debe usarse dentro de AppDataProvider');
  return ctx;
}

function mismaTerna(a: ActiveSub, b: ActiveSub): boolean {
  return (
    a.mercado === b.mercado &&
    a.token === b.token &&
    a.temporalidad === b.temporalidad
  );
}
