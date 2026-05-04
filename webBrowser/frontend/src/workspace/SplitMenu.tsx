import { ArrowDown, ArrowRight, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { services } from '@/services/registry';

type Props = {
  onSplit: (serviceId: string, direction: 'horizontal' | 'vertical') => void;
  disabledServiceIds: ReadonlySet<string>;
};

export function SplitMenu({ onSplit, disabledServiceIds }: Props) {
  const [open, setOpen] = useState(false);
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
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen((v) => !v)}
        aria-label="Split this panel"
        title="Split this panel"
      >
        <Plus className="h-4 w-4 text-muted" />
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-md border border-border bg-bg shadow-lg"
        >
          <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted">
            Split this panel
          </div>
          <ul className="py-1">
            {services.map((s) => {
              const Icon = s.icon;
              const disabled = disabledServiceIds.has(s.id);
              return (
                <li
                  key={s.id}
                  className={`flex items-center justify-between gap-2 px-2 py-1 text-sm ${
                    disabled ? 'opacity-50' : 'hover:bg-muted/10'
                  }`}
                  title={disabled ? `${s.label} can only have one panel` : undefined}
                >
                  <span className="flex min-w-0 items-center gap-2 px-1">
                    <Icon className="h-4 w-4 shrink-0 text-muted" />
                    <span className="truncate">{s.label}</span>
                    {disabled && (
                      <span className="text-[10px] uppercase tracking-wider text-muted">
                        single
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      role="menuitem"
                      type="button"
                      title="Add to the right"
                      aria-label={`Add ${s.label} to the right`}
                      disabled={disabled}
                      className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-muted/10 hover:text-fg disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted"
                      onClick={() => {
                        if (disabled) return;
                        onSplit(s.id, 'horizontal');
                        setOpen(false);
                      }}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      role="menuitem"
                      type="button"
                      title="Add below"
                      aria-label={`Add ${s.label} below`}
                      disabled={disabled}
                      className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-muted/10 hover:text-fg disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted"
                      onClick={() => {
                        if (disabled) return;
                        onSplit(s.id, 'vertical');
                        setOpen(false);
                      }}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
