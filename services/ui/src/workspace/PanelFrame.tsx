import { useDraggable, useDroppable } from '@dnd-kit/core';
import { X } from 'lucide-react';
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

  const { hover } = useWorkspaceDrag();
  const drag = useDraggable({ id: instanceId, data: { type: 'panel', serviceId } });
  const drop = useDroppable({ id: instanceId });
  const dropEdge = hover?.nodeId === instanceId ? hover.edge : null;

  return (
    <div ref={drop.setNodeRef} className="relative flex h-full flex-col bg-bg">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-bg px-3">
        <div
          ref={drag.setNodeRef}
          {...drag.listeners}
          {...drag.attributes}
          className={cn(
            'flex flex-1 cursor-grab select-none items-center gap-2 text-sm font-medium touch-none active:cursor-grabbing',
            drag.isDragging && 'opacity-40',
          )}
          title="Drag to move this panel"
        >
          {service ? (
            <>
              <service.icon className="h-4 w-4 text-muted" />
              <span>{service.label}</span>
            </>
          ) : (
            <span className="text-danger">Unknown service: {serviceId}</span>
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
      <div className={cn('min-h-0 flex-1 overflow-auto', drag.isDragging && 'opacity-40')}>
        {PanelComponent ? <PanelComponent instanceId={instanceId} /> : null}
      </div>
      {dropEdge && <DropIndicator edge={dropEdge} />}
    </div>
  );
}

/**
 * Drop feedback: a thin solid insertion line flush against the hovered edge
 * (where the dragged panel will land), or a full-panel outline + "Swap" badge
 * for a center drop.
 */
function DropIndicator({ edge }: { edge: DropEdge }) {
  if (edge === 'center') {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-accent/10 ring-2 ring-inset ring-accent">
        <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-white shadow">
          Swap ⇄
        </span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        'pointer-events-none absolute z-10 rounded-full bg-accent transition-all',
        edge === 'left' && 'inset-y-0 left-0 w-1',
        edge === 'right' && 'inset-y-0 right-0 w-1',
        edge === 'top' && 'inset-x-0 top-0 h-1',
        edge === 'bottom' && 'inset-x-0 bottom-0 h-1',
      )}
    />
  );
}
