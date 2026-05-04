import { Clock } from 'lucide-react';
import type { ServiceModule } from '../registry';
import { ClockPanel } from './ClockPanel';

export const clockModule: ServiceModule = {
  id: 'clock',
  label: 'Clock',
  icon: Clock,
  panelComponent: ClockPanel,
};
