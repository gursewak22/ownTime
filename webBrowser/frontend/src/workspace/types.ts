export type LeafNode = {
  type: 'leaf';
  id: string;
  serviceId: string;
};

export type SplitNode = {
  type: 'split';
  id: string;
  direction: 'horizontal' | 'vertical';
  children: LayoutNode[];
  sizes: number[];
};

export type LayoutNode = LeafNode | SplitNode;
