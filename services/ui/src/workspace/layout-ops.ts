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

/** Where the new panel is placed relative to the target: before = left/up, after = right/down. */
export type SplitPosition = 'before' | 'after';

/**
 * Split a specific leaf (or split) in place. If the parent split is already in the same
 * direction, the new leaf is inserted as a direct sibling next to the target. Otherwise,
 * the target is wrapped in a new sub-split. `position` controls which side the new panel
 * lands on.
 */
export function splitAt(
  root: LayoutNode,
  targetId: string,
  serviceId: string,
  direction: 'horizontal' | 'vertical',
  position: SplitPosition = 'after',
): LayoutNode {
  return insertNodeAt(root, targetId, makeLeaf(serviceId), direction, position);
}

/** Insert an existing subtree next to `targetId` (same placement rules as splitAt). */
function insertNodeAt(
  root: LayoutNode,
  targetId: string,
  node: LayoutNode,
  direction: 'horizontal' | 'vertical',
  position: SplitPosition,
): LayoutNode {
  const pair = (target: LayoutNode): LayoutNode[] =>
    position === 'before' ? [node, target] : [target, node];

  if (root.id === targetId) {
    return {
      type: 'split',
      id: uuid(),
      direction,
      children: pair(root),
      sizes: [50, 50],
    };
  }

  if (root.type === 'leaf') return root;

  const childIndex = root.children.findIndex((c) => c.id === targetId);
  if (childIndex !== -1) {
    if (root.direction === direction) {
      const next = [...root.children];
      next.splice(position === 'before' ? childIndex : childIndex + 1, 0, node);
      return { ...root, children: next, sizes: equalSizes(next.length) };
    }
    const wrapped: SplitNode = {
      type: 'split',
      id: uuid(),
      direction,
      children: pair(root.children[childIndex]),
      sizes: [50, 50],
    };
    const next = [...root.children];
    next[childIndex] = wrapped;
    return { ...root, children: next };
  }

  return {
    ...root,
    children: root.children.map((c) => insertNodeAt(c, targetId, node, direction, position)),
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

/** Where a dragged panel is dropped relative to the target panel. */
export type DropEdge = 'left' | 'right' | 'top' | 'bottom' | 'center';

function edgeToPlacement(edge: Exclude<DropEdge, 'center'>): {
  direction: 'horizontal' | 'vertical';
  position: SplitPosition;
} {
  switch (edge) {
    case 'left':
      return { direction: 'horizontal', position: 'before' };
    case 'right':
      return { direction: 'horizontal', position: 'after' };
    case 'top':
      return { direction: 'vertical', position: 'before' };
    case 'bottom':
      return { direction: 'vertical', position: 'after' };
  }
}

function findNode(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return root;
  if (root.type === 'leaf') return null;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function containsId(node: LayoutNode, id: string): boolean {
  return findNode(node, id) !== null;
}

/**
 * Swap two subtrees in place. Sizes are untouched — no split changes cardinality.
 * No-op if either id is missing, they're equal, or one contains the other.
 */
export function swapNodes(root: LayoutNode, aId: string, bId: string): LayoutNode {
  if (aId === bId) return root;
  const a = findNode(root, aId);
  const b = findNode(root, bId);
  if (!a || !b || containsId(a, bId) || containsId(b, aId)) return root;

  function substitute(node: LayoutNode): LayoutNode {
    if (node.id === aId) return b as LayoutNode;
    if (node.id === bId) return a as LayoutNode;
    if (node.type === 'leaf') return node;
    return { ...node, children: node.children.map(substitute) };
  }
  return substitute(root);
}

/**
 * Move the subtree `sourceId` next to `targetId`. Edge drops detach the source
 * and re-insert it as a split sibling of the target; a center drop swaps the two.
 * The source subtree is reused as-is (never cloned), so singleton services stay
 * singleton. No-op on invalid moves (missing ids, self-drop, target inside source).
 */
export function moveNode(
  root: LayoutNode,
  sourceId: string,
  targetId: string,
  edge: DropEdge,
): LayoutNode {
  if (sourceId === targetId) return root;
  const source = findNode(root, sourceId);
  if (!source || !findNode(root, targetId) || containsId(source, targetId)) return root;

  if (edge === 'center') return swapNodes(root, sourceId, targetId);

  const detached = removeNode(root, sourceId);
  if (!detached) return root;

  const { direction, position } = edgeToPlacement(edge);
  return insertNodeAt(detached, targetId, source, direction, position);
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
