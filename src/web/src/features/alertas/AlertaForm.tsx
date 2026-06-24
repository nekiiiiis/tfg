import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import {
  api,
  CRUCES,
  MERCADOS,
  type AlertaResumen,
  type Cruce,
  type Mercado,
} from '@/core/api';
import { useAppData } from '@/core/AppDataContext';
import { groupMetaTokens, MERCADO_LABEL } from '@/core/domain';

interface Props {
  alerta?: AlertaResumen;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CreateResult {
  alerta: AlertaResumen;
  webhookAlcanzable: boolean;
  webhookMensaje?: string;
}

export default function AlertaForm({ alerta, open, onOpenChange }: Props) {
  const [token, setToken] = useState(alerta?.token ?? '');
  const [mercado, setMercado] = useState<Mercado>(alerta?.mercado ?? 'PerpNativo');
  const [umbralValor, setUmbralValor] = useState<string>(
    alerta?.umbralValor?.toString() ?? '',
  );
  const [umbralCruce, setUmbralCruce] = useState<Cruce>(
    alerta?.umbralCruce ?? 'SUBE',
  );
  const [webhookUrl, setWebhookUrl] = useState('');
  const qc = useQueryClient();

  const { catalogs, catalogsReady } = useAppData();

  const comboboxGroups = useMemo(
    () => groupMetaTokens(mercado, catalogs[mercado]),
    [catalogs, mercado],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        token,
        mercado,
        umbralValor: Number(umbralValor),
        umbralCruce,
      };
      if (webhookUrl) body['webhookUrl'] = webhookUrl;
      if (alerta) {
        return api.patch<CreateResult>(`/api/alertas/${alerta.id}`, body);
      }
      return api.post<CreateResult>('/api/alertas', {
        ...body,
        webhookUrl,
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['alertas'] });
      toast.success(alerta ? 'Alerta actualizada' : 'Alerta creada');
      if (r && r.webhookAlcanzable === false) {
        toast.warning(
          `Webhook no alcanzable${r.webhookMensaje ? `: ${r.webhookMensaje}` : ''}`,
        );
      }
      onOpenChange(false);
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const numero = Number(umbralValor);
  const validUmbral = Number.isFinite(numero) && numero > 0;
  const validUrl =
    alerta !== undefined
      ? webhookUrl === '' || /^https?:\/\//.test(webhookUrl)
      : /^https?:\/\//.test(webhookUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {alerta ? 'Editar alerta' : 'Crear alerta de precio'}
          </DialogTitle>
          <DialogDescription>
            Recibirás una notificación HTTP cuando el precio cumpla el umbral.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Mercado</Label>
            <Select
              value={mercado}
              onValueChange={(v) => {
                setMercado(v as Mercado);
                setToken('');
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MERCADOS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {MERCADO_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="alf-token">Token</Label>
            <Combobox
              value={token}
              onValueChange={setToken}
              options={comboboxGroups}
              placeholder={
                catalogsReady ? 'Busca un token…' : 'Precargando catálogo…'
              }
              loading={!catalogsReady}
              disabled={!catalogsReady}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="alf-umbral">Umbral (USD)</Label>
            <Input
              id="alf-umbral"
              inputMode="decimal"
              placeholder="2.50"
              value={umbralValor}
              onChange={(e) => setUmbralValor(e.target.value)}
              className="tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <Label>Cruce</Label>
            <Select value={umbralCruce} onValueChange={(v) => setUmbralCruce(v as Cruce)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRUCES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="alf-url">URL del webhook</Label>
            <Input
              id="alf-url"
              type="url"
              placeholder="https://hooks.tuservicio.com/abc123"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se cifra antes de almacenarse y solo se descifra para transmitir
              (RS-10).
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={
              !validUmbral || !validUrl || token.length === 0 || mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            {alerta ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
