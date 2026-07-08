import { ListChecks } from 'lucide-react';
import type { ServiceModule } from '../registry';
import { TodoListPage } from './pages/TodoListPage';

export const todoModule: ServiceModule = {
  id: 'todo',
  label: 'Todo',
  icon: ListChecks,
  panelComponent: TodoListPage,
  singleton: true,
};
