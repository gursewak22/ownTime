import { formatHms, formatLongDate } from '../format';
import { useTick } from '../use-tick';

export function ClockMode() {
  const now = useTick(1000);
  const date = new Date(now);

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-2 p-4">
      <div className="text-xs uppercase tracking-wider text-muted">{formatLongDate(date)}</div>
      <div className="font-mono text-6xl font-semibold tabular-nums">{formatHms(date)}</div>
    </div>
  );
}
