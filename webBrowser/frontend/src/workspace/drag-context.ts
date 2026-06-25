import { createContext, useContext } from 'react';
import type { DropEdge } from './layout-ops';

export type DragState = {
  /** The leaf id currently being dragged, or null when no drag is active. */
  activeId: string | null;
  /** The leaf being hovered over and the edge under the pointer, while dragging. */
  hover: { nodeId: string; edge: DropEdge } | null;
};

const WorkspaceDragContext = createContext<DragState>({ activeId: null, hover: null });

export const WorkspaceDragProvider = WorkspaceDragContext.Provider;

export function useWorkspaceDrag(): DragState {
  return useContext(WorkspaceDragContext);
}
