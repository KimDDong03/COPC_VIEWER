export const DEFAULT_MAX_CONCURRENT_POINT_SAMPLE_WORKER_REQUESTS = 3;
export const DEFAULT_MAX_CONCURRENT_COPC_POINT_GEOMETRY_WORKER_REQUESTS = 2;

export interface CopcDecodedPointDataCacheNodeKey {
  readonly sourceKey: string;
  readonly nodeKey: string;
}

export interface CopcDecodedPointDataCacheSnapshot {
  readonly retainedViewCount: number;
  readonly retainedBytes: number;
  readonly peakRetainedBytes: number;
  readonly cacheHitCount: number;
  readonly cacheMissCount: number;
  readonly cacheEvictionCount: number;
  readonly oversizedEntrySkipCount: number;
  readonly requestedNodeRetained: boolean;
  readonly evictedNodeKeys: readonly CopcDecodedPointDataCacheNodeKey[];
}

export interface CopcDecodedPointDataCacheStats {
  readonly workerCount: number;
  readonly retainedViewCount: number;
  readonly retainedBytes: number;
  readonly peakRetainedBytes: number;
  readonly cacheHitCount: number;
  readonly cacheMissCount: number;
  readonly cacheEvictionCount: number;
  readonly oversizedEntrySkipCount: number;
  readonly affinityEntryCount: number;
  readonly maxDecodedPointDataViewBytesPerWorker: number | undefined;
  readonly maxDecodedPointDataViewBytesAcrossWorkers: number | undefined;
}

export function calculateEffectiveDecodedPointDataViewBytesPerWorker(
  maxBytesPerWorker: number | undefined,
  maxBytesAcrossWorkers: number | undefined,
  workerSlotCount: number,
): number | undefined {
  if (maxBytesAcrossWorkers === undefined) {
    return maxBytesPerWorker;
  }

  const aggregateShare = Math.floor(maxBytesAcrossWorkers / workerSlotCount);
  return maxBytesPerWorker === undefined
    ? aggregateShare
    : Math.min(maxBytesPerWorker, aggregateShare);
}

export function mergeDecodedPointDataCacheStats(
  stats: readonly CopcDecodedPointDataCacheStats[],
  maxBytesAcrossWorkers?: number,
): CopcDecodedPointDataCacheStats {
  return {
    workerCount: sum(stats, (entry) => entry.workerCount),
    retainedViewCount: sum(stats, (entry) => entry.retainedViewCount),
    retainedBytes: sum(stats, (entry) => entry.retainedBytes),
    peakRetainedBytes: sum(stats, (entry) => entry.peakRetainedBytes),
    cacheHitCount: sum(stats, (entry) => entry.cacheHitCount),
    cacheMissCount: sum(stats, (entry) => entry.cacheMissCount),
    cacheEvictionCount: sum(stats, (entry) => entry.cacheEvictionCount),
    oversizedEntrySkipCount: sum(
      stats,
      (entry) => entry.oversizedEntrySkipCount,
    ),
    affinityEntryCount: sum(stats, (entry) => entry.affinityEntryCount),
    maxDecodedPointDataViewBytesPerWorker: undefined,
    maxDecodedPointDataViewBytesAcrossWorkers:
      maxBytesAcrossWorkers ??
      sumDefined(
        stats,
        (entry) => entry.maxDecodedPointDataViewBytesAcrossWorkers,
      ),
  };
}

function sum<T>(
  values: readonly T[],
  select: (value: T) => number,
): number {
  return values.reduce((total, value) => total + select(value), 0);
}

function sumDefined<T>(
  values: readonly T[],
  select: (value: T) => number | undefined,
): number | undefined {
  let sawDefinedValue = false;
  let total = 0;

  for (const value of values) {
    const selected = select(value);

    if (selected !== undefined) {
      sawDefinedValue = true;
      total += selected;
    }
  }

  return sawDefinedValue ? total : undefined;
}
