import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { beepBurst } from '../beep';
import { formatDuration } from '../format';
import { useTick } from '../use-tick';

type State =
  | { running: false; remainingMs: number }
  | { running: true; endsAt: number };

const PRESETS_SEC = [60, 5 * 60, 10 * 60, 25 * 60];

export function TimerMode() {
  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(0);
  const [state, setState] = useState<State>({ running: false, remainingMs: 0 });
  const firedRef = useRef(false);

  const now = useTick(31, state.running);

  const remaining = state.running ? Math.max(0, state.endsAt - now) : state.remainingMs;

  useEffect(() => {
    if (state.running && remaining === 0 && !firedRef.current) {
      firedRef.current = true;
      beepBurst(4, 220);
      setState({ running: false, remainingMs: 0 });
    }
  }, [state.running, remaining]);

  function setFromInputs() {
    const total = Math.max(0, minutes * 60_000 + seconds * 1000);
    firedRef.current = false;
    setState({ running: false, remainingMs: total });
  }

  function applyPreset(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    setMinutes(m);
    setSeconds(s);
    firedRef.current = false;
    setState({ running: false, remainingMs: sec * 1000 });
  }

  function start() {
    if (remaining <= 0) setFromInputs();
    const fresh = remaining <= 0 ? Math.max(0, minutes * 60_000 + seconds * 1000) : remaining;
    if (fresh <= 0) return;
    firedRef.current = false;
    setState({ running: true, endsAt: Date.now() + fresh });
  }
  function pause() {
    if (!state.running) return;
    setState({ running: false, remainingMs: Math.max(0, state.endsAt - Date.now()) });
  }
  function reset() {
    firedRef.current = false;
    setState({ running: false, remainingMs: 0 });
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-4">
      <div className="font-mono text-6xl font-semibold tabular-nums">{formatDuration(remaining)}</div>

      {!state.running && remaining === 0 && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <NumberField
              label="min"
              value={minutes}
              onChange={(v) => setMinutes(clamp(v, 0, 999))}
            />
            <span className="text-2xl text-muted">:</span>
            <NumberField
              label="sec"
              value={seconds}
              onChange={(v) => setSeconds(clamp(v, 0, 59))}
            />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {PRESETS_SEC.map((sec) => (
              <Button
                key={sec}
                variant="secondary"
                size="sm"
                onClick={() => applyPreset(sec)}
              >
                {sec >= 60 ? `${Math.floor(sec / 60)} min` : `${sec} s`}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {state.running ? (
          <Button onClick={pause} variant="secondary">
            <Pause className="h-4 w-4" /> Pause
          </Button>
        ) : (
          <Button onClick={start} disabled={remaining === 0 && minutes === 0 && seconds === 0}>
            <Play className="h-4 w-4" /> {remaining > 0 ? 'Resume' : 'Start'}
          </Button>
        )}
        <Button onClick={reset} variant="ghost" disabled={remaining === 0 && !state.running}>
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col items-center gap-1">
      <Input
        type="number"
        className="w-20 text-center text-lg"
        value={value}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        min={0}
      />
      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
    </label>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
