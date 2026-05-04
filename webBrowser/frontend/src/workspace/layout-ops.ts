import { v4 as uuid } from 'uuid';
import { services } from '@/services/registry';
import type { LayoutNode, LeafNode, SplitNode } from './types';

export function makeLeaf(serviceId: string): LeafNode {
  return { type: 'leaf', id: uuid(), serviceId };
}

export function defaultLayout(): LayoutNode {
  const first = services[0];
  if (!first) throw new Error('No services registered');
  return makeLeaf(first.id);
}

/** Append a new leaf as a sibling to the root in the given direction. */
export function appendPanel(
  root: LayoutNode,
  serviceId: string,
  direction: 'horizontal' | 'vertical',
): LayoutNode {
  const newLeaf = makeLeaf(serviceId);

  if (root.type === 'split' && root.direction === direction) {
    const children = [...root.children, newLeaf];
    return {
      ...root,
      children,
      sizes: equalSizes(children.length),
    };
  }

  return {
    type: 'split',
    id: uuid(),
    direction,
    children: [root, newLeaf],
    sizes: [50, 50],
  };
}

/**
 * Split a specific leaf (or split) in place. If the parent split is already in the same
 * direction, the new leaf is inserted as a direct sibling next to the target. Otherwise,
 * the target is wrapped in a new sub-split.
 */
export function splitAt(
  root: LayoutNode,
  targetId: string,
  serviceId: string,
  direction: 'horizontal' | 'vertical',
): LayoutNode {
  const newLeaf = makeLeaf(serviceId);

  if (root.id === targetId) {
    return {
      type: 'split',
      id: uuid(),
      direction,
      children: [root, newLeaf],
      sizes: [50, 50],
    };
  }

  if (root.type === 'leaf') return root;

  const childIndex = root.children.findIndex((c) => c.id === targetId);
  if (childIndex !== -1) {
    if (root.direction === direction) {
      const next = [...root.children];
      next.splice(childIndex + 1, 0, newLeaf);
      return { ...root, children: next, sizes: equalSizes(next.length) };
    }
    const wrapped: SplitNode = {
      type: 'split',
      id: uuid(),
      direction,
      children: [root.children[childIndex], newLeaf],
      sizes: [50, 50],
    };
    const next = [...root.children];
    next[childIndex] = wrapped;
    return { ...root, children: next };
  }

  return {
    ...root,
    children: root.children.map((c) => splitAt(c, targetId, serviceId, direction)),
  };
}

/** Remove a leaf by id; collapse splits with a single remaining child. */
export function removeNode(root: LayoutNode, targetId: string): LayoutNode | null {
  if (root.id === targetId) return null;
  if (root.type === 'leaf') return root;

  const kept: LayoutNode[] = [];
  for (const child of root.children) {
    const next = removeNode(child, targetId);
    if (next !== null) kept.push(next);
  }

  if (kept.length === 0) return null;
  if (kept.length === 1) return kept[0];

  return {
    ...root,
    children: kept,
    sizes: equalSizes(kept.length),
  };
}

/** Update sizes on a split node by id. */
export function updateSizes(
  root: LayoutNode,
  splitId: string,
  sizes: number[],
): LayoutNode {
  if (root.type === 'leaf') return root;
  if (root.id === splitId) {
    return { ...root, sizes };
  }
  return {
    ...root,
    children: root.children.map((c) => updateSizes(c, splitId, sizes)),
  };
}

function equalSizes(n: number): number[] {
  const each = 100 / n;
  return Array.from({ length: n }, () => each);
}

/** Strip nodes referencing services that don't exist (e.g. after a code change). */
export function pruneUnknownServices(root: LayoutNode): LayoutNode | null {
  if (root.type === 'leaf') {
    return services.some((s) => s.id === root.serviceId) ? root : null;
  }
  const kept = root.children
    .map((c) => pruneUnknownServices(c))
    .filter((c): c is LayoutNode => c !== null);
  if (kept.length === 0) return null;
  if (kept.length === 1) return kept[0];
  return { ...root, children: kept, sizes: equalSizes(kept.length) };
}

/** Drop duplicate panels of singleton services, keeping the first occurrence. */
export function enforceSingletons(root: LayoutNode): LayoutNode | null {
  const seen = new Set<string>();
  function walk(node: LayoutNode): LayoutNode | null {
    if (node.type === 'leaf') {
      const svc = services.find((s) => s.id === node.serviceId);
      if (svc?.singleton) {
        if (seen.has(svc.id)) return null;
        seen.add(svc.id);
      }
      return node;
    }
    const kept = node.children
      .map(walk)
      .filter((c): c is LayoutNode => c !== null);
    if (kept.length === 0) return null;
    if (kept.length === 1) return kept[0];
    return { ...node, children: kept, sizes: equalSizes(kept.length) };
  }
  return walk(root);
}

/** Collect every service id present anywhere in the tree (no duplicates). */
export function collectServiceIds(root: LayoutNode | null): Set<string> {
  const out = new Set<string>();
  if (!root) return out;
  function walk(node: LayoutNode): void {
    if (node.type === 'leaf') out.add(node.serviceId);
    else node.children.forEach(walk);
  }
  walk(root);
  return out;
}

/** Lightweight runtime guard so corrupt persisted layouts don't blow up the shell. */
export function isLayoutNode(value: unknown): value is LayoutNode {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.type === 'leaf') {
    return typeof v.id === 'string' && typeof v.serviceId === 'string';
  }
  if (v.type === 'split') {
    return (
      typeof v.id === 'string' &&
      (v.direction === 'horizontal' || v.direction === 'vertical') &&
      Array.isArray(v.children) &&
      v.children.every(isLayoutNode) &&
      Array.isArray(v.sizes) &&
      (v.sizes as unknown[]).length === (v.children as unknown[]).length
    );
  }
  return false;
}
