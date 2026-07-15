import type {
  CopcHierarchyNodeSummary,
  CopcHierarchySummary,
} from "../core/copc/CopcHierarchySummary";
import type { CopcNodePointSampleResult } from "../core/copc/CopcPointDataSample";
import type { PointGeometryBatch } from "./CopcPointCloudRenderer";
import type {
  CopcNodePointGeometryBatchResult,
  CopcPointGeometryBatchTiming,
} from "./CesiumCopcPointGeometryWorkerProtocol";
import { createNodePointSampleBatchKey } from "./pointGeometryBatch";

interface PointGeometryProgressEntry {
  readonly node: CopcHierarchyNodeSummary;
  readonly geometryResult: CopcNodePointGeometryBatchResult;
}

interface NodeSampleProgressEntry {
  readonly node: CopcHierarchyNodeSummary;
  readonly nodeResult: CopcNodePointSampleResult | undefined;
}

export function createProgressPointGeometryResults(options: {
  readonly backgroundGeometryResults: readonly CopcNodePointGeometryBatchResult[];
  readonly hierarchy: CopcHierarchySummary;
  readonly nodes: readonly CopcHierarchyNodeSummary[];
  readonly geometryResults: readonly (
    CopcNodePointGeometryBatchResult | undefined
  )[];
  readonly initialGeometryResults: readonly (
    CopcNodePointGeometryBatchResult | undefined
  )[];
  readonly includeBackground: boolean;
  readonly maxRenderedPointCount: number | undefined;
  readonly maxPointCountPerNode: number | undefined;
}): {
  readonly nodes: readonly CopcHierarchyNodeSummary[];
  readonly geometryResults: readonly CopcNodePointGeometryBatchResult[];
} {
  const nodeEntries = options.nodes.flatMap((node, index) => {
    const geometryResult =
      options.geometryResults[index] ?? options.initialGeometryResults[index];

    return geometryResult ? [{ node, geometryResult }] : [];
  });
  const backgroundEntries = options.includeBackground
    ? options.backgroundGeometryResults.map((geometryResult) => ({
        node: findRequiredNode(
          options.hierarchy,
          geometryResult.pointSamples.nodeKey,
        ),
        geometryResult,
      }))
    : [];
  const entries = limitPointGeometryProgressEntries(
    [...nodeEntries, ...backgroundEntries],
    options.maxRenderedPointCount,
    options.maxPointCountPerNode,
    nodeEntries.length,
  );

  return {
    nodes: entries.map((entry) => entry.node),
    geometryResults: entries.map((entry) => entry.geometryResult),
  };
}

export function limitPointGeometryProgressEntries(
  entries: readonly PointGeometryProgressEntry[],
  maxRenderedPointCount: number | undefined,
  maxPointCountPerNode: number | undefined,
  priorityEntryCount?: number,
): readonly PointGeometryProgressEntry[] {
  const pointCounts = allocateProgressEntryPointCounts(
    entries.map((entry) =>
      Math.min(
        entry.geometryResult.pointSamples.sampledPointCount,
        entry.geometryResult.geometryBatch.pointCount,
      ),
    ),
    maxRenderedPointCount,
    maxPointCountPerNode,
    priorityEntryCount,
  );

  return entries.flatMap((entry, index) => {
    const pointCount = pointCounts[index] ?? 0;

    return pointCount > 0
      ? [
          {
            node: entry.node,
            geometryResult: limitPointGeometryBatchResult(
              entry.geometryResult,
              pointCount,
              false,
            ),
          },
        ]
      : [];
  });
}

export function limitNodeSampleProgressEntries(
  entries: readonly NodeSampleProgressEntry[],
  maxRenderedPointCount: number | undefined,
  maxPointCountPerNode: number | undefined,
  priorityEntryCount?: number,
): readonly {
  readonly node: CopcHierarchyNodeSummary;
  readonly nodeResult: CopcNodePointSampleResult;
}[] {
  const pointCounts = allocateProgressEntryPointCounts(
    entries.map((entry) => entry.nodeResult?.sampledPointCount ?? 0),
    maxRenderedPointCount,
    maxPointCountPerNode,
    priorityEntryCount,
  );

  return entries.flatMap((entry, index) => {
    const pointCount = pointCounts[index] ?? 0;

    return entry.nodeResult && pointCount > 0
      ? [
          {
            node: entry.node,
            nodeResult: limitNodePointSampleResult(
              entry.nodeResult,
              pointCount,
            ),
          },
        ]
      : [];
  });
}

export function allocateProgressEntryPointCounts(
  entryPointCounts: readonly number[],
  maxRenderedPointCount: number | undefined,
  maxPointCountPerNode: number | undefined,
  priorityEntryCount: number | undefined,
): readonly number[] {
  const limits = entryPointCounts.map((pointCount) =>
    Math.max(
      0,
      Math.min(
        Math.floor(pointCount),
        maxPointCountPerNode ?? Number.POSITIVE_INFINITY,
      ),
    ),
  );

  if (maxRenderedPointCount === undefined) {
    return limits;
  }

  const normalizedPriorityEntryCount =
    priorityEntryCount !== undefined
      ? Math.max(0, Math.min(limits.length, priorityEntryCount))
      : limits.length;
  const allocations = new Array<number>(limits.length).fill(0);
  let remainingPointCount = Math.max(0, Math.floor(maxRenderedPointCount));

  remainingPointCount = allocateFairProgressPointCounts(
    limits,
    allocations,
    0,
    normalizedPriorityEntryCount,
    remainingPointCount,
  );
  allocateFairProgressPointCounts(
    limits,
    allocations,
    normalizedPriorityEntryCount,
    limits.length,
    remainingPointCount,
  );

  return allocations;
}

function allocateFairProgressPointCounts(
  limits: readonly number[],
  allocations: number[],
  startIndex: number,
  endIndex: number,
  pointBudget: number,
): number {
  let remainingPointCount = pointBudget;
  let activeIndexes = limits
    .map((_limit, index) => index)
    .slice(startIndex, endIndex)
    .filter((index) => limits[index] > allocations[index]);

  while (remainingPointCount > 0 && activeIndexes.length > 0) {
    const share = Math.max(
      1,
      Math.floor(remainingPointCount / activeIndexes.length),
    );
    const nextActiveIndexes: number[] = [];

    for (const index of activeIndexes) {
      if (remainingPointCount <= 0) {
        nextActiveIndexes.push(index);
        continue;
      }

      const pointCount = Math.min(
        share,
        remainingPointCount,
        limits[index] - allocations[index],
      );

      allocations[index] += pointCount;
      remainingPointCount -= pointCount;

      if (limits[index] > allocations[index]) {
        nextActiveIndexes.push(index);
      }
    }

    if (nextActiveIndexes.length === activeIndexes.length && share <= 0) {
      break;
    }

    activeIndexes = nextActiveIndexes;
  }

  return remainingPointCount;
}

export function limitPointGeometryBatchResult(
  result: CopcNodePointGeometryBatchResult,
  maxPointCount: number,
  markAsCacheHit: boolean,
): CopcNodePointGeometryBatchResult {
  const pointCount = Math.min(
    result.pointSamples.nodePointCount,
    result.pointSamples.sampledPointCount,
    result.geometryBatch.pointCount,
    maxPointCount,
  );

  if (
    pointCount >= result.pointSamples.sampledPointCount &&
    pointCount >= result.geometryBatch.pointCount
  ) {
    return markAsCacheHit
      ? markPointGeometryBatchResultCacheHit(result)
      : result;
  }

  const pointSamples = limitNodePointSampleResult(
    result.pointSamples,
    pointCount,
  );

  return {
    pointSamples,
    geometryBatch: limitPointGeometryBatch(
      result.geometryBatch,
      pointCount,
      createNodePointSampleBatchKey(pointSamples),
    ),
    timing: markAsCacheHit
      ? createPointGeometryBatchCacheHitTiming()
      : result.timing,
  };
}

export function limitNodePointSampleResult(
  result: CopcNodePointSampleResult,
  pointCount: number,
): CopcNodePointSampleResult {
  if (pointCount >= result.sampledPointCount) {
    return result;
  }

  const availablePointCount = result.pointData?.x.length ?? result.points.length;
  const sampleIndexes = createDistributedSampleIndexes(
    Math.min(result.sampledPointCount, availablePointCount),
    pointCount,
  );

  return {
    nodeKey: result.nodeKey,
    nodePointCount: result.nodePointCount,
    sampledPointCount: pointCount,
    points:
      result.points.length > 0
        ? sampleIndexes.map((pointIndex) => result.points[pointIndex])
        : [],
    pointData: result.pointData
      ? {
          x: selectFloat64Values(result.pointData.x, sampleIndexes),
          y: selectFloat64Values(result.pointData.y, sampleIndexes),
          z: selectFloat64Values(result.pointData.z, sampleIndexes),
          red: selectOptionalUint8Values(result.pointData.red, sampleIndexes),
          green: selectOptionalUint8Values(
            result.pointData.green,
            sampleIndexes,
          ),
          blue: selectOptionalUint8Values(result.pointData.blue, sampleIndexes),
          classification: selectOptionalUint8Values(
            result.pointData.classification,
            sampleIndexes,
          ),
          intensity: selectOptionalUint16Values(
            result.pointData.intensity,
            sampleIndexes,
          ),
        }
      : undefined,
  };
}

function limitPointGeometryBatch(
  batch: PointGeometryBatch,
  pointCount: number,
  key: string,
): PointGeometryBatch {
  if (pointCount >= batch.pointCount) {
    return key === batch.key ? batch : { ...batch, key };
  }

  const sampleIndexes = createDistributedSampleIndexes(
    batch.pointCount,
    pointCount,
  );
  const positions = new Float64Array(pointCount * 3);
  const colors = new Uint8Array(pointCount * 4);

  sampleIndexes.forEach((sourcePointIndex, targetPointIndex) => {
    const sourcePositionOffset = sourcePointIndex * 3;
    const targetPositionOffset = targetPointIndex * 3;
    positions[targetPositionOffset] = batch.positions[sourcePositionOffset];
    positions[targetPositionOffset + 1] =
      batch.positions[sourcePositionOffset + 1];
    positions[targetPositionOffset + 2] =
      batch.positions[sourcePositionOffset + 2];

    const sourceColorOffset = sourcePointIndex * 4;
    const targetColorOffset = targetPointIndex * 4;
    colors[targetColorOffset] = batch.colors[sourceColorOffset];
    colors[targetColorOffset + 1] = batch.colors[sourceColorOffset + 1];
    colors[targetColorOffset + 2] = batch.colors[sourceColorOffset + 2];
    colors[targetColorOffset + 3] = batch.colors[sourceColorOffset + 3];
  });

  return {
    key,
    pointCount,
    positions,
    colors,
  };
}

function createDistributedSampleIndexes(
  sourcePointCount: number,
  sampledPointCount: number,
): number[] {
  if (sourcePointCount <= 0 || sampledPointCount <= 0) {
    return [];
  }

  if (sampledPointCount === 1) {
    return [0];
  }

  const lastSourceIndex = sourcePointCount - 1;

  return Array.from({ length: sampledPointCount }, (_value, sampleIndex) =>
    Math.round((sampleIndex * lastSourceIndex) / (sampledPointCount - 1)),
  );
}

function selectFloat64Values(
  values: Float64Array,
  indexes: readonly number[],
): Float64Array {
  return Float64Array.from(indexes, (index) => values[index]);
}

function selectOptionalUint8Values(
  values: Uint8Array | undefined,
  indexes: readonly number[],
): Uint8Array | undefined {
  return values
    ? Uint8Array.from(indexes, (index) => values[index])
    : undefined;
}

function selectOptionalUint16Values(
  values: Uint16Array | undefined,
  indexes: readonly number[],
): Uint16Array | undefined {
  return values
    ? Uint16Array.from(indexes, (index) => values[index])
    : undefined;
}

export function markPointGeometryBatchResultCacheHit(
  result: CopcNodePointGeometryBatchResult,
): CopcNodePointGeometryBatchResult {
  return {
    ...result,
    timing: createPointGeometryBatchCacheHitTiming(),
  };
}

function createPointGeometryBatchCacheHitTiming(): CopcPointGeometryBatchTiming {
  return {
    pointDataViewMilliseconds: 0,
    pointDataViewCacheHit: true,
    sampleMilliseconds: 0,
    geometryMilliseconds: 0,
    workerTotalMilliseconds: 0,
    requestQueueMilliseconds: 0,
    requestRoundTripMilliseconds: 0,
  };
}

function findRequiredNode(
  hierarchy: CopcHierarchySummary,
  nodeKey: string,
): CopcHierarchyNodeSummary {
  const node = hierarchy.nodes.find((candidate) => candidate.key === nodeKey);

  if (!node) {
    throw new Error(`COPC hierarchy node was not found: ${nodeKey}`);
  }

  return node;
}
