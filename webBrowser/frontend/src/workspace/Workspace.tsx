import { Fragment } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { cn } from '@/lib/cn';
import { PanelFrame } from './PanelFrame';
import type { LayoutNode } from './types';

type Props = {
  node: LayoutNode;
  onRemove: (nodeId: string) => void;
  onResize: (splitId: string, sizes: number[]) => void;
  onSplit: (
    targetId: string,
    serviceId: string,
    direction: 'horizontal' | 'vertical',
  ) => void;
  disabledServiceIds: ReadonlySet<string>;
};

export function Workspace({ node, onRemove, onResize, onSplit, disabledServiceIds }: Props) {
  if (node.type === 'leaf') {
    return (
      <PanelFrame
        serviceId={node.serviceId}
        instanceId={node.id}
        onClose={() => onRemove(node.id)}
        onSplit={(serviceId, direction) => onSplit(node.id, serviceId, direction)}
        disabledServiceIds={disabledServiceIds}
      />
    );
  }

  return (
    <PanelGroup
      direction={node.direction}
      onLayout={(sizes) => onResize(node.id, sizes)}
    >
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && (
            <PanelResizeHandle
              className={cn(
                'shrink-0 bg-border transition-colors hover:bg-accent/40',
                node.direction === 'horizontal' ? 'w-px' : 'h-px',
              )}
            />
          )}
          <Panel defaultSize={node.sizes[i] ?? 100 / node.children.length} minSize={10}>
            <Workspace
              node={child}
              onRemove={onRemove}
              onResize={onResize}
              onSplit={onSplit}
              disabledServiceIds={disabledServiceIds}
            />
          </Panel>
        </Fragment>
      ))}
    </PanelGroup>
  );
}
