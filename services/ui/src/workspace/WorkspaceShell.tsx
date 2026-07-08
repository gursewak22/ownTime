import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import { LayoutGrid, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AuthMenu } from '@/components/shell/AuthMenu';
import { getService, services } from '@/services/registry';
import { AddPanelMenu } from './AddPanelMenu';
import { Workspace } from './Workspace';
import { WorkspaceDragContext } from './drag-context';
import type { ActiveDrag, DropHover } from './drag-context';
import { computeEdge } from './drag-edge';
import { useWorkspaceLayout } from './use-workspace-layout';

export function WorkspaceShell() {
  const {
    layout,
    isLoading,
    disabledServiceIds,
    addPanel,
    splitPanel,
    removePanel,
    movePanel,
    resize,
    reset,
  } = useWorkspaceLayout();

  const sensors = useSensors(
    // 6px activation distance so plain clicks on header buttons never start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [hover, setHover] = useState<DropHover | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  // dnd-kit events don't carry client coordinates, so track the pointer while dragging.
  useEffect(() => {
    if (!activeDrag) return;
    const onMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [activeDrag]);

  const onDragStart = useCallback((e: DragStartEvent) => {
    const activator = e.activatorEvent as PointerEvent;
    if (typeof activator.clientX === 'number') {
      pointerRef.current = { x: activator.clientX, y: activator.clientY };
    }
    const data = e.active.data.current as { serviceId?: string } | undefined;
    setActiveDrag({ nodeId: String(e.active.id), serviceId: data?.serviceId ?? '' });
  }, []);

  const onDragMove = useCallback((e: DragMoveEvent) => {
    if (!e.over || e.over.id === e.active.id) {
      setHover(null);
      return;
    }
    const { x, y } = pointerRef.current;
    setHover({ nodeId: String(e.over.id), edge: computeEdge(e.over.rect, x, y) });
  }, []);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      if (e.over && e.over.id !== e.active.id) {
        const { x, y } = pointerRef.current;
        movePanel(String(e.active.id), String(e.over.id), computeEdge(e.over.rect, x, y));
      }
      setActiveDrag(null);
      setHover(null);
    },
    [movePanel],
  );

  const onDragCancel = useCallback(() => {
    setActiveDrag(null);
    setHover(null);
  }, []);

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
          <AuthMenu />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <CenteredHint>Loading workspace…</CenteredHint>
        ) : layout ? (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <WorkspaceDragContext.Provider value={{ activeDrag, hover }}>
              <Workspace
                node={layout}
                onRemove={removePanel}
                onResize={resize}
                onSplit={splitPanel}
                disabledServiceIds={disabledServiceIds}
              />
            </WorkspaceDragContext.Provider>
            <DragOverlay dropAnimation={null}>
              {activeDrag ? <PanelDragGhost serviceId={activeDrag.serviceId} /> : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <EmptyWorkspace onAdd={(id) => addPanel(id, 'horizontal')} />
        )}
      </div>
    </div>
  );
}

function PanelDragGhost({ serviceId }: { serviceId: string }) {
  const service = getService(serviceId);
  if (!service) return null;
  const Icon = service.icon;
  return (
    // Offset below-right of the cursor so it never covers the drop indicator
    // (especially the centered "Swap ⇄" badge).
    <div className="flex w-max translate-x-5 translate-y-5 cursor-grabbing items-center gap-2 rounded-md border border-border bg-bg/95 px-3 py-1.5 text-sm font-medium shadow-lg">
      <Icon className="h-4 w-4 text-muted" />
      {service.label}
    </div>
  );
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
