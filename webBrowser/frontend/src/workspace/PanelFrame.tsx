import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getService } from '@/services/registry';
import { SplitMenu } from './SplitMenu';

type Props = {
  serviceId: string;
  instanceId: string;
  onClose: () => void;
  onSplit: (serviceId: string, direction: 'horizontal' | 'vertical') => void;
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

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-bg px-3">
        <div className="flex items-center gap-2 text-sm font-medium">
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
      <div className="min-h-0 flex-1 overflow-auto">
        {PanelComponent ? <PanelComponent instanceId={instanceId} /> : null}
      </div>
    </div>
  );
}
