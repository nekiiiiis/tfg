import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ExternalLink,
  TrendingDown,
  TrendingUp,
  ShieldAlert,
  Lock,
  Wallet,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { api } from '@/core/api';
import {
  formatNumber,
  formatPct,
  formatSignedUsd,
  formatUsd,
  formatUsdFine,
  shortAddress,
} from '@/core/format';
import { cn } from '@/core/cn';

// ---- Tipos compartidos con el backend (`direccion-detalle.types.ts`). ----

interface SpotBalance {
  id: string;
  label: string;
  total: number;
  hold: number;
  available: number;
  entryNtl?: number;
  markPxUsdc?: number;
  valueUsd?: number;
}
interface SpotSummary {
  balances: SpotBalance[];
  totalValueUsd: number;
  usdcDisponible: number;
}

interface PerpPosition {
  id: string;
  label: string;
  mercado: 'PerpNativo' | 'PerpHIP3';
  side: 'LONG' | 'SHORT';
  size: number;
  sizeAbs: number;
  entryPx: number;
  markPx?: number;
  liquidationPx?: number;
  liquidationDistancePct?: number;
  positionValue: number;
  unrealizedPnl: number;
  roiPct?: number;
  leverage: number;
  leverageType?: string;
  maxLeverage?: number;
  marginUsed?: number;
  cumFundingSinceOpen?: number;
  cumFundingAllTime?: number;
}
interface PerpSummary {
  posiciones: PerpPosition[];
  accountValue: number;
  marginUsed: number;
  totalNtlPos: number;
  totalRawUsd: number;
  withdrawable: number;
  crossMaintenanceMarginUsed?: number;
  unrealizedPnlTotal: number;
}

interface StakingDelegation {
  validator: string;
  amount: number;
  lockedUntilTimestamp: number;
}
interface StakingSummary {
  delegated: number;
  undelegated: number;
  totalPendingWithdrawal: number;
  nPendingWithdrawals: number;
  stakingBalance: number;
  delegations: StakingDelegation[];
}

interface FillDTO {
  id: string;
  label: string;
  mercado?: 'Spot' | 'PerpNativo' | 'PerpHIP3';
  side: 'BUY' | 'SELL';
  px: number;
  sz: number;
  notional: number;
  time: number;
  hash?: string;
  fee?: number;
  closedPnl?: number;
  dir?: string;
}

export default function DireccionDetailPage() {
  const { addr } = useParams<{ addr: string }>();
  const address = (addr ?? '').toLowerCase();

  const spot = useQuery({
    queryKey: ['spot', address],
    queryFn: () => api.get<SpotSummary>(`/api/direcciones/${address}/spot`),
    enabled: !!address,
    refetchInterval: 15_000,
  });
  const perps = useQuery({
    queryKey: ['perps', address],
    queryFn: () => api.get<PerpSummary>(`/api/direcciones/${address}/perps`),
    enabled: !!address,
    refetchInterval: 10_000,
  });
  const staking = useQuery({
    queryKey: ['staking', address],
    queryFn: () =>
      api.get<StakingSummary>(`/api/direcciones/${address}/staking`),
    enabled: !!address,
    refetchInterval: 30_000,
  });
  const fills = useQuery({
    queryKey: ['fills', address],
    queryFn: () => api.get<FillDTO[]>(`/api/direcciones/${address}/fills`),
    enabled: !!address,
    refetchInterval: 20_000,
  });

  if (!address) return null;

  // Resumen de "patrimonio" para la cabecera.
  const equity =
    (perps.data?.accountValue ?? 0) +
    (spot.data?.totalValueUsd ?? 0) +
    // El HYPE en staking lo valoramos en USD si tenemos su mid.
    (staking.data ? (staking.data.stakingBalance ?? 0) : 0) *
      (spot.data?.balances.find((b) => b.id === 'HYPE')?.markPxUsdc ?? 0);

  return (
    <div className="space-y-4">
      <Link
        to="/leaderboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver
      </Link>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="font-mono">
              {shortAddress(address)}
            </CardTitle>
            <code className="block text-xs text-muted-foreground">
              {address}
            </code>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <HeaderStat
              label="Patrimonio est."
              value={formatUsd(equity)}
              icon={<Wallet className="h-4 w-4" />}
            />
            {perps.data && (
              <HeaderStat
                label="Cuenta perps"
                value={formatUsd(perps.data.accountValue)}
              />
            )}
            {spot.data && (
              <HeaderStat
                label="Spot (USD)"
                value={formatUsd(spot.data.totalValueUsd)}
              />
            )}
            {staking.data && (
              <HeaderStat
                label="HYPE staking"
                value={formatNumber(staking.data.stakingBalance)}
                icon={<Lock className="h-4 w-4" />}
              />
            )}
            <a
              href={`https://hypurrscan.io/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              Hypurrscan <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="perps">
            <TabsList>
              <TabsTrigger value="perps">Perpetuos</TabsTrigger>
              <TabsTrigger value="spot">Spot</TabsTrigger>
              <TabsTrigger value="staking">Staking</TabsTrigger>
              <TabsTrigger value="fills">Operaciones</TabsTrigger>
            </TabsList>

            {/* ----------- PERPS ----------- */}
            <TabsContent value="perps" className="mt-4">
              {perps.isLoading && <Placeholder />}
              {perps.isError && (
                <ErrorBox msg="No se pudo cargar el estado perp" />
              )}
              {perps.data && <PerpsView data={perps.data} />}
            </TabsContent>

            {/* ----------- SPOT ----------- */}
            <TabsContent value="spot" className="mt-4">
              {spot.isLoading && <Placeholder />}
              {spot.isError && (
                <ErrorBox msg="No se pudo cargar el saldo spot" />
              )}
              {spot.data && <SpotView data={spot.data} />}
            </TabsContent>

            {/* ----------- STAKING ----------- */}
            <TabsContent value="staking" className="mt-4">
              {staking.isLoading && <Placeholder />}
              {staking.isError && (
                <ErrorBox msg="No se pudo cargar el staking" />
              )}
              {staking.data && <StakingView data={staking.data} />}
            </TabsContent>

            {/* ----------- FILLS ----------- */}
            <TabsContent value="fills" className="mt-4">
              {fills.isLoading && <Placeholder />}
              {fills.isError && (
                <ErrorBox msg="No se pudieron cargar las operaciones" />
              )}
              {fills.data && <FillsView data={fills.data} />}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Subcomponentes por tab
// ============================================================

function PerpsView({ data }: { data: PerpSummary }) {
  const pnlClass =
    data.unrealizedPnlTotal > 0
      ? 'text-buy'
      : data.unrealizedPnlTotal < 0
        ? 'text-sell'
        : 'text-foreground';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Valor de cuenta" value={formatUsd(data.accountValue)} />
        <Stat
          label="PnL no realizado"
          value={formatSignedUsd(data.unrealizedPnlTotal)}
          className={pnlClass}
        />
        <Stat label="Margen usado" value={formatUsd(data.marginUsed)} />
        <Stat
          label="Notional total"
          value={formatUsd(data.totalNtlPos)}
          hint="Exposición bruta de las posiciones"
        />
        <Stat label="Retirable" value={formatUsd(data.withdrawable)} />
        <Stat
          label="Mant. cross"
          value={
            data.crossMaintenanceMarginUsed !== undefined
              ? formatUsd(data.crossMaintenanceMarginUsed)
              : '—'
          }
          hint="Margen de mantenimiento cross"
        />
      </div>

      {data.posiciones.length === 0 ? (
        <EmptyState text="Sin posiciones abiertas" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2 pl-3 text-left">Mercado</th>
                <th className="text-left">Lado</th>
                <th className="text-right">Tamaño</th>
                <th className="text-right">Entry</th>
                <th className="text-right">Mark</th>
                <th className="text-right">Liq.</th>
                <th className="text-right">Notional</th>
                <th className="text-right">PnL</th>
                <th className="text-right">ROE</th>
                <th className="text-right">Apalanc.</th>
                <th className="text-right">Margen</th>
                <th className="pr-3 text-right">Funding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.posiciones.map((p) => {
                const liqClose =
                  p.liquidationDistancePct !== undefined &&
                  Math.abs(p.liquidationDistancePct) < 5;
                return (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="py-2 pl-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">
                          {p.label}
                        </span>
                        <Badge
                          variant={
                            p.mercado === 'PerpHIP3' ? 'warning' : 'secondary'
                          }
                          className="text-[10px] uppercase"
                        >
                          {p.mercado === 'PerpHIP3' ? 'HIP3' : 'Perp'}
                        </Badge>
                      </div>
                    </td>
                    <td>
                      <Badge
                        variant={p.side === 'LONG' ? 'success' : 'destructive'}
                        className="gap-1"
                      >
                        {p.side === 'LONG' ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {p.side}
                      </Badge>
                    </td>
                    <td className="text-right">{formatNumber(p.sizeAbs)}</td>
                    <td className="text-right">{formatUsdFine(p.entryPx)}</td>
                    <td className="text-right">
                      {p.markPx !== undefined ? formatUsdFine(p.markPx) : '—'}
                    </td>
                    <td
                      className={cn(
                        'text-right',
                        liqClose && 'text-warning font-medium',
                      )}
                    >
                      <div className="inline-flex items-center justify-end gap-1">
                        {liqClose && <ShieldAlert className="h-3 w-3" />}
                        {p.liquidationPx !== undefined
                          ? formatUsdFine(p.liquidationPx)
                          : '—'}
                      </div>
                      {p.liquidationDistancePct !== undefined && (
                        <div className="text-[10px] text-muted-foreground">
                          {formatPct(p.liquidationDistancePct, 1)}
                        </div>
                      )}
                    </td>
                    <td className="text-right">{formatUsd(p.positionValue)}</td>
                    <td
                      className={cn(
                        'text-right font-medium',
                        p.unrealizedPnl >= 0 ? 'text-buy' : 'text-sell',
                      )}
                    >
                      {formatSignedUsd(p.unrealizedPnl)}
                    </td>
                    <td
                      className={cn(
                        'text-right',
                        (p.roiPct ?? 0) >= 0 ? 'text-buy' : 'text-sell',
                      )}
                    >
                      {p.roiPct !== undefined ? formatPct(p.roiPct, 2) : '—'}
                    </td>
                    <td className="text-right">
                      <span className="font-medium">{p.leverage}x</span>
                      {p.leverageType && (
                        <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                          {p.leverageType}
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      {p.marginUsed !== undefined
                        ? formatUsd(p.marginUsed)
                        : '—'}
                    </td>
                    <td className="pr-3 text-right">
                      <div
                        className={cn(
                          (p.cumFundingSinceOpen ?? 0) >= 0
                            ? 'text-buy'
                            : 'text-sell',
                        )}
                      >
                        {p.cumFundingSinceOpen !== undefined
                          ? formatSignedUsd(p.cumFundingSinceOpen)
                          : '—'}
                      </div>
                      {p.cumFundingAllTime !== undefined && (
                        <div className="text-[10px] text-muted-foreground">
                          total {formatSignedUsd(p.cumFundingAllTime)}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SpotView({ data }: { data: SpotSummary }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Valor total" value={formatUsd(data.totalValueUsd)} />
        <Stat label="USDC disponible" value={formatUsd(data.usdcDisponible)} />
        <Stat label="Activos" value={String(data.balances.length)} />
      </div>
      {data.balances.length === 0 ? (
        <EmptyState text="Sin saldos spot" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2 pl-3 text-left">Token</th>
                <th className="text-right">Total</th>
                <th className="text-right">Disponible</th>
                <th className="text-right">Bloqueado</th>
                <th className="text-right">Precio</th>
                <th className="text-right">Valor (USD)</th>
                <th className="pr-3 text-right">Entry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.balances.map((b) => (
                <tr key={b.id} className="hover:bg-muted/20">
                  <td className="py-2 pl-3 font-mono">{b.label}</td>
                  <td className="text-right">{formatNumber(b.total)}</td>
                  <td className="text-right">{formatNumber(b.available)}</td>
                  <td className="text-right text-muted-foreground">
                    {b.hold > 0 ? formatNumber(b.hold) : '—'}
                  </td>
                  <td className="text-right">
                    {b.markPxUsdc !== undefined
                      ? formatUsdFine(b.markPxUsdc)
                      : '—'}
                  </td>
                  <td className="text-right font-medium">
                    {b.valueUsd !== undefined ? formatUsd(b.valueUsd) : '—'}
                  </td>
                  <td className="pr-3 text-right text-muted-foreground">
                    {b.entryNtl !== undefined ? formatUsd(b.entryNtl) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StakingView({ data }: { data: StakingSummary }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Total en staking"
          value={`${formatNumber(data.stakingBalance)} HYPE`}
          hint="delegated + undelegated"
        />
        <Stat label="Delegado" value={`${formatNumber(data.delegated)} HYPE`} />
        <Stat
          label="No delegado"
          value={`${formatNumber(data.undelegated)} HYPE`}
        />
        <Stat
          label="Retiros pendientes"
          value={`${data.nPendingWithdrawals} · ${formatNumber(
            data.totalPendingWithdrawal,
          )} HYPE`}
        />
      </div>
      {data.delegations.length === 0 ? (
        <EmptyState text="Sin delegaciones activas" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2 pl-3 text-left">Validador</th>
                <th className="text-right">Importe</th>
                <th className="pr-3 text-right">Bloqueado hasta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.delegations.map((d) => (
                <tr key={d.validator} className="hover:bg-muted/20">
                  <td className="py-2 pl-3 font-mono text-xs">
                    {shortAddress(d.validator)}
                  </td>
                  <td className="text-right">
                    {formatNumber(d.amount)} HYPE
                  </td>
                  <td className="pr-3 text-right text-muted-foreground">
                    {d.lockedUntilTimestamp
                      ? new Date(d.lockedUntilTimestamp).toLocaleString()
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FillsView({ data }: { data: FillDTO[] }) {
  if (data.length === 0) return <EmptyState text="Sin operaciones recientes" />;
  return (
    <div className="max-h-[520px] overflow-auto rounded-md border border-border">
      <table className="w-full text-sm tabular-nums">
        <thead className="sticky top-0 bg-card text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="py-2 pl-3 text-left">Hora</th>
            <th className="text-left">Lado</th>
            <th className="text-left">Mercado</th>
            <th className="text-right">Precio</th>
            <th className="text-right">Tamaño</th>
            <th className="text-right">Notional</th>
            <th className="text-right">PnL cerrado</th>
            <th className="pr-3 text-right">Fee</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.slice(0, 200).map((f, i) => (
            <tr
              key={f.hash ?? `${f.time}-${i}`}
              className="hover:bg-muted/20"
            >
              <td className="py-2 pl-3 text-muted-foreground">
                {new Date(f.time).toLocaleString()}
              </td>
              <td>
                <Badge
                  variant={f.side === 'BUY' ? 'success' : 'destructive'}
                >
                  {f.side}
                </Badge>
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{f.label}</span>
                  {f.mercado && (
                    <Badge
                      variant={
                        f.mercado === 'PerpHIP3'
                          ? 'warning'
                          : f.mercado === 'Spot'
                            ? 'secondary'
                            : 'default'
                      }
                      className="text-[10px] uppercase"
                    >
                      {f.mercado === 'PerpHIP3'
                        ? 'HIP3'
                        : f.mercado === 'PerpNativo'
                          ? 'Perp'
                          : 'Spot'}
                    </Badge>
                  )}
                  {f.dir && (
                    <span className="text-[10px] text-muted-foreground">
                      {f.dir}
                    </span>
                  )}
                </div>
              </td>
              <td className="text-right">{formatUsdFine(f.px)}</td>
              <td className="text-right">{formatNumber(f.sz)}</td>
              <td className="text-right">{formatUsd(f.notional)}</td>
              <td
                className={cn(
                  'text-right',
                  f.closedPnl !== undefined && f.closedPnl !== 0
                    ? f.closedPnl > 0
                      ? 'text-buy'
                      : 'text-sell'
                    : 'text-muted-foreground',
                )}
              >
                {f.closedPnl !== undefined
                  ? formatSignedUsd(f.closedPnl)
                  : '—'}
              </td>
              <td className="pr-3 text-right text-muted-foreground">
                {f.fee !== undefined ? formatUsdFine(f.fee) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Mini-componentes auxiliares
// ============================================================

function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn('text-base font-semibold tabular-nums', className)}
        title={hint}
      >
        {value}
      </div>
    </div>
  );
}

function HeaderStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <div className="text-xs">
        <div className="uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function Placeholder() {
  return <div className="h-40 animate-pulse rounded-md bg-muted/40" />;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {msg}
    </div>
  );
}
