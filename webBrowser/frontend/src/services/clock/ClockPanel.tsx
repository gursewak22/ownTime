import { AlarmClock, Bell, Clock, Hourglass } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '@/lib/cn';
import { usePreference } from '@/preferences/use-preference';
import { AlarmMode } from './modes/AlarmMode';
import { ClockMode } from './modes/ClockMode';
import { StopwatchMode } from './modes/StopwatchMode';
import { TimerMode } from './modes/TimerMode';

type Mode = 'clock' | 'stopwatch' | 'timer' | 'alarm';

type Tab = {
  id: Mode;
  label: string;
  icon: ComponentType<{ className?: string }>;
  Component: ComponentType;
};

const TABS: Tab[] = [
  { id: 'clock', label: 'Clock', icon: Clock, Component: ClockMode },
  { id: 'stopwatch', label: 'Stopwatch', icon: AlarmClock, Component: StopwatchMode },
  { id: 'timer', label: 'Timer', icon: Hourglass, Component: TimerMode },
  { id: 'alarm', label: 'Alarm', icon: Bell, Component: AlarmMode },
];

const MODE_VALUES = TABS.map((t) => t.id);

type Props = { instanceId: string };

export function ClockPanel({ instanceId }: Props) {
  const pref = usePreference<Mode>('clock', `mode:${instanceId}`, 'clock');
  const active: Mode = MODE_VALUES.includes(pref.value as Mode) ? (pref.value as Mode) : 'clock';
  const ActiveComponent = TABS.find((t) => t.id === active)?.Component ?? ClockMode;

  return (
    <div className="flex h-full flex-col">
      <nav
        role="tablist"
        aria-label="Clock mode"
        className="flex shrink-0 gap-1 border-b border-border px-2 py-1.5"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => pref.setValue(t.id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-muted hover:bg-muted/10 hover:text-fg',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </nav>
      <div className="min-h-0 flex-1">
        <ActiveComponent />
      </div>
    </div>
  );
}
