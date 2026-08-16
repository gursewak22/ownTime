import { Sparkles } from 'lucide-react';
import type { ServiceModule } from '../registry';
import { AssistantPanel } from './pages/AssistantPanel';

export const assistantModule: ServiceModule = {
  id: 'assistant',
  label: 'Assistant',
  icon: Sparkles,
  panelComponent: AssistantPanel,
  singleton: true,
};
