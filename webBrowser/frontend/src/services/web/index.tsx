import { Globe } from 'lucide-react';
import type { ServiceModule } from '../registry';
import { WebPanel } from './WebPanel';

export const webModule: ServiceModule = {
  id: 'web',
  label: 'Web',
  icon: Globe,
  panelComponent: WebPanel,
};
