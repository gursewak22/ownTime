import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  GripVertical,
  Repeat2,
  X,
} from 'lucide-react';
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

  // Highlight droppable targets while dragging so it's clear where a panel can go.
  const isTarget = dragActive && !isDragging;

  return (
    <div
      ref={drop.setNodeRef}
      className={cn(
        'relative flex h-full flex-col bg-bg',
        isDragging && 'opacity-40',
        isTarget && 'ring-1 ring-inset ring-accent/30',
      )}
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

      {isTarget && hoverEdge && <DropPreview edge={hoverEdge} />}
    </div>
  );
}

/** Where the dragged panel will land for each edge (center = the whole panel, a swap). */
const PREVIEW_CLASSES: Record<DropEdge, string> = {
  left: 'left-0 top-0 h-full w-1/2',
  right: 'right-0 top-0 h-full w-1/2',
  top: 'left-0 top-0 h-1/2 w-full',
  bottom: 'bottom-0 left-0 h-1/2 w-full',
  center: 'inset-0',
};

const PREVIEW_META: Record<DropEdge, { icon: typeof ArrowLeftToLine; label: string }> = {
  left: { icon: ArrowLeftToLine, label: 'Place left' },
  right: { icon: ArrowRightToLine, label: 'Place right' },
  top: { icon: ArrowUpToLine, label: 'Place above' },
  bottom: { icon: ArrowDownToLine, label: 'Place below' },
  center: { icon: Repeat2, label: 'Swap' },
};

/**
 * Solid preview of the area the dragged panel will occupy on drop, with a label.
 * A left/right fill implies a vertical divider (horizontal split); top/bottom a
 * horizontal divider; center means the two panels swap.
 */
function DropPreview({ edge }: { edge: DropEdge }) {
  const { icon: Icon, label } = PREVIEW_META[edge];
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        className={cn(
          'absolute flex items-center justify-center rounded-sm bg-accent/25 ring-2 ring-inset ring-accent transition-all duration-75',
          PREVIEW_CLASSES[edge],
        )}
      >
        <span className="flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg shadow">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
      </div>
    </div>
  );
}
