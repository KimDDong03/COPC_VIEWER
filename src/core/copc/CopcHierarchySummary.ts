export interface CopcHierarchyNodeSummary {
  readonly key: string;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly pointCount: number;
  readonly pointDataOffset: number;
  readonly pointDataLength: number;
}

export interface CopcHierarchySummary {
  readonly nodes: readonly CopcHierarchyNodeSummary[];
  readonly pageCount: number;
}
