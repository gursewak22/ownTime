import { useDraggable, useDroppable } from '@dnd-kit/core';
import { GripVertical, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { getService } from '@/services/registry';
import { SplitMenu } from './SplitMenu';
import { useWorkspaceDrag } from './drag-context';
import type { DropEdge, SplitPosition } from './layout-ops';

type Props = {
  serviceId: string;
  instanceId: string;
  onClose: () => void;
  onSplit: (
    serviceId: string,
    direction: 'horizontal' | 'vertical',
    position: SplitPosition,
  ) => void;
  disabledServiceIds: ReadonlySet<string>;
};

export function PanelFrame({
  serviceId,
  instanceId,
  onClose,
  onSplit,
  disabledServiceIds,
}: Props) {
  const service = getService(serviceId);
  const PanelComponent = service?.panelComponent;

  const { activeId, hover } = useWorkspaceDrag();
  const isDragging = activeId === instanceId;
  const dragActive = activeId !== null;

  const drag = useDraggable({ id: instanceId, data: { type: 'panel', serviceId } });
  const drop = useDroppable({ id: instanceId, data: { type: 'panel' } });

  const hoverEdge = hover?.nodeId === instanceId ? hover.edge : null;

  return (
    <div
      ref={drop.setNodeRef}
      className={cn('relative flex h-full flex-col bg-bg', isDragging && 'opacity-40')}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-bg px-3">
        <div
          ref={drag.setNodeRef}
          {...drag.listeners}
          {...drag.attributes}
          className="flex min-w-0 cursor-grab touch-none select-none items-center gap-2 text-sm font-medium active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted/60" />
          {service ? (
            <>
              <service.icon className="h-4 w-4 shrink-0 text-muted" />
              <span className="truncate">{service.label}</span>
            </>
          ) : (
            <span className="truncate text-danger">Unknown service: {serviceId}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <SplitMenu onSplit={onSplit} disabledServiceIds={disabledServiceIds} />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            aria-label="Close panel"
            title="Close panel"
          >
            <X className="h-4 w-4 text-muted" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {PanelComponent ? <PanelComponent instanceId={instanceId} /> : null}
      </div>

      {dragActive && !isDragging && <DropZoneOverlay edge={hoverEdge} />}
    </div>
  );
}

const ZONE_CLASSES: Record<DropEdge, string> = {
  left: 'left-0 top-0 h-full w-1/4',
  right: 'right-0 top-0 h-full w-1/4',
  top: 'left-0 top-0 h-1/4 w-full',
  bottom: 'bottom-0 left-0 h-1/4 w-full',
  center: 'inset-1/4',
};

const EDGES: DropEdge[] = ['left', 'right', 'top', 'bottom', 'center'];

/** Cosmetic 5-zone overlay shown over the hovered leaf while a drag is active. */
function DropZoneOverlay({ edge }: { edge: DropEdge | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {EDGES.map((e) => (
        <div
          key={e}
          className={cn(
            'absolute rounded-sm transition-colors',
            ZONE_CLASSES[e],
            edge === e ? 'bg-accent/30 ring-1 ring-inset ring-accent' : 'bg-accent/5',
          )}
        />
      ))}
    </div>
  );
}
