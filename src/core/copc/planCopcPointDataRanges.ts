export interface CopcPointDataRangeEntry {
  readonly nodeKey: string;
  readonly pointDataOffset?: number | bigint;
  readonly pointDataLength?: number | bigint;
}

export interface CopcPointDataPlannedRange {
  readonly begin: number;
  readonly end: number;
}

export interface PlanCopcPointDataRangesOptions {
  readonly maxGapBytes?: number | bigint;
  readonly maxSpanBytes?: number | bigint;
}

interface NormalizedEntry {
  readonly nodeKey: string;
  readonly begin: number;
  readonly end: number;
}

const DEFAULT_MAX_GAP_BYTES = 0;
const DEFAULT_MAX_SPAN_BYTES = 2 * 1024 * 1024;

export function planCopcPointDataRanges(
  entries: readonly CopcPointDataRangeEntry[],
  options: PlanCopcPointDataRangesOptions = {},
): Map<string, CopcPointDataPlannedRange> {
  const maxGapBytes = readNonNegativeSafeInteger(
    options.maxGapBytes ?? DEFAULT_MAX_GAP_BYTES,
    "maxGapBytes",
  );
  const maxSpanBytes = readPositiveSafeInteger(
    options.maxSpanBytes ?? DEFAULT_MAX_SPAN_BYTES,
    "maxSpanBytes",
  );
  const normalizedEntries = normalizeEntries(entries);
  const plannedRangeByNodeKey = new Map<string, CopcPointDataPlannedRange>();
  let currentSpan: NormalizedEntry[] = [];

  for (const entry of normalizedEntries) {
    if (entry.begin === entry.end) {
      assignSpan(plannedRangeByNodeKey, [entry]);
      continue;
    }

    const previousEntry = currentSpan.at(-1);

    if (
      previousEntry === undefined ||
      canMergeEntry(currentSpan[0], previousEntry, entry, {
        maxGapBytes,
        maxSpanBytes,
      })
    ) {
      currentSpan.push(entry);
      continue;
    }

    assignSpan(plannedRangeByNodeKey, currentSpan);
    currentSpan = [entry];
  }

  assignSpan(plannedRangeByNodeKey, currentSpan);

  return plannedRangeByNodeKey;
}

function normalizeEntries(
  entries: readonly CopcPointDataRangeEntry[],
): NormalizedEntry[] {
  const seenNodeKeys = new Set<string>();

  return entries
    .map((entry) => {
      if (entry.nodeKey.length === 0) {
        throw new Error("nodeKey must be a non-empty string.");
      }

      if (seenNodeKeys.has(entry.nodeKey)) {
        throw new Error(`Duplicate COPC point-data node key: ${entry.nodeKey}`);
      }

      seenNodeKeys.add(entry.nodeKey);

      const begin = readNonNegativeSafeInteger(
        entry.pointDataOffset,
        `pointDataOffset for ${entry.nodeKey}`,
      );
      const length = readNonNegativeSafeInteger(
        entry.pointDataLength,
        `pointDataLength for ${entry.nodeKey}`,
      );
      const end = begin + length;

      if (!Number.isSafeInteger(end)) {
        throw new Error(
          `point-data range end for ${entry.nodeKey} must be a safe integer.`,
        );
      }

      return {
        nodeKey: entry.nodeKey,
        begin,
        end,
      };
    })
    .sort(
      (left, right) =>
        left.begin - right.begin ||
        left.end - right.end ||
        compareStrings(left.nodeKey, right.nodeKey),
    );
}

function canMergeEntry(
  firstEntry: NormalizedEntry | undefined,
  previousEntry: NormalizedEntry,
  nextEntry: NormalizedEntry,
  options: {
    readonly maxGapBytes: number;
    readonly maxSpanBytes: number;
  },
): boolean {
  if (firstEntry === undefined) {
    return false;
  }

  const gap = nextEntry.begin - previousEntry.end;

  if (gap < 0 || gap > options.maxGapBytes) {
    return false;
  }

  const mergedLength =
    Math.max(previousEntry.end, nextEntry.end) - firstEntry.begin;

  return mergedLength <= options.maxSpanBytes;
}

function assignSpan(
  plannedRangeByNodeKey: Map<string, CopcPointDataPlannedRange>,
  entries: readonly NormalizedEntry[],
): void {
  const firstEntry = entries[0];
  const lastEntry = entries.at(-1);

  if (firstEntry === undefined || lastEntry === undefined) {
    return;
  }

  const range = {
    begin: firstEntry.begin,
    end: lastEntry.end,
  };

  for (const entry of entries) {
    plannedRangeByNodeKey.set(entry.nodeKey, range);
  }
}

function readNonNegativeSafeInteger(
  value: number | bigint | undefined,
  label: string,
): number {
  const numberValue = readSafeInteger(value, label);

  if (numberValue < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }

  return numberValue;
}

function readPositiveSafeInteger(
  value: number | bigint | undefined,
  label: string,
): number {
  const numberValue = readSafeInteger(value, label);

  if (numberValue <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }

  return numberValue;
}

function readSafeInteger(
  value: number | bigint | undefined,
  label: string,
): number {
  if (typeof value === "bigint") {
    if (
      value < BigInt(Number.MIN_SAFE_INTEGER) ||
      value > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new Error(`${label} must be a safe integer.`);
    }

    return Number(value);
  }

  if (value === undefined) {
    throw new Error(`${label} must be a safe integer.`);
  }

  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer.`);
  }

  return value;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
