import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/core/api';

interface Props {
  entidadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export default function DireccionForm({ entidadId, open, onOpenChange }: Props) {
  const [valor, setValor] = useState('');
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (v: string) =>
      api.post(`/api/entidades/${entidadId}/direcciones`, { valor: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['direcciones', entidadId] });
      qc.invalidateQueries({ queryKey: ['entidades'] });
      toast.success('Dirección añadida');
      setValor('');
      onOpenChange(false);
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir dirección</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="addr">Dirección Hyperliquid</Label>
          <Input
            id="addr"
            autoFocus
            value={valor}
            onChange={(e) => setValor(e.target.value.trim())}
            placeholder="0x…"
            className="font-mono"
            maxLength={42}
          />
          {valor.length > 0 && !ADDR_RE.test(valor) && (
            <p className="text-xs text-destructive">
              Formato esperado: 0x + 40 caracteres hexadecimales.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            disabled={!ADDR_RE.test(valor) || mutation.isPending}
            onClick={() => mutation.mutate(valor.toLowerCase())}
          >
            Añadir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
