import { useQuery } from '@tanstack/react-query';
import { Circle } from 'lucide-react';
import { cn } from '@/core/cn';
import { api } from '@/core/api';

interface HealthRes {
  status: 'up' | 'down';
  checks: Record<
    string,
    { status: 'up' | 'down' | 'degraded' | 'pending'; detail?: unknown }
  >;
  now: number;
}

export default function HealthIndicator() {
  const { data, isError } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthRes>('/health'),
    refetchInterval: 8_000,
    retry: false,
  });

  const overall = isError
    ? 'down'
    : data?.checks['source']?.status ?? 'pending';

  const color =
    overall === 'up'
      ? 'text-success'
      : overall === 'degraded'
        ? 'text-warning'
        : overall === 'pending'
          ? 'text-muted-foreground'
          : 'text-destructive';

  const label =
    overall === 'up'
      ? 'Hyperliquid en vivo'
      : overall === 'degraded'
        ? 'Hyperliquid retrasado'
        : overall === 'pending'
          ? 'Conectando…'
          : 'Sin conexión';

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Circle className={cn('h-2.5 w-2.5 fill-current', color)} />
      <span>{label}</span>
    </div>
  );
}
