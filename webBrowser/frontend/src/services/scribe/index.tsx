import { NotebookPen } from 'lucide-react';
import type { ServiceModule } from '../registry';
import { ScribePanel } from './pages/ScribePanel';

export const scribeModule: ServiceModule = {
  id: 'scribe',
  label: 'Scribe',
  icon: NotebookPen,
  panelComponent: ScribePanel,
  // Not a singleton: multiple panels can be open on different notes.
};
