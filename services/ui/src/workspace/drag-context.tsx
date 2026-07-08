import { createContext, useContext } from 'react';
import type { DropEdge } from './layout-ops';

export type ActiveDrag = { nodeId: string; serviceId: string };
export type DropHover = { nodeId: string; edge: DropEdge };

type WorkspaceDragState = {
  activeDrag: ActiveDrag | null;
  hover: DropHover | null;
};

/**
 * Drag state provided by WorkspaceShell so leaf panels can render drop
 * indicators without threading props through the recursive Workspace tree.
 */
export const WorkspaceDragContext = createContext<WorkspaceDragState>({
  activeDrag: null,
  hover: null,
});

export function useWorkspaceDrag(): WorkspaceDragState {
  return useContext(WorkspaceDragContext);
}
