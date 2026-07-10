import type { Getter } from "copc";

export interface CopcRangeGetterCacheOptions {
  readonly maxCachedRangeBytes?: number;
  readonly maxCachedRangeCount?: number;
}

interface RangeCacheEntry {
  readonly promise: Promise<Uint8Array>;
  byteLength: number;
}

const DEFAULT_MAX_CACHED_RANGE_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_CACHED_RANGE_COUNT = 64;

export function createCachedRangeGetter(
  getter: Getter,
  options: CopcRangeGetterCacheOptions = {},
): Getter {
  const maxCachedRangeBytes = normalizePositiveIntegerOption(
    options.maxCachedRangeBytes,
    DEFAULT_MAX_CACHED_RANGE_BYTES,
  );
  const maxCachedRangeCount = normalizePositiveIntegerOption(
    options.maxCachedRangeCount,
    DEFAULT_MAX_CACHED_RANGE_COUNT,
  );

  if (maxCachedRangeBytes <= 0 || maxCachedRangeCount <= 0) {
    return getter;
  }

  const cache = new Map<string, RangeCacheEntry>();
  let cachedByteLength = 0;

  return async (begin: number, end: number): Promise<Uint8Array> => {
    const key = createRangeCacheKey(begin, end);
    const cached = cache.get(key);

    if (cached) {
      cache.delete(key);
      cache.set(key, cached);
      return copyBytes(await cached.promise);
    }

    const entry: RangeCacheEntry = {
      byteLength: 0,
      promise: getter(begin, end).then((bytes) => {
        const cachedBytes = copyBytes(bytes);

        if (cache.get(key) !== entry) {
          return cachedBytes;
        }

        if (cachedBytes.byteLength > maxCachedRangeBytes) {
          cache.delete(key);
          return cachedBytes;
        }

        entry.byteLength = cachedBytes.byteLength;
        cachedByteLength += entry.byteLength;
        cachedByteLength = trimRangeCache(
          cache,
          cachedByteLength,
          maxCachedRangeCount,
          maxCachedRangeBytes,
        );

        return cachedBytes;
      }).catch((error: unknown) => {
        if (cache.get(key) === entry) {
          cache.delete(key);
        }

        throw error;
      }),
    };

    cache.set(key, entry);
    return copyBytes(await entry.promise);
  };
}

function trimRangeCache(
  cache: Map<string, RangeCacheEntry>,
  cachedByteLength: number,
  maxCachedRangeCount: number,
  maxCachedRangeBytes: number,
): number {
  while (
    cache.size > maxCachedRangeCount ||
    cachedByteLength > maxCachedRangeBytes
  ) {
    if (cache.size === 0) {
      return 0;
    }

    cachedByteLength -= removeOldestRangeCacheEntry(cache);
  }

  return cachedByteLength;
}

function removeOldestRangeCacheEntry(
  cache: Map<string, RangeCacheEntry>,
): number {
  const oldestKey = cache.keys().next().value;

  if (!oldestKey) {
    return 0;
  }

  const oldest = cache.get(oldestKey);
  cache.delete(oldestKey);
  return oldest?.byteLength ?? 0;
}

function createRangeCacheKey(begin: number, end: number): string {
  return `${begin}:${end}`;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
}

function normalizePositiveIntegerOption(
  value: number | undefined,
  fallback: number,
): number {
  return value === undefined || !Number.isSafeInteger(value) || value < 0
    ? fallback
    : value;
}
