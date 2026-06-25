import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePreference } from '@/preferences/use-preference';
import { services } from '@/services/registry';
import {
  appendPanel,
  collectServiceIds,
  defaultLayout,
  enforceSingletons,
  isLayoutNode,
  pruneUnknownServices,
  moveNode,
  removeNode,
  splitAt,
  updateSizes,
} from './layout-ops';
import type { DropEdge, SplitPosition } from './layout-ops';
import type { LayoutNode } from './types';

const PERSIST_DEBOUNCE_MS = 400;

type WorkspaceLayout = {
  layout: LayoutNode | null;
  isLoading: boolean;
  /** Service ids that should NOT be offered in Add/Split menus (singletons already in the tree). */
  disabledServiceIds: ReadonlySet<string>;
  addPanel: (serviceId: string, direction: 'horizontal' | 'vertical') => void;
  splitPanel: (
    targetId: string,
    serviceId: string,
    direction: 'horizontal' | 'vertical',
    position: SplitPosition,
  ) => void;
  movePanel: (sourceId: string, targetId: string, edge: DropEdge) => void;
  removePanel: (nodeId: string) => void;
  resize: (splitId: string, sizes: number[]) => void;
  reset: () => void;
};

export function useWorkspaceLayout(): WorkspaceLayout {
  const stored = usePreference<unknown>('shell', 'layout', null);
  const [layout, setLayout] = useState<LayoutNode | null>(null);

  // Hydrate from stored prefs, validating + pruning + enforcing singletons.
  useEffect(() => {
    if (stored.isLoading) return;
    const validated = isLayoutNode(stored.value) ? stored.value : null;
    const pruned = validated ? pruneUnknownServices(validated) : null;
    const sanitized = pruned ? enforceSingletons(pruned) : null;
    setLayout(sanitized ?? defaultLayout());
    // We intentionally only re-hydrate when the user changes (which makes
    // stored.isLoading flip back to true and value reload from the server).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored.isLoading]);

  // Debounced persist on layout change.
  const setValue = stored.setValue;
  const lastSentRef = useRef<string | null>(null);
  useEffect(() => {
    if (layout === null || stored.isLoading) return;
    const serialized = JSON.stringify(layout);
    if (serialized === lastSentRef.current) return;
    const t = setTimeout(() => {
      lastSentRef.current = serialized;
      setValue(layout as unknown);
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [layout, setValue, stored.isLoading]);

  const addPanel = useCallback(
    (serviceId: string, direction: 'horizontal' | 'vertical') => {
      setLayout((current) =>
        current ? appendPanel(current, serviceId, direction) : { type: 'leaf', id: serviceId, serviceId },
      );
    },
    [],
  );

  const splitPanel = useCallback(
    (
      targetId: string,
      serviceId: string,
      direction: 'horizontal' | 'vertical',
      position: SplitPosition,
    ) => {
      setLayout((current) =>
        current ? splitAt(current, targetId, serviceId, direction, position) : current,
      );
    },
    [],
  );

  const movePanel = useCallback((sourceId: string, targetId: string, edge: DropEdge) => {
    setLayout((current) => (current ? moveNode(current, sourceId, targetId, edge) : current));
  }, []);

  const removePanel = useCallback((nodeId: string) => {
    setLayout((current) => (current ? removeNode(current, nodeId) : null));
  }, []);

  const resize = useCallback((splitId: string, sizes: number[]) => {
    setLayout((current) => (current ? updateSizes(current, splitId, sizes) : current));
  }, []);

  const reset = useCallback(() => setLayout(defaultLayout()), []);

  const disabledServiceIds = useMemo(() => {
    const present = collectServiceIds(layout);
    const disabled = new Set<string>();
    for (const svc of services) {
      if (svc.singleton && present.has(svc.id)) disabled.add(svc.id);
    }
    return disabled;
  }, [layout]);

  return {
    layout,
    isLoading: stored.isLoading,
    disabledServiceIds,
    addPanel,
    splitPanel,
    movePanel,
    removePanel,
    resize,
    reset,
  };
}
