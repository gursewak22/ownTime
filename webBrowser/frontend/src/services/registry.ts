import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { clockModule } from './clock';
import { todoModule } from './todo';

export type PanelComponentProps = {
  /** Stable id for this panel instance (the workspace LeafNode.id). Use it to scope panel-local preferences. */
  instanceId: string;
};

export type ServiceModule = {
  id: string;
  label: string;
  icon: LucideIcon;
  panelComponent: ComponentType<PanelComponentProps>;
  /** When true, only one panel of this service may exist in the workspace at a time. */
  singleton?: boolean;
};

export const services: ServiceModule[] = [todoModule, clockModule];

export function getService(id: string): ServiceModule | undefined {
  return services.find((s) => s.id === id);
}
