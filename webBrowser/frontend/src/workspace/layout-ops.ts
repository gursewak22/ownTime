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
  const newLeaf = makeLeaf(serviceId);
  const pair = (target: LayoutNode): LayoutNode[] =>
    position === 'before' ? [newLeaf, target] : [target, newLeaf];

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
      next.splice(position === 'before' ? childIndex : childIndex + 1, 0, newLeaf);
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
    children: root.children.map((c) => splitAt(c, targetId, serviceId, direction, position)),
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

/** Where a dragged panel is dropped relative to the target leaf. */
export type DropEdge = 'left' | 'right' | 'top' | 'bottom' | 'center';

/** Map a drop edge to the split direction + insert position used for re-parenting. */
function edgeToPlacement(
  edge: Exclude<DropEdge, 'center'>,
): { direction: 'horizontal' | 'vertical'; position: SplitPosition } {
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

/** Find a node by id anywhere in the tree (returns the reference, not a copy). */
function findNode(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return root;
  if (root.type === 'leaf') return null;
  for (const c of root.children) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

/** True if `node` is `targetId` or contains it. Used to reject moving a node into its own subtree. */
function containsId(node: LayoutNode, targetId: string): boolean {
  if (node.id === targetId) return true;
  if (node.type === 'leaf') return false;
  return node.children.some((c) => containsId(c, targetId));
}

/**
 * Swap the positions of two existing nodes (by id) in place. Sizes are preserved
 * because no split changes cardinality. No-op if ids are equal/missing or one node
 * contains the other.
 */
export function swapNodes(root: LayoutNode, aId: string, bId: string): LayoutNode {
  if (aId === bId) return root;
  const a = findNode(root, aId);
  const b = findNode(root, bId);
  if (!a || !b) return root;
  if (containsId(a, bId) || containsId(b, aId)) return root;

  function rebuild(node: LayoutNode): LayoutNode {
    if (node.id === aId) return b as LayoutNode;
    if (node.id === bId) return a as LayoutNode;
    if (node.type === 'leaf') return node;
    return { ...node, children: node.children.map(rebuild) };
  }
  return rebuild(root);
}

/**
 * Move an existing node (`sourceId`) so it becomes a sibling of `targetId` on the
 * given edge. `center` swaps the two nodes instead of re-parenting. The moved node
 * is reused (never cloned), so singletons stay singleton. Returns the root unchanged
 * for no-op or invalid moves (same node, missing id, or target inside the source).
 */
export function moveNode(
  root: LayoutNode,
  sourceId: string,
  targetId: string,
  edge: DropEdge,
): LayoutNode {
  if (sourceId === targetId) return root;

  const source = findNode(root, sourceId);
  const target = findNode(root, targetId);
  if (!source || !target) return root;
  if (containsId(source, targetId)) return root; // can't move into own subtree

  if (edge === 'center') return swapNodes(root, sourceId, targetId);

  const { direction, position } = edgeToPlacement(edge);

  // Detach the source first. removeNode collapses single-child splits up the tree
  // and may return a new root. It can't be null here because the target also exists.
  const detached = removeNode(root, sourceId);
  if (!detached) return root;

  const moving = source; // reuse exact subtree (preserves id + nested structure)
  const pair = (t: LayoutNode): LayoutNode[] =>
    position === 'before' ? [moving, t] : [t, moving];

  function insert(node: LayoutNode): LayoutNode {
    if (node.id === targetId) {
      return { type: 'split', id: uuid(), direction, children: pair(node), sizes: [50, 50] };
    }
    if (node.type === 'leaf') return node;

    const idx = node.children.findIndex((c) => c.id === targetId);
    if (idx !== -1) {
      if (node.direction === direction) {
        const next = [...node.children];
        next.splice(position === 'before' ? idx : idx + 1, 0, moving);
        return { ...node, children: next, sizes: equalSizes(next.length) };
      }
      const wrapped: SplitNode = {
        type: 'split',
        id: uuid(),
        direction,
        children: pair(node.children[idx]),
        sizes: [50, 50],
      };
      const next = [...node.children];
      next[idx] = wrapped;
      return { ...node, children: next };
    }
    return { ...node, children: node.children.map(insert) };
  }

  return insert(detached);
}
