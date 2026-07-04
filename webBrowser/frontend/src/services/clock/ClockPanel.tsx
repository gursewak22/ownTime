import { AlarmClock, Clock, Hourglass } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '@/lib/cn';
import { usePreference } from '@/preferences/use-preference';
import { ClockMode } from './modes/ClockMode';
import { StopwatchMode } from './modes/StopwatchMode';
import { TimerMode } from './modes/TimerMode';

type Mode = 'clock' | 'stopwatch' | 'timer';

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
];

const MODE_VALUES = TABS.map((t) => t.id);

type Props = { instanceId: string };

export function ClockPanel({ instanceId }: Props) {
  const pref = usePreference<Mode>('clock', `mode:${instanceId}`, 'clock');
  const active: Mode = MODE_VALUES.includes(pref.value as Mode) ? (pref.value as Mode) : 'clock';

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
      <div className="min-h-0 flex-1 overflow-auto">
        {TABS.map((t) => {
          const Component = t.Component;
          const isActive = t.id === active;
          // All modes stay mounted so their state (e.g. a running stopwatch or
          // timer) survives tab switches; inactive ones are just hidden.
          return (
            <div key={t.id} className={cn('h-full', !isActive && 'hidden')}>
              <Component />
            </div>
          );
        })}
      </div>
    </div>
  );
}
