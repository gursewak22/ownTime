import { LayoutGrid, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { UserSwitcher } from '@/components/shell/UserSwitcher';
import { services } from '@/services/registry';
import { AddPanelMenu } from './AddPanelMenu';
import { Workspace } from './Workspace';
import { useWorkspaceLayout } from './use-workspace-layout';

export function WorkspaceShell() {
  const { layout, isLoading, addPanel, removePanel, resize, reset } = useWorkspaceLayout();

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
          <AddPanelMenu onAdd={addPanel} />
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
          <Workspace node={layout} onRemove={removePanel} onResize={resize} />
        ) : (
          <EmptyWorkspace onAdd={(id) => addPanel(id, 'horizontal')} />
        )}
      </div>
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
