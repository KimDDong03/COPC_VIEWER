export interface CopcCameraStreamBudgetSummaryOptions {
  readonly configuredRenderedPointBudget: number;
  readonly effectiveRenderedPointBudget: number;
  /** Current zoom-band ceiling after applying the configured hard cap. */
  readonly maxRenderedPointBudget?: number;
  readonly effectiveSourcePointBudget: number;
  readonly maxSourcePointBudget: number;
  readonly effectiveNodePointBudget: number;
  readonly maxNodePointBudget: number;
  readonly effectivePointDataLengthBudget: number;
  readonly maxPointDataLengthBudget: number;
  readonly effectiveNodePointDataLengthBudget: number;
  readonly maxNodePointDataLengthBudget: number;
  readonly lastRenderedPointBudget?: number;
  readonly formatBytes: (byteCount: number) => string;
}

export interface CopcCameraStreamBudgetLimits {
  readonly maxNodePointCount: number;
  readonly maxNodePointDataLength: number;
  readonly maxPointDataLength: number;
  readonly maxRenderedPointCount: number;
  readonly maxSourcePointCount: number;
}

export interface CopcCameraStreamEffectiveBudget {
  readonly nodePointCount: number;
  readonly nodePointDataLength: number;
  readonly pointDataLength: number;
  readonly renderedPointCount: number;
  readonly sourcePointCount: number;
}

export interface CopcCameraStreamRenderedBudgetConstraintOptions {
  readonly budget: CopcCameraStreamEffectiveBudget;
  readonly minNodePointCount?: number;
  readonly minNodePointDataLength?: number;
  readonly minPointDataLength?: number;
  readonly minSourcePointCount?: number;
  readonly nodePointMultiplier?: number;
  readonly nodePointDataBytesPerRenderedPoint?: number;
  readonly pointDataBytesPerRenderedPoint?: number;
  readonly sourcePointMultiplier?: number;
}

export interface CopcCameraStreamAdaptiveBudgetState {
  readonly fastRunCount?: number;
  readonly nodePointBudget?: number;
  readonly nodePointDataLengthBudget?: number;
  readonly pointDataLengthBudget?: number;
  readonly renderedPointBudget?: number;
  readonly sourcePointBudget?: number;
}

export interface CopcCameraStreamAdaptiveBudgetPolicy {
  readonly minNodePointCount?: number;
  readonly minNodePointDataLength?: number;
  readonly minPointDataLength?: number;
  readonly minRenderedPointCount?: number;
  readonly minSourcePointCount?: number;
  readonly recoveryDecodeMilliseconds?: number;
  readonly recoveryRatio?: number;
  readonly recoveryRenderMilliseconds?: number;
  readonly recoveryStreak?: number;
  readonly recoveryTotalMilliseconds?: number;
  readonly recoveryWorkerMilliseconds?: number;
  readonly renderBudgetDecayRatio?: number;
  readonly slowDecodeMilliseconds?: number;
  readonly slowRenderMilliseconds?: number;
  readonly slowTotalMilliseconds?: number;
  readonly slowWorkerMilliseconds?: number;
  readonly sourceBudgetDecayRatio?: number;
}

export interface CopcCameraStreamAdaptiveBudgetTimings {
  readonly decodeMilliseconds?: number;
  readonly renderMilliseconds?: number;
  readonly roundTripMilliseconds?: number;
  readonly totalMilliseconds: number;
  readonly workerMilliseconds?: number;
}

export interface CopcCameraStreamAdaptiveBudgetUpdateOptions {
  readonly limits: CopcCameraStreamBudgetLimits;
  readonly policy?: CopcCameraStreamAdaptiveBudgetPolicy;
  readonly state?: CopcCameraStreamAdaptiveBudgetState;
  readonly timings: CopcCameraStreamAdaptiveBudgetTimings;
}

export interface CopcCameraStreamAdaptiveBudgetUpdate {
  readonly action: "none" | "reduced" | "recovering" | "recovered";
  readonly effectiveBudget: CopcCameraStreamEffectiveBudget;
  readonly isRenderSlow: boolean;
  readonly isSourceSlow: boolean;
  readonly isStableForRecovery: boolean;
  readonly state: CopcCameraStreamAdaptiveBudgetState;
}

const DEFAULT_CAMERA_STREAM_MIN_RENDERED_POINT_COUNT = 10_000;
const DEFAULT_CAMERA_STREAM_MIN_SOURCE_POINT_COUNT = 360_000;
const DEFAULT_CAMERA_STREAM_MIN_NODE_POINT_COUNT = 30_000;
const DEFAULT_CAMERA_STREAM_MIN_POINT_DATA_LENGTH = 4 * 1024 * 1024;
const DEFAULT_CAMERA_STREAM_MIN_NODE_POINT_DATA_LENGTH = 512 * 1024;
const DEFAULT_CAMERA_STREAM_SLOW_RENDER_MILLISECONDS = 2_500;
const DEFAULT_CAMERA_STREAM_SLOW_DECODE_MILLISECONDS = 8_000;
const DEFAULT_CAMERA_STREAM_SLOW_WORKER_MILLISECONDS = 10_000;
const DEFAULT_CAMERA_STREAM_SLOW_TOTAL_MILLISECONDS = 45_000;
const DEFAULT_CAMERA_STREAM_RECOVERY_TOTAL_MILLISECONDS = 8_000;
const DEFAULT_CAMERA_STREAM_RECOVERY_RENDER_MILLISECONDS = 1_500;
const DEFAULT_CAMERA_STREAM_RECOVERY_DECODE_MILLISECONDS = 2_500;
const DEFAULT_CAMERA_STREAM_RECOVERY_WORKER_MILLISECONDS = 3_500;
const DEFAULT_CAMERA_STREAM_RECOVERY_STREAK = 3;
const DEFAULT_CAMERA_STREAM_RENDER_BUDGET_DECAY_RATIO = 0.75;
const DEFAULT_CAMERA_STREAM_SOURCE_BUDGET_DECAY_RATIO = 0.45;
const DEFAULT_CAMERA_STREAM_BUDGET_RECOVERY_RATIO = 1.25;
const DEFAULT_RENDERED_BUDGET_SOURCE_POINT_MULTIPLIER = 18;
const DEFAULT_RENDERED_BUDGET_NODE_POINT_MULTIPLIER = 4;
const DEFAULT_RENDERED_BUDGET_POINT_DATA_BYTES_PER_POINT = 192;
const DEFAULT_RENDERED_BUDGET_NODE_POINT_DATA_BYTES_PER_POINT = 96;

export function formatCopcCameraStreamBudgetSummary(
  options: CopcCameraStreamBudgetSummaryOptions,
): string {
  const maxRenderedPointBudget =
    options.maxRenderedPointBudget ?? options.configuredRenderedPointBudget;
  const pointBudgetText = formatAdaptivePointBudget(
    options.effectiveRenderedPointBudget,
    maxRenderedPointBudget,
    "render pts cap",
  );
  const configuredPointBudgetText =
    maxRenderedPointBudget === options.configuredRenderedPointBudget
      ? ""
      : ` (${options.configuredRenderedPointBudget.toLocaleString()} configured max)`;
  const sourcePointBudgetText = formatAdaptivePointBudget(
    options.effectiveSourcePointBudget,
    options.maxSourcePointBudget,
    "source pts",
  );
  const nodePointBudgetText = formatAdaptivePointBudget(
    options.effectiveNodePointBudget,
    options.maxNodePointBudget,
    "per-node source pts",
  );
  const pointDataLengthBudgetText = formatAdaptiveByteBudget(
    options.effectivePointDataLengthBudget,
    options.maxPointDataLengthBudget,
    "compressed",
    options.formatBytes,
  );
  const nodePointDataLengthBudgetText = formatAdaptiveByteBudget(
    options.effectiveNodePointDataLengthBudget,
    options.maxNodePointDataLengthBudget,
    "per-node",
    options.formatBytes,
  );
  const budgetText = `${pointBudgetText}${configuredPointBudgetText}, ${sourcePointBudgetText}, ${nodePointBudgetText}, ${pointDataLengthBudgetText}, ${nodePointDataLengthBudgetText}`;

  return options.lastRenderedPointBudget === undefined
    ? budgetText
    : `${budgetText}, last ${options.lastRenderedPointBudget.toLocaleString()} points`;
}

export function createCopcCameraStreamEffectiveBudget(options: {
  readonly limits: CopcCameraStreamBudgetLimits;
  readonly state?: CopcCameraStreamAdaptiveBudgetState;
}): CopcCameraStreamEffectiveBudget {
  return {
    renderedPointCount: readEffectiveBudget(
      options.limits.maxRenderedPointCount,
      options.state?.renderedPointBudget,
    ),
    sourcePointCount: readEffectiveBudget(
      options.limits.maxSourcePointCount,
      options.state?.sourcePointBudget,
    ),
    nodePointCount: readEffectiveBudget(
      options.limits.maxNodePointCount,
      options.state?.nodePointBudget,
    ),
    pointDataLength: readEffectiveBudget(
      options.limits.maxPointDataLength,
      options.state?.pointDataLengthBudget,
    ),
    nodePointDataLength: readEffectiveBudget(
      options.limits.maxNodePointDataLength,
      options.state?.nodePointDataLengthBudget,
    ),
  };
}

export function constrainCopcCameraStreamBudgetForRenderedPoints(
  options: CopcCameraStreamRenderedBudgetConstraintOptions,
): CopcCameraStreamEffectiveBudget {
  const budget = options.budget;
  const renderedPointCount = normalizePositiveInteger(
    budget.renderedPointCount,
    1,
  );
  const sourcePointMultiplier = normalizePositiveNumber(
    options.sourcePointMultiplier,
    DEFAULT_RENDERED_BUDGET_SOURCE_POINT_MULTIPLIER,
  );
  const nodePointMultiplier = normalizePositiveNumber(
    options.nodePointMultiplier,
    DEFAULT_RENDERED_BUDGET_NODE_POINT_MULTIPLIER,
  );
  const pointDataBytesPerRenderedPoint = normalizePositiveNumber(
    options.pointDataBytesPerRenderedPoint,
    DEFAULT_RENDERED_BUDGET_POINT_DATA_BYTES_PER_POINT,
  );
  const nodePointDataBytesPerRenderedPoint = normalizePositiveNumber(
    options.nodePointDataBytesPerRenderedPoint,
    DEFAULT_RENDERED_BUDGET_NODE_POINT_DATA_BYTES_PER_POINT,
  );

  return {
    renderedPointCount,
    sourcePointCount: Math.min(
      budget.sourcePointCount,
      Math.max(
        normalizePositiveInteger(options.minSourcePointCount, 1),
        Math.ceil(renderedPointCount * sourcePointMultiplier),
      ),
    ),
    nodePointCount: Math.min(
      budget.nodePointCount,
      Math.max(
        normalizePositiveInteger(options.minNodePointCount, 1),
        Math.ceil(renderedPointCount * nodePointMultiplier),
      ),
    ),
    pointDataLength: Math.min(
      budget.pointDataLength,
      Math.max(
        normalizePositiveInteger(options.minPointDataLength, 1),
        Math.ceil(renderedPointCount * pointDataBytesPerRenderedPoint),
      ),
    ),
    nodePointDataLength: Math.min(
      budget.nodePointDataLength,
      Math.max(
        normalizePositiveInteger(options.minNodePointDataLength, 1),
        Math.ceil(renderedPointCount * nodePointDataBytesPerRenderedPoint),
      ),
    ),
  };
}

export function updateCopcCameraStreamAdaptiveBudget(
  options: CopcCameraStreamAdaptiveBudgetUpdateOptions,
): CopcCameraStreamAdaptiveBudgetUpdate {
  const policy = normalizeAdaptiveBudgetPolicy(options.policy);
  const limits = normalizeBudgetLimits(options.limits);
  const currentBudget = createCopcCameraStreamEffectiveBudget({
    limits,
    state: options.state,
  });
  const minBudget = createMinimumBudget(limits, policy);
  const timings = options.timings;
  const decodeMilliseconds = timings.decodeMilliseconds ?? 0;
  const renderMilliseconds = timings.renderMilliseconds ?? 0;
  const workerMilliseconds = timings.workerMilliseconds ?? 0;
  const roundTripMilliseconds = timings.roundTripMilliseconds ?? 0;
  const isRenderSlow = renderMilliseconds > policy.slowRenderMilliseconds;
  const isSourceSlow =
    timings.totalMilliseconds > policy.slowTotalMilliseconds ||
    decodeMilliseconds > policy.slowDecodeMilliseconds ||
    workerMilliseconds > policy.slowWorkerMilliseconds ||
    roundTripMilliseconds > policy.slowWorkerMilliseconds;

  if (isRenderSlow || isSourceSlow) {
    const nextState = clearMaxBudgetState(
      {
        ...options.state,
        fastRunCount: 0,
        renderedPointBudget: isRenderSlow
          ? reduceAdaptiveBudget(
              currentBudget.renderedPointCount,
              minBudget.renderedPointCount,
              policy.renderBudgetDecayRatio,
            )
          : options.state?.renderedPointBudget,
        sourcePointBudget: isSourceSlow
          ? reduceAdaptiveBudget(
              currentBudget.sourcePointCount,
              minBudget.sourcePointCount,
              policy.sourceBudgetDecayRatio,
            )
          : options.state?.sourcePointBudget,
        nodePointBudget: isSourceSlow
          ? reduceAdaptiveBudget(
              currentBudget.nodePointCount,
              minBudget.nodePointCount,
              policy.sourceBudgetDecayRatio,
            )
          : options.state?.nodePointBudget,
        pointDataLengthBudget: isSourceSlow
          ? reduceAdaptiveBudget(
              currentBudget.pointDataLength,
              minBudget.pointDataLength,
              policy.sourceBudgetDecayRatio,
            )
          : options.state?.pointDataLengthBudget,
        nodePointDataLengthBudget: isSourceSlow
          ? reduceAdaptiveBudget(
              currentBudget.nodePointDataLength,
              minBudget.nodePointDataLength,
              policy.sourceBudgetDecayRatio,
            )
          : options.state?.nodePointDataLengthBudget,
      },
      limits,
    );

    return {
      action: hasBudgetStateChanged(options.state, nextState)
        ? "reduced"
        : "none",
      effectiveBudget: currentBudget,
      isRenderSlow,
      isSourceSlow,
      isStableForRecovery: false,
      state: nextState,
    };
  }

  const hasAdaptiveLimit = hasAdaptiveBudgetLimit(currentBudget, limits);
  const isStableForRecovery =
    hasAdaptiveLimit &&
    timings.totalMilliseconds < policy.recoveryTotalMilliseconds &&
    renderMilliseconds < policy.recoveryRenderMilliseconds &&
    decodeMilliseconds < policy.recoveryDecodeMilliseconds &&
    workerMilliseconds < policy.recoveryWorkerMilliseconds &&
    roundTripMilliseconds < policy.recoveryWorkerMilliseconds;

  if (!isStableForRecovery) {
    return {
      action: "none",
      effectiveBudget: currentBudget,
      isRenderSlow,
      isSourceSlow,
      isStableForRecovery,
      state: clearUndefinedBudgetState({
        ...options.state,
        fastRunCount: 0,
      }),
    };
  }

  const nextFastRunCount = normalizeNonNegativeInteger(
    options.state?.fastRunCount,
  ) + 1;

  if (nextFastRunCount < policy.recoveryStreak) {
    return {
      action: "recovering",
      effectiveBudget: currentBudget,
      isRenderSlow,
      isSourceSlow,
      isStableForRecovery,
      state: clearUndefinedBudgetState({
        ...options.state,
        fastRunCount: nextFastRunCount,
      }),
    };
  }

  const nextState = clearMaxBudgetState(
    {
      ...options.state,
      fastRunCount: 0,
      renderedPointBudget: recoverAdaptiveBudget(
        currentBudget.renderedPointCount,
        limits.maxRenderedPointCount,
        policy.recoveryRatio,
      ),
      sourcePointBudget: recoverAdaptiveBudget(
        currentBudget.sourcePointCount,
        limits.maxSourcePointCount,
        policy.recoveryRatio,
      ),
      nodePointBudget: recoverAdaptiveBudget(
        currentBudget.nodePointCount,
        limits.maxNodePointCount,
        policy.recoveryRatio,
      ),
      pointDataLengthBudget: recoverAdaptiveBudget(
        currentBudget.pointDataLength,
        limits.maxPointDataLength,
        policy.recoveryRatio,
      ),
      nodePointDataLengthBudget: recoverAdaptiveBudget(
        currentBudget.nodePointDataLength,
        limits.maxNodePointDataLength,
        policy.recoveryRatio,
      ),
    },
    limits,
  );

  return {
    action: "recovered",
    effectiveBudget: currentBudget,
    isRenderSlow,
    isSourceSlow,
    isStableForRecovery,
    state: nextState,
  };
}

function formatAdaptivePointBudget(
  effectiveBudget: number,
  maxBudget: number,
  label: string,
): string {
  return effectiveBudget === maxBudget
    ? `${maxBudget.toLocaleString()} ${label}`
    : `${effectiveBudget.toLocaleString()} / ${maxBudget.toLocaleString()} ${label} adaptive`;
}

function formatAdaptiveByteBudget(
  effectiveBudget: number,
  maxBudget: number,
  label: string,
  formatBytes: (byteCount: number) => string,
): string {
  return effectiveBudget === maxBudget
    ? `${formatBytes(maxBudget)} ${label}`
    : `${formatBytes(effectiveBudget)} / ${formatBytes(maxBudget)} ${label} adaptive`;
}

function normalizeAdaptiveBudgetPolicy(
  policy: CopcCameraStreamAdaptiveBudgetPolicy | undefined,
): Required<CopcCameraStreamAdaptiveBudgetPolicy> {
  return {
    minRenderedPointCount: normalizePositiveInteger(
      policy?.minRenderedPointCount,
      DEFAULT_CAMERA_STREAM_MIN_RENDERED_POINT_COUNT,
    ),
    minSourcePointCount: normalizePositiveInteger(
      policy?.minSourcePointCount,
      DEFAULT_CAMERA_STREAM_MIN_SOURCE_POINT_COUNT,
    ),
    minNodePointCount: normalizePositiveInteger(
      policy?.minNodePointCount,
      DEFAULT_CAMERA_STREAM_MIN_NODE_POINT_COUNT,
    ),
    minPointDataLength: normalizePositiveInteger(
      policy?.minPointDataLength,
      DEFAULT_CAMERA_STREAM_MIN_POINT_DATA_LENGTH,
    ),
    minNodePointDataLength: normalizePositiveInteger(
      policy?.minNodePointDataLength,
      DEFAULT_CAMERA_STREAM_MIN_NODE_POINT_DATA_LENGTH,
    ),
    slowRenderMilliseconds: normalizeNonNegativeNumber(
      policy?.slowRenderMilliseconds,
      DEFAULT_CAMERA_STREAM_SLOW_RENDER_MILLISECONDS,
    ),
    slowDecodeMilliseconds: normalizeNonNegativeNumber(
      policy?.slowDecodeMilliseconds,
      DEFAULT_CAMERA_STREAM_SLOW_DECODE_MILLISECONDS,
    ),
    slowWorkerMilliseconds: normalizeNonNegativeNumber(
      policy?.slowWorkerMilliseconds,
      DEFAULT_CAMERA_STREAM_SLOW_WORKER_MILLISECONDS,
    ),
    slowTotalMilliseconds: normalizeNonNegativeNumber(
      policy?.slowTotalMilliseconds,
      DEFAULT_CAMERA_STREAM_SLOW_TOTAL_MILLISECONDS,
    ),
    recoveryTotalMilliseconds: normalizeNonNegativeNumber(
      policy?.recoveryTotalMilliseconds,
      DEFAULT_CAMERA_STREAM_RECOVERY_TOTAL_MILLISECONDS,
    ),
    recoveryRenderMilliseconds: normalizeNonNegativeNumber(
      policy?.recoveryRenderMilliseconds,
      DEFAULT_CAMERA_STREAM_RECOVERY_RENDER_MILLISECONDS,
    ),
    recoveryDecodeMilliseconds: normalizeNonNegativeNumber(
      policy?.recoveryDecodeMilliseconds,
      DEFAULT_CAMERA_STREAM_RECOVERY_DECODE_MILLISECONDS,
    ),
    recoveryWorkerMilliseconds: normalizeNonNegativeNumber(
      policy?.recoveryWorkerMilliseconds,
      DEFAULT_CAMERA_STREAM_RECOVERY_WORKER_MILLISECONDS,
    ),
    recoveryStreak: normalizePositiveInteger(
      policy?.recoveryStreak,
      DEFAULT_CAMERA_STREAM_RECOVERY_STREAK,
    ),
    renderBudgetDecayRatio: normalizeRatio(
      policy?.renderBudgetDecayRatio,
      DEFAULT_CAMERA_STREAM_RENDER_BUDGET_DECAY_RATIO,
    ),
    sourceBudgetDecayRatio: normalizeRatio(
      policy?.sourceBudgetDecayRatio,
      DEFAULT_CAMERA_STREAM_SOURCE_BUDGET_DECAY_RATIO,
    ),
    recoveryRatio: normalizePositiveNumber(
      policy?.recoveryRatio,
      DEFAULT_CAMERA_STREAM_BUDGET_RECOVERY_RATIO,
    ),
  };
}

function normalizeBudgetLimits(
  limits: CopcCameraStreamBudgetLimits,
): CopcCameraStreamBudgetLimits {
  return {
    maxRenderedPointCount: normalizePositiveInteger(
      limits.maxRenderedPointCount,
      1,
    ),
    maxSourcePointCount: normalizePositiveInteger(limits.maxSourcePointCount, 1),
    maxNodePointCount: normalizePositiveInteger(limits.maxNodePointCount, 1),
    maxPointDataLength: normalizePositiveInteger(limits.maxPointDataLength, 1),
    maxNodePointDataLength: normalizePositiveInteger(
      limits.maxNodePointDataLength,
      1,
    ),
  };
}

function createMinimumBudget(
  limits: CopcCameraStreamBudgetLimits,
  policy: Required<CopcCameraStreamAdaptiveBudgetPolicy>,
): CopcCameraStreamEffectiveBudget {
  return {
    renderedPointCount: Math.min(
      limits.maxRenderedPointCount,
      policy.minRenderedPointCount,
    ),
    sourcePointCount: Math.min(
      limits.maxSourcePointCount,
      policy.minSourcePointCount,
    ),
    nodePointCount: Math.min(
      limits.maxNodePointCount,
      policy.minNodePointCount,
    ),
    pointDataLength: Math.min(
      limits.maxPointDataLength,
      policy.minPointDataLength,
    ),
    nodePointDataLength: Math.min(
      limits.maxNodePointDataLength,
      policy.minNodePointDataLength,
    ),
  };
}

function readEffectiveBudget(maxBudget: number, adaptiveBudget: number | undefined): number {
  return Math.min(
    normalizePositiveInteger(maxBudget, 1),
    normalizePositiveInteger(adaptiveBudget, Number.POSITIVE_INFINITY),
  );
}

function reduceAdaptiveBudget(
  currentBudget: number,
  minBudget: number,
  decayRatio: number,
): number {
  if (currentBudget <= minBudget) {
    return minBudget;
  }

  return Math.max(minBudget, Math.floor(currentBudget * decayRatio));
}

function recoverAdaptiveBudget(
  currentBudget: number,
  maxBudget: number,
  recoveryRatio: number,
): number {
  if (currentBudget >= maxBudget) {
    return maxBudget;
  }

  return Math.min(maxBudget, Math.ceil(currentBudget * recoveryRatio));
}

function hasAdaptiveBudgetLimit(
  currentBudget: CopcCameraStreamEffectiveBudget,
  limits: CopcCameraStreamBudgetLimits,
): boolean {
  return (
    currentBudget.renderedPointCount < limits.maxRenderedPointCount ||
    currentBudget.sourcePointCount < limits.maxSourcePointCount ||
    currentBudget.nodePointCount < limits.maxNodePointCount ||
    currentBudget.pointDataLength < limits.maxPointDataLength ||
    currentBudget.nodePointDataLength < limits.maxNodePointDataLength
  );
}

function clearMaxBudgetState(
  state: CopcCameraStreamAdaptiveBudgetState,
  limits: CopcCameraStreamBudgetLimits,
): CopcCameraStreamAdaptiveBudgetState {
  return clearUndefinedBudgetState({
    ...state,
    renderedPointBudget:
      state.renderedPointBudget === limits.maxRenderedPointCount
        ? undefined
        : state.renderedPointBudget,
    sourcePointBudget:
      state.sourcePointBudget === limits.maxSourcePointCount
        ? undefined
        : state.sourcePointBudget,
    nodePointBudget:
      state.nodePointBudget === limits.maxNodePointCount
        ? undefined
        : state.nodePointBudget,
    pointDataLengthBudget:
      state.pointDataLengthBudget === limits.maxPointDataLength
        ? undefined
        : state.pointDataLengthBudget,
    nodePointDataLengthBudget:
      state.nodePointDataLengthBudget === limits.maxNodePointDataLength
        ? undefined
        : state.nodePointDataLengthBudget,
  });
}

function clearUndefinedBudgetState(
  state: CopcCameraStreamAdaptiveBudgetState,
): CopcCameraStreamAdaptiveBudgetState {
  return {
    ...(state.fastRunCount !== undefined ? { fastRunCount: state.fastRunCount } : {}),
    ...(state.renderedPointBudget !== undefined
      ? { renderedPointBudget: state.renderedPointBudget }
      : {}),
    ...(state.sourcePointBudget !== undefined
      ? { sourcePointBudget: state.sourcePointBudget }
      : {}),
    ...(state.nodePointBudget !== undefined
      ? { nodePointBudget: state.nodePointBudget }
      : {}),
    ...(state.pointDataLengthBudget !== undefined
      ? { pointDataLengthBudget: state.pointDataLengthBudget }
      : {}),
    ...(state.nodePointDataLengthBudget !== undefined
      ? { nodePointDataLengthBudget: state.nodePointDataLengthBudget }
      : {}),
  };
}

function hasBudgetStateChanged(
  previous: CopcCameraStreamAdaptiveBudgetState | undefined,
  next: CopcCameraStreamAdaptiveBudgetState,
): boolean {
  const empty: CopcCameraStreamAdaptiveBudgetState = {};

  return (
    (previous ?? empty).fastRunCount !== next.fastRunCount ||
    (previous ?? empty).renderedPointBudget !== next.renderedPointBudget ||
    (previous ?? empty).sourcePointBudget !== next.sourcePointBudget ||
    (previous ?? empty).nodePointBudget !== next.nodePointBudget ||
    (previous ?? empty).pointDataLengthBudget !== next.pointDataLengthBudget ||
    (previous ?? empty).nodePointDataLengthBudget !==
      next.nodePointDataLengthBudget
  );
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value !== undefined && value > 0
    ? value
    : fallback;
}

function normalizeNonNegativeInteger(value: number | undefined): number {
  return Number.isSafeInteger(value) && value !== undefined && value > 0
    ? value
    : 0;
}

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? value
    : fallback;
}

function normalizeNonNegativeNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value >= 0
    ? value
    : fallback;
}

function normalizeRatio(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0 && value < 1
    ? value
    : fallback;
}
