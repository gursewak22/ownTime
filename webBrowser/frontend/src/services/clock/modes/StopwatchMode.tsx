import { Pause, Play, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatDuration } from '../format';
import { useTick } from '../use-tick';

type State =
  | { running: false; accumulatedMs: number }
  | { running: true; accumulatedMs: number; startedAt: number };

export function StopwatchMode() {
  const [state, setState] = useState<State>({ running: false, accumulatedMs: 0 });
  const now = useTick(31, state.running);

  const elapsed = state.running ? state.accumulatedMs + (now - state.startedAt) : state.accumulatedMs;

  function start() {
    setState({ running: true, accumulatedMs: state.accumulatedMs, startedAt: Date.now() });
  }
  function pause() {
    if (!state.running) return;
    setState({
      running: false,
      accumulatedMs: state.accumulatedMs + (Date.now() - state.startedAt),
    });
  }
  function reset() {
    setState({ running: false, accumulatedMs: 0 });
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-4">
      <div className="font-mono text-6xl font-semibold tabular-nums">{formatDuration(elapsed)}</div>
      <div className="flex items-center gap-2">
        {state.running ? (
          <Button onClick={pause} variant="secondary">
            <Pause className="h-4 w-4" /> Pause
          </Button>
        ) : (
          <Button onClick={start}>
            <Play className="h-4 w-4" /> {elapsed === 0 ? 'Start' : 'Resume'}
          </Button>
        )}
        <Button onClick={reset} variant="ghost" disabled={elapsed === 0 && !state.running}>
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
      </div>
    </div>
  );
}
