import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getService } from '@/services/registry';

type Props = {
  serviceId: string;
  onClose: () => void;
};

export function PanelFrame({ serviceId, onClose }: Props) {
  const service = getService(serviceId);

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
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X className="h-4 w-4 text-muted" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {service ? service.panelElement : null}
      </div>
    </div>
  );
}
