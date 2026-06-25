import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { LayoutGrid, RotateCcw } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { UserSwitcher } from '@/components/shell/UserSwitcher';
import { getService, services } from '@/services/registry';
import { AddPanelMenu } from './AddPanelMenu';
import { Workspace } from './Workspace';
import { WorkspaceDragProvider, type DragState } from './drag-context';
import { computeEdge } from './drag-edge';
import { useWorkspaceLayout } from './use-workspace-layout';

export function WorkspaceShell() {
  const {
    layout,
    isLoading,
    disabledServiceIds,
    addPanel,
    splitPanel,
    movePanel,
    removePanel,
    resize,
    reset,
  } = useWorkspaceLayout();

  const [drag, setDrag] = useState<DragState>({ activeId: null, hover: null });
  const pointer = useRef({ x: 0, y: 0 });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const trackPointer = useCallback((e: PointerEvent) => {
    pointer.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      setDrag({ activeId: String(e.active.id), hover: null });
      window.addEventListener('pointermove', trackPointer);
    },
    [trackPointer],
  );

  const onDragOver = useCallback((e: DragOverEvent) => {
    const sourceId = String(e.active.id);
    const over = e.over;
    if (over && String(over.id) !== sourceId && over.rect) {
      const edge = computeEdge(over.rect, pointer.current.x, pointer.current.y);
      setDrag((d) => ({ ...d, hover: { nodeId: String(over.id), edge } }));
    } else {
      setDrag((d) => (d.hover ? { ...d, hover: null } : d));
    }
  }, []);

  const endDrag = useCallback(() => {
    setDrag({ activeId: null, hover: null });
    window.removeEventListener('pointermove', trackPointer);
  }, [trackPointer]);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const sourceId = String(e.active.id);
      const over = e.over;
      if (over && String(over.id) !== sourceId && over.rect) {
        const edge = computeEdge(over.rect, pointer.current.x, pointer.current.y);
        movePanel(sourceId, String(over.id), edge);
      }
      endDrag();
    },
    [movePanel, endDrag],
  );

  const activeServiceId = drag.activeId ? findServiceId(drag.activeId, layout) : '';
  const activeService = activeServiceId ? getService(activeServiceId) : undefined;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-bg px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-base font-semibold">
            <LayoutGrid className="h-4 w-4 text-accent" />
            ownTime
          </div>
          <span className="text-xs text-muted">workspace</span>
        </div>

        <div className="flex items-center gap-3">
          <AddPanelMenu onAdd={addPanel} disabledServiceIds={disabledServiceIds} />
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            title="Reset to default layout"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
          <div className="h-6 w-px bg-border" />
          <UserSwitcher />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <CenteredHint>Loading workspace…</CenteredHint>
        ) : layout ? (
          <DndContext
            sensors={sensors}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={endDrag}
          >
            <WorkspaceDragProvider value={drag}>
              <Workspace
                node={layout}
                onRemove={removePanel}
                onResize={resize}
                onSplit={splitPanel}
                disabledServiceIds={disabledServiceIds}
              />
            </WorkspaceDragProvider>
            <DragOverlay dropAnimation={null}>
              {activeService ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-1.5 text-sm font-medium shadow-lg">
                  <activeService.icon className="h-4 w-4 text-muted" />
                  <span>{activeService.label}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <EmptyWorkspace onAdd={(id) => addPanel(id, 'horizontal')} />
        )}
      </div>
    </div>
  );
}

/** Walk the layout tree to find the serviceId for a leaf id (for the drag ghost). */
function findServiceId(
  nodeId: string,
  node: ReturnType<typeof useWorkspaceLayout>['layout'],
): string {
  if (!node) return '';
  if (node.type === 'leaf') return node.id === nodeId ? node.serviceId : '';
  for (const child of node.children) {
    const hit = findServiceId(nodeId, child);
    if (hit) return hit;
  }
  return '';
}

function CenteredHint({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full place-items-center text-sm text-muted">{children}</div>;
}

function EmptyWorkspace({ onAdd }: { onAdd: (serviceId: string) => void }) {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="max-w-sm space-y-3 text-center">
        <h2 className="text-lg font-semibold">Empty workspace</h2>
        <p className="text-sm text-muted">Add a panel to start. You can split horizontally or vertically.</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {services.map((s) => {
            const Icon = s.icon;
            return (
              <Button key={s.id} variant="secondary" size="sm" onClick={() => onAdd(s.id)}>
                <Icon className="h-4 w-4" />
                {s.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
