import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

type Props = {
  color: string; // hex
  onChange: (hex: string) => void;
};

const WHEEL_SIZE = 160;

/**
 * HSL color wheel: hue = angle (0° at 12 o'clock, clockwise), saturation =
 * distance from center, plus a lightness slider. Pure CSS gradients render the
 * wheel; pointer events (mouse/touch/stylus alike) drive the thumb.
 */
export function ColorWheel({ color, onChange }: Props) {
  const initial = hexToHsl(color) ?? { h: 0, s: 1, l: 0.5 };
  const [hsl, setHsl] = useState(initial);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  function pick(h: number, s: number, l: number) {
    const next = { h, s, l };
    setHsl(next);
    onChange(hslToHex(next.h, next.s, next.l));
  }

  function fromPointer(e: React.PointerEvent) {
    const rect = wheelRef.current!.getBoundingClientRect();
    const r = rect.width / 2;
    const dx = e.clientX - (rect.left + r);
    const dy = e.clientY - (rect.top + r);
    // 0° at 12 o'clock, clockwise — matches the conic-gradient below.
    const h = (Math.atan2(dx, -dy) * (180 / Math.PI) + 360) % 360;
    const s = Math.min(1, Math.hypot(dx, dy) / r);
    pick(h, s, hsl.l);
  }

  const radius = WHEEL_SIZE / 2;
  const angleRad = (hsl.h * Math.PI) / 180;
  const thumbX = radius + Math.sin(angleRad) * hsl.s * (radius - 8);
  const thumbY = radius - Math.cos(angleRad) * hsl.s * (radius - 8);
  const current = hslToHex(hsl.h, hsl.s, hsl.l);

  return (
    <div className="space-y-2 p-3">
      <div
        ref={wheelRef}
        role="slider"
        aria-label="Hue and saturation"
        aria-valuetext={current}
        className="relative touch-none cursor-crosshair rounded-full"
        style={{
          width: WHEEL_SIZE,
          height: WHEEL_SIZE,
          background:
            'radial-gradient(circle, #fff 0%, rgba(255,255,255,0) 70%), ' +
            'conic-gradient(hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))',
        }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (dragging.current) fromPointer(e);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        <div
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/20"
          style={{ left: thumbX, top: thumbY, backgroundColor: current }}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="range"
          aria-label="Lightness"
          min={5}
          max={95}
          value={Math.round(hsl.l * 100)}
          onChange={(e) => pick(hsl.h, hsl.s, Number(e.target.value) / 100)}
          className="h-2 w-full appearance-none rounded-full outline-none"
          style={{
            background: `linear-gradient(to right, #000, hsl(${hsl.h} ${hsl.s * 100}% 50%), #fff)`,
          }}
        />
        <span
          className="h-6 w-6 shrink-0 rounded-full border border-border"
          style={{ backgroundColor: current }}
          title={current}
        />
      </div>
    </div>
  );
}

/** Popover wrapper: trigger button + dismissable panel (AddPanelMenu pattern). */
export function ColorWheelPopover({
  color,
  onChange,
  trigger,
  label,
  extra,
}: Props & { trigger: React.ReactNode; label: string; extra?: React.ReactNode }) {
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
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded',
          open ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-muted/10 hover:text-fg',
        )}
      >
        {trigger}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 rounded-md border border-border bg-bg shadow-lg">
          <ColorWheel color={color} onChange={onChange} />
          {extra}
        </div>
      )}
    </div>
  );
}

// --- tiny hex/HSL converters (enough for the picker; no dependency) ---

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
