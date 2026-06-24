import { useState } from 'react';
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
import { api, type Entidad } from '@/core/api';

interface Props {
  /** Si se pasa, el formulario edita esa entidad; si no, crea. */
  entidad?: Entidad;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EntidadForm({ entidad, open, onOpenChange }: Props) {
  const [nombre, setNombre] = useState(entidad?.nombre ?? '');
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (n: string) => {
      if (entidad) {
        return api.patch<Entidad>(`/api/entidades/${entidad.id}`, { nombre: n });
      }
      return api.post<Entidad>('/api/entidades', { nombre: n });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entidades'] });
      toast.success(entidad ? 'Entidad actualizada' : 'Entidad creada');
      onOpenChange(false);
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {entidad ? 'Editar entidad' : 'Crear entidad'}
          </DialogTitle>
          <DialogDescription>
            Las entidades agrupan direcciones para resolver nombres en el leaderboard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="nombre">Nombre</Label>
          <Input
            id="nombre"
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="p. ej. Wintermute"
            maxLength={64}
          />
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
            disabled={nombre.trim().length === 0 || mutation.isPending}
            onClick={() => mutation.mutate(nombre.trim())}
          >
            {entidad ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
