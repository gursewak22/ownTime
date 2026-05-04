function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "HH:MM:SS" 24-hour. */
export function formatHms(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/** "HH:MM" 24-hour — used by alarms. */
export function formatHm(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** "Weekday, Mon DD" */
export function formatLongDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/** Total ms → "MM:SS.ms" with hours folded into MM if needed. Stopwatch/timer display. */
export function formatDuration(totalMs: number): string {
  const ms = Math.max(0, totalMs);
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${pad2(minutes)}:${pad2(seconds)}.${pad2(hundredths)}`;
}
