import { selectDistributedCopcCameraStreamNodeKeys } from "./CopcCameraStreamNodePlan";

export type CopcCameraStreamRendererKind = "typed" | "primitive" | "buffer";

export interface CopcCameraStreamProgressNodeSampleLike {
  readonly nodeKey: string;
  readonly nodePointCount?: number;
  readonly sampledPointCount?: number;
}

export interface CopcCameraStreamFinalNodeWeight {
  readonly nodeKey: string;
  readonly weight: number;
}

export interface CopcCameraStreamDetailProgressPolicyOptions {
  readonly finalNodeKeys: readonly string[];
  readonly initialNodeResults: readonly CopcCameraStreamProgressNodeSampleLike[];
  readonly rendererKind: CopcCameraStreamRendererKind;
  readonly fastRendererProgressBatchNodeCount: number;
  readonly pointPrimitiveProgressBatchNodeCount: number;
  readonly minInitialPointCount?: number;
  readonly fastInitialCoverageRatio?: number;
  readonly balancedBatchDivisor?: number;
  readonly minBalancedBatchNodeCount?: number;
  readonly maxBalancedBatchNodeCount?: number;
}

export interface CopcCameraStreamDetailProgressPolicy {
  readonly progressBatchNodeCount: number;
  readonly progressRenderMode: "incremental";
  readonly sameNodeInitialCoverageRatio: number;
}

export interface CopcCameraStreamDetailCompletionOptions {
  readonly finalNodeCount: number;
  readonly renderedFinalNodeCount: number;
  readonly renderedPointBudget: number;
  readonly renderedPointCount: number;
  readonly minBudgetFillRatio?: number;
  readonly minBudgetCompletionNodeCoverageRatio?: number;
  readonly minNodeCoverageRatio?: number;
  readonly minWeightedCompletionNodeCoverageRatio?: number;
  readonly minWeightedNodeCoverageRatio?: number;
  readonly requireFullNodeCoverage?: boolean;
  readonly weightedFinalNodeCoverageRatio?: number;
}

export interface CopcCameraStreamDetailProgressStateOptions
  extends Omit<
    CopcCameraStreamDetailCompletionOptions,
    "finalNodeCount" | "renderedFinalNodeCount"
  > {
  readonly finalNodeKeys: readonly string[];
  readonly finalNodeWeights?: readonly CopcCameraStreamFinalNodeWeight[];
  readonly renderedNodeKeys: readonly string[];
}

export interface CopcCameraStreamDetailProgressState {
  readonly finalNodeCount: number;
  readonly renderedFinalNodeCount: number;
  readonly renderedFinalNodeCoverageRatio: number;
  readonly renderedFinalNodeWeightCoverageRatio: number;
  readonly reachedRenderBudget: boolean;
  readonly isComplete: boolean;
}

export interface CopcCameraStreamDetailWarmupPolicyOptions {
  readonly finalNodeKeys: readonly string[];
  readonly initialNodeResults: readonly CopcCameraStreamProgressNodeSampleLike[];
  readonly detailMaxPointCountPerNode: number;
  readonly warmupPointCountPerNode: number;
  readonly decodeGranularity?: CopcCameraStreamDecodeGranularity;
  readonly minMissingNodeCount?: number;
  readonly minSameNodeInitialCoverageRatio?: number;
  readonly maxSameNodeInitialCoverageRatio?: number;
  readonly maxWarmupNodeCount?: number;
  readonly balancedBatchDivisor?: number;
  readonly minBalancedBatchNodeCount?: number;
  readonly maxBalancedBatchNodeCount?: number;
}

export interface CopcCameraStreamDetailWarmupPolicy {
  readonly shouldWarmup: boolean;
  readonly warmupNodeKeys: readonly string[];
  readonly maxPointCountPerNode: number;
  readonly maxRenderedPointCount: number;
  readonly progressBatchNodeCount: number;
  readonly progressRenderMode: "incremental";
  readonly sameNodeInitialCoverageRatio: number;
}

export interface CopcCameraStreamRequestPriorityOffsets {
  readonly preview: number;
  readonly detailWarmup: number;
  readonly detail: number;
}

export interface CopcCameraStreamRequestPriorityOptions {
  readonly offset: number;
  readonly requestId: number;
  readonly step?: number;
}

export type CopcCameraStreamDecodeGranularity = "sample" | "node";

const DEFAULT_FAST_INITIAL_COVERAGE_RATIO = 0.6;
const DEFAULT_WARMUP_MAX_INITIAL_COVERAGE_RATIO = 0.6;
const DEFAULT_WARMUP_MIN_MISSING_NODE_COUNT = 4;
const DEFAULT_WARMUP_MAX_NODE_COUNT = 64;
const DEFAULT_BALANCED_BATCH_DIVISOR = 16;
const DEFAULT_DETAIL_MIN_BALANCED_BATCH_NODE_COUNT = 2;
const DEFAULT_MIN_BALANCED_BATCH_NODE_COUNT = 4;
const DEFAULT_MAX_BALANCED_BATCH_NODE_COUNT = 8;
const DEFAULT_DETAIL_COMPLETION_BUDGET_FILL_RATIO = 0.85;
const DEFAULT_DETAIL_COMPLETION_NODE_COVERAGE_RATIO = 0.9;

export function selectCopcCameraStreamRequestPriorityOffsets(): CopcCameraStreamRequestPriorityOffsets {
  return {
    preview: 4,
    detailWarmup: 2,
    detail: 3,
  };
}

export function createCopcCameraStreamRequestPriority(
  options: CopcCameraStreamRequestPriorityOptions,
): number {
  const step =
    options.step !== undefined &&
    Number.isFinite(options.step) &&
    options.step > 0
      ? options.step
      : 10;

  return options.requestId * step + options.offset;
}

export function selectCopcCameraStreamDetailProgressPolicy(
  options: CopcCameraStreamDetailProgressPolicyOptions,
): CopcCameraStreamDetailProgressPolicy {
  const finalNodeCount = options.finalNodeKeys.length;
  const sameNodeInitialCoverageRatio = estimateSameNodeInitialCoverageRatio(
    options.finalNodeKeys,
    options.initialNodeResults,
    options.minInitialPointCount,
  );

  if (finalNodeCount <= 1) {
    return {
      progressBatchNodeCount: 1,
      progressRenderMode: "incremental",
      sameNodeInitialCoverageRatio,
    };
  }

  if (options.rendererKind === "primitive") {
    return {
      progressBatchNodeCount: options.pointPrimitiveProgressBatchNodeCount,
      progressRenderMode: "incremental",
      sameNodeInitialCoverageRatio,
    };
  }

  const fastInitialCoverageRatio =
    options.fastInitialCoverageRatio ?? DEFAULT_FAST_INITIAL_COVERAGE_RATIO;

  if (sameNodeInitialCoverageRatio >= fastInitialCoverageRatio) {
    return {
      progressBatchNodeCount: options.fastRendererProgressBatchNodeCount,
      progressRenderMode: "incremental",
      sameNodeInitialCoverageRatio,
    };
  }

  return {
    progressBatchNodeCount: selectBalancedBatchNodeCount({
      ...options,
      minBalancedBatchNodeCount:
        options.minBalancedBatchNodeCount ??
        DEFAULT_DETAIL_MIN_BALANCED_BATCH_NODE_COUNT,
    }),
    progressRenderMode: "incremental",
    sameNodeInitialCoverageRatio,
  };
}

export function shouldCompleteCopcCameraStreamDetailProgress(
  options: CopcCameraStreamDetailCompletionOptions,
): boolean {
  const finalNodeCount = Math.max(0, options.finalNodeCount);
  const renderedFinalNodeCount = Math.max(0, options.renderedFinalNodeCount);
  const renderedPointBudget = Math.max(0, options.renderedPointBudget);
  const renderedPointCount = Math.max(0, options.renderedPointCount);

  if (finalNodeCount === 0) {
    return renderedPointCount > 0;
  }

  if (renderedFinalNodeCount >= finalNodeCount) {
    return true;
  }

  if (options.requireFullNodeCoverage) {
    return false;
  }

  const minBudgetFillRatio =
    options.minBudgetFillRatio ??
    DEFAULT_DETAIL_COMPLETION_BUDGET_FILL_RATIO;
  const minNodeCoverageRatio =
    options.minNodeCoverageRatio ??
    DEFAULT_DETAIL_COMPLETION_NODE_COVERAGE_RATIO;
  const minBudgetCompletionNodeCoverageRatio =
    options.minBudgetCompletionNodeCoverageRatio ?? 0;
  const budgetFillRatio =
    renderedPointBudget > 0 ? renderedPointCount / renderedPointBudget : 0;
  const nodeCoverageRatio = renderedFinalNodeCount / finalNodeCount;
  const weightedNodeCoverageRatio =
    options.weightedFinalNodeCoverageRatio !== undefined &&
    Number.isFinite(options.weightedFinalNodeCoverageRatio)
      ? Math.max(0, Math.min(1, options.weightedFinalNodeCoverageRatio))
      : undefined;
  const minWeightedNodeCoverageRatio = normalizeOptionalRatio(
    options.minWeightedNodeCoverageRatio,
  );
  const minWeightedCompletionNodeCoverageRatio = normalizeOptionalRatio(
    options.minWeightedCompletionNodeCoverageRatio,
  );
  const hasBudgetCompletionCoverage =
    nodeCoverageRatio >= minBudgetCompletionNodeCoverageRatio;
  const hasWeightedCompletionCoverage =
    weightedNodeCoverageRatio !== undefined &&
    minWeightedNodeCoverageRatio !== undefined &&
    weightedNodeCoverageRatio >= minWeightedNodeCoverageRatio &&
    nodeCoverageRatio >= (minWeightedCompletionNodeCoverageRatio ?? 0);
  const requiresWeightedNodeCoverage =
    weightedNodeCoverageRatio !== undefined &&
    minWeightedNodeCoverageRatio !== undefined;
  const hasRequiredWeightedNodeCoverage =
    !requiresWeightedNodeCoverage ||
    weightedNodeCoverageRatio >= minWeightedNodeCoverageRatio;

  return (
    hasWeightedCompletionCoverage ||
    (budgetFillRatio >= minBudgetFillRatio &&
      hasBudgetCompletionCoverage &&
      hasRequiredWeightedNodeCoverage) ||
    (nodeCoverageRatio >= minNodeCoverageRatio &&
      hasRequiredWeightedNodeCoverage)
  );
}

export function createCopcCameraStreamDetailProgressState(
  options: CopcCameraStreamDetailProgressStateOptions,
): CopcCameraStreamDetailProgressState {
  const finalNodeKeys = new Set(options.finalNodeKeys);
  const renderedNodeKeys = new Set(options.renderedNodeKeys);
  const finalNodeCount = finalNodeKeys.size;
  const renderedFinalNodeCount = [...renderedNodeKeys].filter((nodeKey) =>
    finalNodeKeys.has(nodeKey),
  ).length;
  const renderedFinalNodeCoverageRatio =
    finalNodeCount > 0 ? renderedFinalNodeCount / finalNodeCount : 0;
  const renderedFinalNodeWeightCoverageRatio =
    createRenderedFinalNodeWeightCoverageRatio({
      finalNodeKeys,
      finalNodeWeights: options.finalNodeWeights,
      renderedNodeKeys,
      fallbackCoverageRatio: renderedFinalNodeCoverageRatio,
    });
  const renderedPointBudget = Math.max(0, options.renderedPointBudget);
  const renderedPointCount = Math.max(0, options.renderedPointCount);
  const reachedRenderBudget =
    renderedPointBudget > 0 && renderedPointCount >= renderedPointBudget;
  const isComplete = shouldCompleteCopcCameraStreamDetailProgress({
    ...options,
    finalNodeCount,
    renderedFinalNodeCount,
    renderedPointBudget,
    renderedPointCount,
    weightedFinalNodeCoverageRatio: renderedFinalNodeWeightCoverageRatio,
  });

  return {
    finalNodeCount,
    renderedFinalNodeCount,
    renderedFinalNodeCoverageRatio,
    renderedFinalNodeWeightCoverageRatio,
    reachedRenderBudget,
    isComplete,
  };
}

function createRenderedFinalNodeWeightCoverageRatio(options: {
  readonly fallbackCoverageRatio: number;
  readonly finalNodeKeys: Set<string>;
  readonly finalNodeWeights: readonly CopcCameraStreamFinalNodeWeight[] | undefined;
  readonly renderedNodeKeys: Set<string>;
}): number {
  if (!options.finalNodeWeights || options.finalNodeWeights.length === 0) {
    return options.fallbackCoverageRatio;
  }

  const weightByNodeKey = new Map(
    options.finalNodeWeights.map((node) => [
      node.nodeKey,
      normalizeWeight(node.weight),
    ]),
  );
  let totalWeight = 0;
  let renderedWeight = 0;

  options.finalNodeKeys.forEach((nodeKey) => {
    const weight = weightByNodeKey.get(nodeKey) ?? 1;

    totalWeight += weight;

    if (options.renderedNodeKeys.has(nodeKey)) {
      renderedWeight += weight;
    }
  });

  return totalWeight > 0
    ? Math.max(0, Math.min(1, renderedWeight / totalWeight))
    : options.fallbackCoverageRatio;
}

function normalizeWeight(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeOptionalRatio(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? Math.min(1, value)
    : undefined;
}

export function selectCopcCameraStreamDetailWarmupPolicy(
  options: CopcCameraStreamDetailWarmupPolicyOptions,
): CopcCameraStreamDetailWarmupPolicy {
  const sameNodeInitialCoverageRatio = estimateSameNodeInitialCoverageRatio(
    options.finalNodeKeys,
    options.initialNodeResults,
    options.warmupPointCountPerNode,
  );
  const maxSameNodeInitialCoverageRatio =
    options.maxSameNodeInitialCoverageRatio ??
    DEFAULT_WARMUP_MAX_INITIAL_COVERAGE_RATIO;
  const minSameNodeInitialCoverageRatio =
    options.minSameNodeInitialCoverageRatio ?? 0;
  const minMissingNodeCount =
    options.minMissingNodeCount ?? DEFAULT_WARMUP_MIN_MISSING_NODE_COUNT;
  const maxWarmupNodeCount =
    options.maxWarmupNodeCount ?? DEFAULT_WARMUP_MAX_NODE_COUNT;
  const missingNodeCount = countMissingInitialNodeResults(
    options.finalNodeKeys,
    options.initialNodeResults,
    options.warmupPointCountPerNode,
  );
  const maxPointCountPerNode = selectDetailWarmupPointCountPerNode({
    decodeGranularity: options.decodeGranularity,
    detailMaxPointCountPerNode: options.detailMaxPointCountPerNode,
    warmupPointCountPerNode: options.warmupPointCountPerNode,
  });
  const shouldWarmup =
    options.finalNodeKeys.length > 0 &&
    options.detailMaxPointCountPerNode > options.warmupPointCountPerNode &&
    missingNodeCount >= minMissingNodeCount &&
    sameNodeInitialCoverageRatio >= minSameNodeInitialCoverageRatio &&
    sameNodeInitialCoverageRatio < maxSameNodeInitialCoverageRatio;
  const warmupNodeKeys = shouldWarmup
    ? selectDistributedCopcCameraStreamNodeKeys(
        options.finalNodeKeys,
        maxWarmupNodeCount,
      )
    : [];

  return {
    shouldWarmup,
    warmupNodeKeys,
    maxPointCountPerNode,
    maxRenderedPointCount: Math.max(
      warmupNodeKeys.length,
      warmupNodeKeys.length * maxPointCountPerNode,
    ),
    progressBatchNodeCount: selectBalancedBatchNodeCount({
      ...options,
      finalNodeKeys: warmupNodeKeys,
    }),
    progressRenderMode: "incremental",
    sameNodeInitialCoverageRatio,
  };
}

function selectDetailWarmupPointCountPerNode(options: {
  readonly decodeGranularity: CopcCameraStreamDecodeGranularity | undefined;
  readonly detailMaxPointCountPerNode: number;
  readonly warmupPointCountPerNode: number;
}): number {
  if (options.decodeGranularity === "node") {
    return options.detailMaxPointCountPerNode;
  }

  return Math.min(
    options.detailMaxPointCountPerNode,
    options.warmupPointCountPerNode,
  );
}

function estimateSameNodeInitialCoverageRatio(
  finalNodeKeys: readonly string[],
  initialNodeResults: readonly CopcCameraStreamProgressNodeSampleLike[],
  minInitialPointCount: number | undefined = undefined,
): number {
  if (finalNodeKeys.length === 0) {
    return 1;
  }

  const initialNodeKeys = new Set(
    initialNodeResults
      .filter((nodeResult) =>
        isUsefulInitialNodeResult(nodeResult, minInitialPointCount),
      )
      .map((nodeResult) => nodeResult.nodeKey),
  );
  const coveredNodeCount = finalNodeKeys.filter((nodeKey) =>
    initialNodeKeys.has(nodeKey),
  ).length;

  return coveredNodeCount / finalNodeKeys.length;
}

function countMissingInitialNodeResults(
  finalNodeKeys: readonly string[],
  initialNodeResults: readonly CopcCameraStreamProgressNodeSampleLike[],
  minInitialPointCount: number,
): number {
  const initialNodeKeys = new Set(
    initialNodeResults
      .filter((nodeResult) =>
        isUsefulInitialNodeResult(nodeResult, minInitialPointCount),
      )
      .map((nodeResult) => nodeResult.nodeKey),
  );

  return finalNodeKeys.filter((nodeKey) => !initialNodeKeys.has(nodeKey))
    .length;
}

function isUsefulInitialNodeResult(
  nodeResult: CopcCameraStreamProgressNodeSampleLike,
  minInitialPointCount: number | undefined,
): boolean {
  if (minInitialPointCount === undefined) {
    return true;
  }

  if (nodeResult.sampledPointCount === undefined) {
    return false;
  }

  const requiredPointCount = Math.min(
    nodeResult.nodePointCount ?? minInitialPointCount,
    minInitialPointCount,
  );

  return nodeResult.sampledPointCount >= requiredPointCount;
}

function selectBalancedBatchNodeCount(options: {
  readonly finalNodeKeys: readonly string[];
  readonly balancedBatchDivisor?: number;
  readonly minBalancedBatchNodeCount?: number;
  readonly maxBalancedBatchNodeCount?: number;
}): number {
  const finalNodeCount = options.finalNodeKeys.length;
  const balancedBatchDivisor =
    options.balancedBatchDivisor ?? DEFAULT_BALANCED_BATCH_DIVISOR;
  const minBalancedBatchNodeCount =
    options.minBalancedBatchNodeCount ??
    DEFAULT_MIN_BALANCED_BATCH_NODE_COUNT;
  const maxBalancedBatchNodeCount =
    options.maxBalancedBatchNodeCount ??
    DEFAULT_MAX_BALANCED_BATCH_NODE_COUNT;
  const targetBatchNodeCount = Math.ceil(
    finalNodeCount / balancedBatchDivisor,
  );

  return Math.min(
    finalNodeCount,
    Math.max(
      minBalancedBatchNodeCount,
      Math.min(maxBalancedBatchNodeCount, targetBatchNodeCount),
    ),
  );
}
