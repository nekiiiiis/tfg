/**
 * Combobox / search-select sencillo.
 *
 * Para evitar añadir deps nuevas (no tenemos `@radix-ui/react-popover` ni
 * `cmdk`), implementamos lo mínimo:
 *   - Botón que abre un panel absoluto.
 *   - Input de búsqueda con filtrado *cliente* (substring case-insensitive).
 *   - Lista virtualizable-amigable (sin virtualizar por simplicidad — corta
 *     a `maxVisible` para no renderizar mil filas).
 *   - Cierre con click fuera, Esc, o selección.
 *   - Soporte de grupos (etiqueta + items).
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/core/cn';

export interface ComboboxItem {
  value: string;
  label: string;
  /** Texto adicional opcional para potenciar la búsqueda (no se muestra). */
  searchText?: string;
}

export interface ComboboxGroup {
  label: string;
  items: ComboboxItem[];
}

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  loading?: boolean;
  /** Lista plana o agrupada. */
  options: ComboboxItem[] | ComboboxGroup[];
  className?: string;
  /** Recorte para no pintar miles de filas. */
  maxVisible?: number;
}

export function Combobox({
  value,
  onValueChange,
  placeholder = 'Selecciona…',
  emptyText = 'Sin resultados',
  disabled = false,
  loading = false,
  options,
  className,
  maxVisible = 200,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();

  const groups = useMemo<ComboboxGroup[]>(() => {
    if (options.length === 0) return [];
    if ('items' in (options[0] as ComboboxGroup)) return options as ComboboxGroup[];
    return [{ label: '', items: options as ComboboxItem[] }];
  }, [options]);

  const filteredGroups = useMemo<ComboboxGroup[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        label: g.label,
        items: g.items.filter((it) => matches(it, q)),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  /** Aplanamos para indexar la navegación con teclado. */
  const flatItems = useMemo<ComboboxItem[]>(() => {
    const acc: ComboboxItem[] = [];
    for (const g of filteredGroups) acc.push(...g.items);
    return acc.slice(0, maxVisible);
  }, [filteredGroups, maxVisible]);

  const selectedLabel = useMemo(() => {
    for (const g of groups)
      for (const it of g.items) if (it.value === value) return it.label;
    return '';
  }, [groups, value]);

  // Reset al abrir/cerrar.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Foco al input.
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [open]);

  // Click fuera.
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Reposiciona el índice activo si se filtra.
  useEffect(() => {
    if (activeIndex >= flatItems.length) setActiveIndex(0);
  }, [flatItems.length, activeIndex]);

  const select = (it: ComboboxItem): void => {
    onValueChange(it.value);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, flatItems.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = flatItems[activeIndex];
      if (it) select(it);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-border bg-input px-3 py-1 text-sm shadow-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          disabled && 'opacity-50',
        )}
      >
        <span
          className={cn(
            'truncate text-left',
            !selectedLabel && 'text-muted-foreground',
          )}
        >
          {selectedLabel || (loading ? 'Cargando…' : placeholder)}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-80 overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-lg"
        >
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar…"
              className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-64 overflow-auto p-1">
            {flatItems.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                {emptyText}
              </div>
            )}
            {flatItems.length > 0 &&
              filteredGroups.map((g) => (
                <ComboboxGroupView
                  key={g.label || '__nolabel__'}
                  group={g}
                  value={value}
                  activeValue={flatItems[activeIndex]?.value ?? null}
                  onPick={select}
                  onHover={(v) => {
                    const idx = flatItems.findIndex((it) => it.value === v);
                    if (idx >= 0) setActiveIndex(idx);
                  }}
                  cap={maxVisible}
                />
              ))}
            {flatItems.length === maxVisible && (
              <div className="px-2 py-1.5 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                Mostrando {maxVisible} primeros · refina la búsqueda
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ComboboxGroupView({
  group,
  value,
  activeValue,
  onPick,
  onHover,
  cap,
}: {
  group: ComboboxGroup;
  value: string;
  activeValue: string | null;
  onPick: (it: ComboboxItem) => void;
  onHover: (v: string) => void;
  cap: number;
}) {
  return (
    <div>
      {group.label && (
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {group.label}
        </div>
      )}
      {group.items.slice(0, cap).map((it) => {
        const selected = it.value === value;
        const active = it.value === activeValue;
        return (
          <button
            key={it.value}
            type="button"
            role="option"
            aria-selected={selected}
            onMouseEnter={() => onHover(it.value)}
            onClick={() => onPick(it)}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
              active && 'bg-muted text-foreground',
              selected && !active && 'bg-accent/10',
            )}
          >
            <span
              className={cn(
                'flex h-3.5 w-3.5 shrink-0 items-center justify-center',
                selected ? 'opacity-100' : 'opacity-0',
              )}
            >
              <Check className="h-3.5 w-3.5" />
            </span>
            <span className="truncate font-mono">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function matches(it: ComboboxItem, q: string): boolean {
  if (it.label.toLowerCase().includes(q)) return true;
  if (it.value.toLowerCase().includes(q)) return true;
  if (it.searchText && it.searchText.toLowerCase().includes(q)) return true;
  return false;
}
