import {
  createCopcCameraStreamFinalNodeKeys,
  filterAncestorCoveredCopcNodeKeys,
  orderCopcCameraStreamNodeKeysForProgressiveCoverage,
  selectDistributedCopcCameraStreamNodeKeys,
} from "./CopcCameraStreamNodePlan";
import {
  createCopcCameraStreamPrefetchSettings,
  type CopcCameraStreamLodSettings,
  type CopcCameraStreamPrefetchLodSettingsLike,
} from "./CopcCameraStreamSettings";

export interface CopcCameraStreamPrefetchSelectionPlanOptions {
  readonly lodSettings: Pick<
    CopcCameraStreamLodSettings,
    | "maxDepth"
    | "maxNodes"
    | "targetNodeScreenPixels"
    | "targetPointSpacingScreenPixels"
  >;
  readonly maxDepthOffset?: number;
  readonly maxNodeCount: number;
  readonly maxNodePointCount: number;
  readonly maxNodePointDataLength: number;
  readonly maxTotalPointCount: number;
  readonly maxTotalPointDataLength: number;
  readonly minTargetNodeScreenPixels?: number;
  readonly minTargetPointSpacingScreenPixels?: number;
  readonly targetNodeScreenPixelRatio?: number;
  readonly targetPointSpacingScreenPixelRatio?: number;
}

export interface CopcCameraStreamPrefetchSelectionPlan {
  readonly coverageMode: "progressive";
  readonly maxDepth: number;
  readonly maxNodePointCount: number;
  readonly maxNodePointDataLength: number;
  readonly maxNodes: number;
  readonly maxTotalPointCount: number;
  readonly maxTotalPointDataLength: number;
  readonly selectionMode: "coverage";
  readonly targetNodeScreenPixels: number;
  readonly targetPointSpacingScreenPixels: number;
}

export function createCopcCameraStreamPrefetchSelectionPlan(
  options: CopcCameraStreamPrefetchSelectionPlanOptions,
): CopcCameraStreamPrefetchSelectionPlan {
  const maxDepthOffset = normalizeNonNegativeInteger(
    options.maxDepthOffset ?? 1,
  );
  const targetNodeScreenPixelRatio = normalizePositiveNumber(
    options.targetNodeScreenPixelRatio ?? 0.6,
  );
  const targetPointSpacingScreenPixelRatio = normalizePositiveNumber(
    options.targetPointSpacingScreenPixelRatio ?? 0.6,
  );
  const minTargetNodeScreenPixels = normalizePositiveNumber(
    options.minTargetNodeScreenPixels ?? 24,
  );
  const minTargetPointSpacingScreenPixels = normalizePositiveNumber(
    options.minTargetPointSpacingScreenPixels ?? 1,
  );

  return {
    selectionMode: "coverage",
    coverageMode: "progressive",
    maxNodes: Math.max(
      normalizePositiveInteger(options.lodSettings.maxNodes),
      normalizePositiveInteger(options.maxNodeCount),
    ),
    maxDepth:
      normalizeNonNegativeInteger(options.lodSettings.maxDepth) +
      maxDepthOffset,
    maxNodePointCount: normalizePositiveInteger(options.maxNodePointCount),
    maxNodePointDataLength: normalizePositiveInteger(
      options.maxNodePointDataLength,
    ),
    maxTotalPointCount: normalizePositiveInteger(options.maxTotalPointCount),
    maxTotalPointDataLength: normalizePositiveInteger(
      options.maxTotalPointDataLength,
    ),
    targetNodeScreenPixels: Math.max(
      minTargetNodeScreenPixels,
      normalizePositiveNumber(options.lodSettings.targetNodeScreenPixels) *
        targetNodeScreenPixelRatio,
    ),
    targetPointSpacingScreenPixels: Math.max(
      minTargetPointSpacingScreenPixels,
      normalizePositiveNumber(
        options.lodSettings.targetPointSpacingScreenPixels,
      ) * targetPointSpacingScreenPixelRatio,
    ),
  };
}

export interface CopcCameraStreamPrefetchNodeKeyOptions {
  readonly coverageNodeKeys: readonly string[];
  readonly hasUsableNodeSample: (nodeKey: string) => boolean;
  readonly maxNodeCount: number;
  readonly nodeWeights?: readonly CopcCameraStreamPrefetchNodeWeight[];
  readonly priorityNodeKeys?: readonly string[];
  readonly selectedNodeKeys: readonly string[];
}

export interface CopcCameraStreamPrefetchNodeWeight {
  readonly nodeKey: string;
  readonly weight: number;
}

export function createCopcCameraStreamPrefetchNodeKeys(
  options: CopcCameraStreamPrefetchNodeKeyOptions,
): readonly string[] {
  if (!Number.isSafeInteger(options.maxNodeCount) || options.maxNodeCount <= 0) {
    return [];
  }

  const weightByNodeKey = createPrefetchNodeWeightMap(options.nodeWeights);
  const priorityNodeKeys = orderPrefetchNodeKeysForProgressiveCoverage(
    uniqueNodeKeys(options.priorityNodeKeys ?? []).filter(
      (nodeKey) => !options.hasUsableNodeSample(nodeKey),
    ),
    weightByNodeKey,
  );
  const candidateNodeKeys = createCopcCameraStreamFinalNodeKeys(
    options.selectedNodeKeys,
    options.coverageNodeKeys,
  ).filter(
    (nodeKey) =>
      !priorityNodeKeys.includes(nodeKey) &&
      !options.hasUsableNodeSample(nodeKey),
  );

  if (priorityNodeKeys.length === 0 && candidateNodeKeys.length === 0) {
    return [];
  }

  const deepestCandidateNodeKeys =
    filterAncestorCoveredCopcNodeKeys(candidateNodeKeys);
  const orderedNodeKeys =
    orderPrefetchNodeKeysForProgressiveCoverage(
      deepestCandidateNodeKeys.length > 0
        ? deepestCandidateNodeKeys
        : candidateNodeKeys,
      weightByNodeKey,
    );
  const selectedPriorityNodeKeys = selectPrefetchNodeKeys(
    priorityNodeKeys,
    options.maxNodeCount,
    weightByNodeKey,
  );
  const selectedPriorityNodeKeySet = new Set(selectedPriorityNodeKeys);
  const remainingNodeCount = options.maxNodeCount - selectedPriorityNodeKeys.length;

  if (remainingNodeCount <= 0) {
    return selectedPriorityNodeKeys;
  }

  return [
    ...selectedPriorityNodeKeys,
    ...selectPrefetchNodeKeys(
      orderedNodeKeys.filter((nodeKey) => !selectedPriorityNodeKeySet.has(nodeKey)),
      remainingNodeCount,
      weightByNodeKey,
    ),
  ];
}

export interface CopcCameraStreamPrefetchPlanOptions {
  readonly baseMaxRenderedPointCount: number;
  readonly basePointCountPerNode: number;
  readonly coverageNodeKeys: readonly string[];
  readonly hasUsableNodeSample: (
    nodeKey: string,
    maxPointCountPerNode: number,
  ) => boolean;
  readonly lodSettings: CopcCameraStreamPrefetchLodSettingsLike;
  readonly maxNodeCount: number;
  readonly minPointCountPerNode?: number;
  readonly nodeWeights?: readonly CopcCameraStreamPrefetchNodeWeight[];
  readonly priorityNodeKeys?: readonly string[];
  readonly selectedNodeKeys: readonly string[];
}

export interface CopcCameraStreamPrefetchPlan {
  readonly maxPointCountPerNode: number;
  readonly maxRenderedPointCount: number;
  readonly prefetchNodeKeys: readonly string[];
  readonly progressBatchNodeCount: number;
  readonly shouldPrefetch: boolean;
}

export function createCopcCameraStreamPrefetchPlan(
  options: CopcCameraStreamPrefetchPlanOptions,
): CopcCameraStreamPrefetchPlan {
  const candidateSettings = createCopcCameraStreamPrefetchSettings({
    nodeCount: options.maxNodeCount,
    basePointCountPerNode: options.basePointCountPerNode,
    baseMaxRenderedPointCount: options.baseMaxRenderedPointCount,
    lodSettings: options.lodSettings,
    minPointCountPerNode: options.minPointCountPerNode,
  });
  const prefetchNodeKeys = createCopcCameraStreamPrefetchNodeKeys({
    selectedNodeKeys: options.selectedNodeKeys,
    coverageNodeKeys: options.coverageNodeKeys,
    maxNodeCount: options.maxNodeCount,
    nodeWeights: options.nodeWeights,
    priorityNodeKeys: options.priorityNodeKeys,
    hasUsableNodeSample: (nodeKey) =>
      options.hasUsableNodeSample(
        nodeKey,
        candidateSettings.maxPointCountPerNode,
      ),
  });

  if (prefetchNodeKeys.length === 0) {
    return {
      shouldPrefetch: false,
      prefetchNodeKeys,
      maxPointCountPerNode: 0,
      maxRenderedPointCount: 0,
      progressBatchNodeCount: 0,
    };
  }

  const prefetchSettings = createCopcCameraStreamPrefetchSettings({
    nodeCount: prefetchNodeKeys.length,
    basePointCountPerNode: options.basePointCountPerNode,
    baseMaxRenderedPointCount: options.baseMaxRenderedPointCount,
    lodSettings: options.lodSettings,
    minPointCountPerNode: options.minPointCountPerNode,
    minRenderedPointCount: options.minPointCountPerNode
      ? prefetchNodeKeys.length * options.minPointCountPerNode
      : undefined,
  });

  return {
    shouldPrefetch: true,
    prefetchNodeKeys,
    maxPointCountPerNode: prefetchSettings.maxPointCountPerNode,
    maxRenderedPointCount: prefetchSettings.maxRenderedPointCount,
    progressBatchNodeCount: 1,
  };
}

function normalizePositiveInteger(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function normalizeNonNegativeInteger(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function normalizePositiveNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function uniqueNodeKeys(nodeKeys: readonly string[]): readonly string[] {
  return [...new Set(nodeKeys)];
}

function createPrefetchNodeWeightMap(
  nodeWeights: readonly CopcCameraStreamPrefetchNodeWeight[] | undefined,
): ReadonlyMap<string, number> {
  return new Map(
    (nodeWeights ?? []).flatMap((nodeWeight) =>
      Number.isFinite(nodeWeight.weight) && nodeWeight.weight > 0
        ? [[nodeWeight.nodeKey, nodeWeight.weight] as const]
        : [],
    ),
  );
}

function orderPrefetchNodeKeysForProgressiveCoverage(
  nodeKeys: readonly string[],
  weightByNodeKey: ReadonlyMap<string, number>,
): readonly string[] {
  if (weightByNodeKey.size === 0) {
    return orderCopcCameraStreamNodeKeysForProgressiveCoverage(nodeKeys);
  }

  return orderCopcCameraStreamNodeKeysForProgressiveCoverage(
    [...nodeKeys].sort(
      (left, right) =>
        (weightByNodeKey.get(right) ?? 1) -
          (weightByNodeKey.get(left) ?? 1) ||
        left.localeCompare(right),
    ),
  );
}

function selectPrefetchNodeKeys(
  nodeKeys: readonly string[],
  maxNodeCount: number,
  weightByNodeKey: ReadonlyMap<string, number>,
): readonly string[] {
  if (weightByNodeKey.size > 0) {
    return nodeKeys.slice(0, Math.max(0, maxNodeCount));
  }

  return selectDistributedCopcCameraStreamNodeKeys(nodeKeys, maxNodeCount);
}
