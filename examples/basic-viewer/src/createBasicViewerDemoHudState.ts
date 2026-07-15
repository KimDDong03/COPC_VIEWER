export type BasicViewerDemoStage =
  | "idle"
  | "metadata"
  | "preview"
  | "refining"
  | "ready"
  | "error";

export interface BasicViewerDemoHudInput {
  readonly datasetLabel: string;
  readonly stage: BasicViewerDemoStage;
  readonly totalPointCount?: number;
  readonly selectedSourcePointCount?: number;
  readonly renderedSampleCount?: number;
  readonly selectedNodeCount?: number;
  readonly selectedDepth?: number;
  readonly selectedCompressedByteLength?: number;
  readonly coverageRatio?: number;
}

export interface BasicViewerDemoHudState {
  readonly datasetLabel: string;
  readonly stage: BasicViewerDemoStage;
  readonly stageLabel: string;
  readonly totalPointCount: string;
  readonly selectedSourcePointCount: string;
  readonly renderedSampleCount: string;
  readonly selectedNodeCount: string;
  readonly selectedDepth: string;
  readonly selectedCompressedByteLength: string;
  readonly coverage: string;
}

const STAGE_LABELS: Readonly<Record<BasicViewerDemoStage, string>> = {
  idle: "Idle",
  metadata: "Loading metadata",
  preview: "Preview",
  refining: "Refining detail",
  ready: "Ready",
  error: "Needs attention",
};
const COUNT_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
const DECIMAL_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
const EMPTY_VALUE = "—";

export function createBasicViewerDemoHudState(
  input: BasicViewerDemoHudInput,
): BasicViewerDemoHudState {
  return {
    datasetLabel: input.datasetLabel.trim() || "No dataset selected",
    stage: input.stage,
    stageLabel: STAGE_LABELS[input.stage],
    totalPointCount: formatCount(input.totalPointCount),
    selectedSourcePointCount: formatCount(input.selectedSourcePointCount),
    renderedSampleCount: formatCount(input.renderedSampleCount),
    selectedNodeCount: formatCount(input.selectedNodeCount),
    selectedDepth: formatCount(input.selectedDepth),
    selectedCompressedByteLength: formatBytes(
      input.selectedCompressedByteLength,
    ),
    coverage: formatCoverage(input.coverageRatio),
  };
}

function formatCount(value: number | undefined): string {
  return isNonNegativeFiniteNumber(value)
    ? COUNT_FORMATTER.format(value)
    : EMPTY_VALUE;
}

function formatBytes(value: number | undefined): string {
  if (!isNonNegativeFiniteNumber(value)) {
    return EMPTY_VALUE;
  }

  if (value < 1024) {
    return `${COUNT_FORMATTER.format(value)} B`;
  }

  const units = ["KiB", "MiB", "GiB", "TiB"] as const;
  let scaled = value / 1024;
  let unitIndex = 0;

  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }

  return `${DECIMAL_FORMATTER.format(scaled)} ${units[unitIndex]}`;
}

function formatCoverage(value: number | undefined): string {
  if (!isNonNegativeFiniteNumber(value)) {
    return EMPTY_VALUE;
  }

  const clamped = Math.min(1, value);
  return `${DECIMAL_FORMATTER.format(clamped * 100)}%`;
}

function isNonNegativeFiniteNumber(
  value: number | undefined,
): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}
