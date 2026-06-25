import { ArrowLeft, ArrowRight, ExternalLink, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type Props = {
  address: string;
  onAddressChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onOpenExternal: () => void;
  canBack: boolean;
  canForward: boolean;
  hasUrl: boolean;
};

/** Shared address bar + nav controls used by both the iframe and webview panels. */
export function BrowserToolbar({
  address,
  onAddressChange,
  onSubmit,
  onBack,
  onForward,
  onReload,
  onOpenExternal,
  canBack,
  canForward,
  hasUrl,
}: Props) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex shrink-0 items-center gap-1 border-b border-border bg-bg p-2"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        disabled={!canBack}
        onClick={onBack}
        aria-label="Back"
        title="Back"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        disabled={!canForward}
        onClick={onForward}
        aria-label="Forward"
        title="Forward"
      >
        <ArrowRight className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        disabled={!hasUrl}
        onClick={onReload}
        aria-label="Reload"
        title="Reload"
      >
        <RotateCw className="h-4 w-4" />
      </Button>
      <Input
        value={address}
        onChange={(e) => onAddressChange(e.target.value)}
        placeholder="Enter a URL…"
        className="h-8 flex-1"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <Button type="submit" size="sm" className="h-8 shrink-0">
        Go
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        disabled={!hasUrl}
        onClick={onOpenExternal}
        aria-label="Open in new browser tab"
        title="Open in new browser tab"
      >
        <ExternalLink className="h-4 w-4" />
      </Button>
    </form>
  );
}

/** Centered placeholder shown before any URL is entered. */
export function BrowserEmptyState({ desktop }: { desktop: boolean }) {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div className="max-w-xs space-y-2">
        <h2 className="text-sm font-semibold">Web</h2>
        <p className="text-xs text-muted">
          {desktop
            ? 'Type a URL in the bar above and press Go. Any site works here, like a normal browser tab.'
            : 'Type a URL in the bar above and press Go. Note: some sites (Google, YouTube, X…) block being embedded — use “Open in new tab” for those, or run the desktop app.'}
        </p>
      </div>
    </div>
  );
}
