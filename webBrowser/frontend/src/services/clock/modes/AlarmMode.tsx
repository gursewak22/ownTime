import { Bell, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { usePreference } from '@/preferences/use-preference';
import { beepBurst } from '../beep';
import { formatHm } from '../format';
import { useTick } from '../use-tick';

type Alarm = {
  id: string;
  time: string; // "HH:MM"
  label: string;
  enabled: boolean;
};

export function AlarmMode() {
  const pref = usePreference<Alarm[]>('clock', 'alarms', []);
  const alarms = pref.value ?? [];

  const now = useTick(1000);
  const [time, setTime] = useState('07:00');
  const [label, setLabel] = useState('');
  const [firingId, setFiringId] = useState<string | null>(null);
  const lastFiredRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const current = formatHm(new Date(now));
    for (const a of alarms) {
      if (!a.enabled) continue;
      if (a.time !== current) continue;
      if (lastFiredRef.current.get(a.id) === current) continue;
      lastFiredRef.current.set(a.id, current);
      beepBurst(5, 250);
      setFiringId(a.id);
      setTimeout(() => setFiringId((id) => (id === a.id ? null : id)), 4000);
    }
  }, [now, alarms]);

  function add() {
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    const next: Alarm[] = [
      ...alarms,
      { id: uuid(), time, label: label.trim(), enabled: true },
    ];
    pref.setValue(next);
    setLabel('');
  }

  function toggle(id: string) {
    pref.setValue(alarms.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
  }

  function remove(id: string) {
    pref.setValue(alarms.filter((a) => a.id !== id));
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">time</span>
          <Input
            type="time"
            className="w-28"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">label</span>
          <Input
            placeholder="optional"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
          />
        </label>
        <Button onClick={add}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {alarms.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          No alarms yet.
        </div>
      ) : (
        <ul className="flex-1 space-y-1 overflow-auto">
          {[...alarms]
            .sort((a, b) => a.time.localeCompare(b.time))
            .map((a) => (
              <li
                key={a.id}
                className={`flex items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
                  firingId === a.id
                    ? 'border-accent bg-accent/10'
                    : 'border-border'
                }`}
              >
                <Checkbox
                  checked={a.enabled}
                  onChange={() => toggle(a.id)}
                  aria-label={`${a.enabled ? 'Disable' : 'Enable'} alarm at ${a.time}`}
                />
                <Bell
                  className={`h-4 w-4 ${a.enabled ? 'text-accent' : 'text-muted'}`}
                />
                <div className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="font-mono text-base tabular-nums">{a.time}</span>
                  {a.label && (
                    <span className="truncate text-sm text-muted">{a.label}</span>
                  )}
                  {firingId === a.id && (
                    <span className="ml-auto text-xs font-semibold uppercase tracking-wider text-accent">
                      Ringing
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => remove(a.id)}
                  aria-label={`Delete alarm at ${a.time}`}
                >
                  <Trash2 className="h-4 w-4 text-muted" />
                </Button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
