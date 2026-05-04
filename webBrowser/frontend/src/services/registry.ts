import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { todoModule } from './todo';

export type ServiceModule = {
  id: string;
  label: string;
  icon: LucideIcon;
  panelElement: ReactNode;
};

export const services: ServiceModule[] = [todoModule];

export function getService(id: string): ServiceModule | undefined {
  return services.find((s) => s.id === id);
}
