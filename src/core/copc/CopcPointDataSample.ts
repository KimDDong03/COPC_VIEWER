export interface CopcPointColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

export interface CopcPointDataSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color?: CopcPointColor;
  readonly classification?: number;
  readonly intensity?: number;
}

export type CopcPointSampleFormat = "objects" | "typed";

export interface CopcPointDataSampleArrays {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  readonly red?: Uint8Array;
  readonly green?: Uint8Array;
  readonly blue?: Uint8Array;
  readonly classification?: Uint8Array;
  readonly intensity?: Uint16Array;
}

export interface CopcNodePointSampleResult {
  readonly nodeKey: string;
  readonly nodePointCount: number;
  readonly sampledPointCount: number;
  readonly points: readonly CopcPointDataSample[];
  readonly pointData?: CopcPointDataSampleArrays;
}

export interface CopcMultiNodePointSampleResult {
  readonly nodeKeys: readonly string[];
  readonly nodeResults: readonly CopcNodePointSampleResult[];
  readonly nodePointCount: number;
  readonly sampledPointCount: number;
  readonly points: readonly CopcPointDataSample[];
}

export interface CopcPointSampleCacheStats {
  readonly cachedSampleSetCount: number;
  readonly maxCachedSampleSetCount: number;
  readonly cachedPointSampleBytes: number;
  readonly maxCachedPointSampleBytes: number;
  readonly cacheHitCount: number;
  readonly cacheMissCount: number;
  readonly cacheEvictionCount: number;
}
