import { ChevronDown, Plus, Rows3, Columns3 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { services } from '@/services/registry';

type Props = {
  onAdd: (serviceId: string, direction: 'horizontal' | 'vertical') => void;
};

export function AddPanelMenu({ onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'horizontal' | 'vertical'>('horizontal');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          <Plus className="h-4 w-4" />
          Add panel
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
        <DirectionToggle value={direction} onChange={setDirection} />
      </div>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-md border border-border bg-bg shadow-lg"
        >
          <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted">
            split {direction === 'horizontal' ? '→' : '↓'}
          </div>
          {services.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/10"
                onClick={() => {
                  onAdd(s.id, direction);
                  setOpen(false);
                }}
              >
                <Icon className="h-4 w-4 text-muted" />
                {s.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DirectionToggle({
  value,
  onChange,
}: {
  value: 'horizontal' | 'vertical';
  onChange: (v: 'horizontal' | 'vertical') => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border">
      <button
        type="button"
        aria-label="Split horizontally (side by side)"
        title="Split side by side"
        className={cn(
          'flex h-8 w-8 items-center justify-center text-muted hover:bg-muted/10',
          value === 'horizontal' && 'bg-accent/10 text-accent',
        )}
        onClick={() => onChange('horizontal')}
      >
        <Columns3 className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Split vertically (stacked)"
        title="Split stacked"
        className={cn(
          'flex h-8 w-8 items-center justify-center border-l border-border text-muted hover:bg-muted/10',
          value === 'vertical' && 'bg-accent/10 text-accent',
        )}
        onClick={() => onChange('vertical')}
      >
        <Rows3 className="h-4 w-4" />
      </button>
    </div>
  );
}
