import {
  Cartesian3,
  ImageryLayer,
  TileMapServiceImageryProvider,
  Viewer,
  buildModuleUrl,
  type TileProviderError,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  COPC_POINT_CLOUD_QUALITY_SETTINGS as RENDER_QUALITY_SETTINGS,
  CesiumBufferPointRenderer,
  CesiumPointPrimitiveRenderer,
  CesiumPrimitivePointRenderer,
  CopcCameraStreamNodeSampleCache as CameraStreamNodeSampleCache,
  CopcCameraStreamPrefetchController as CameraStreamPrefetchController,
  CopcCameraStreamRequestController as CameraStreamRequestController,
  CopcPointCloudCameraStream,
  CopcPointCloudLayer,
  DEFAULT_COPC_POINT_CLOUD_QUALITY_PRESET as DEFAULT_RENDER_QUALITY,
  constrainCopcCameraStreamBudgetForRenderedPoints as constrainCameraStreamBudgetForRenderedPoints,
  createCopcWorkerPoolSettings as createWorkerPoolSettings,
  createCopcCameraDestination,
  createCopcCameraStreamEffectiveBudget as createCameraStreamEffectiveBudget,
  createCopcCameraStreamCoverageNodeKeys as createCameraStreamCoverageNodeKeys,
  createCopcCameraStreamLodSettings as createCameraStreamLodSettings,
  createCopcCameraStreamPrefetchPlan as createCameraStreamPrefetchPlan,
  createCopcCameraStreamPrefetchNodeCount as createCameraStreamPrefetchNodeCount,
  createCopcCameraStreamPrefetchSelectionPlan as createCameraStreamPrefetchSelectionPlan,
  createCopcCameraStreamPreviewPointCountPerNode as createCameraStreamPreviewPointCountPerNode,
  createCopcCameraStreamDetailProgressState as createCameraStreamDetailProgressState,
  createCopcCameraStreamVisualQualityState as createCameraStreamVisualQualityState,
  createCopcCameraStreamRenderPlan as createCameraStreamRenderPlan,
  createCopcCameraStreamRequestPriority as createCameraStreamRequestPriority,
  createCopcCameraStreamRuntimeSettings as createCameraStreamRuntimeSettings,
  createCopcCameraStreamRenderNodeKeys as createCameraStreamRenderNodeKeys,
  formatCopcCameraStreamBudgetSummary as formatCameraStreamBudgetSummary,
  formatCopcCameraStreamDiagnostics as formatCameraStreamDiagnostics,
  formatCopcCameraStreamDetailProgress as formatCameraStreamDetailProgress,
  formatCopcCameraStreamFinalNodeMix as formatFinalNodeMix,
  formatCopcCameraStreamLodSummary as formatCameraStreamLodSummary,
  formatCopcCameraStreamVisualQuality as formatCameraStreamVisualQuality,
  formatCopcHierarchyNodeCameraSelection as formatCameraSelection,
  formatCopcLoadedHierarchyPages as formatLoadedHierarchyPages,
  canReuseCopcCameraStreamCommittedRender as canReuseCameraStreamCommittedRender,
  hasFreshCopcCameraStreamNodeSamples as hasFreshCameraStreamNodeResults,
  isCopcCameraStreamZoomRefinement as isCameraStreamZoomRefinement,
  maxCopcNodeKeyDepth as maxNodeKeyDepth,
  mergeCopcCameraStreamNodeSamples as mergeCameraStreamNodeSampleResults,
  runCopcCameraStreamTerminalRender as runCameraStreamTerminalRender,
  resolveCopcCameraStreamHierarchyExpansionDepth as resolveCameraStreamHierarchyExpansionDepth,
  shouldRenderCopcCameraStreamProgress as shouldRenderCameraStreamProgress,
  selectCopcCameraStreamDetailWarmupPolicy as selectCameraStreamDetailWarmupPolicy,
  selectCopcCameraStreamRequestPriorityOffsets as selectCameraStreamRequestPriorityOffsets,
  summarizeCopcCameraStreamSourceNodes as summarizeCameraStreamSourceNodes,
  updateCopcCameraStreamAdaptiveBudget as updateCameraStreamAdaptiveBudgetState,
  type CopcBounds,
  type CopcCameraStreamAdaptiveBudgetState as AdaptiveBudgetState,
  type CopcCameraStreamBudgetLimits as AdaptiveBudgetLimits,
  type CopcCameraStreamDiagnostics as CameraStreamDiagnostics,
  type CopcCameraStreamDetailProgressState as CameraStreamDetailProgressState,
  type CopcCameraStreamEffectiveBudget as CameraStreamEffectiveBudget,
  type CopcCameraStreamLodSettings as CameraStreamLodSettings,
  type CopcCameraStreamVisualQualityState as CameraStreamVisualQualityState,
  type CopcCoordinateTransformStatus,
  type CopcCoordinateTransformSet,
  type CopcHierarchyCacheStats,
  type CopcHierarchyNodeCameraSelection,
  type CopcHierarchyNodeSuggestion,
  type CopcHierarchyNodeSummary,
  type CopcHierarchySummary,
  type CopcInspection,
  type CopcMultiNodePointSampleResult,
  type CopcNodePointSampleResult,
  type CopcPointCloudLayerAutomaticRenderResult,
  type CopcPointCloudLayerDecodedPointDataCacheStats,
  type CopcPointCloudLayerHierarchyExpansionResult,
  type CopcPointCloudLayerNodesRenderResult,
  type CopcPointCloudLayerPointGeometryCacheStats,
  type CopcPointCloudLayerPointGeometryTimingStats,
  type CopcPointCloudLayerPrefetchNodePointDataResult,
  type CopcPointCloudLayerRenderStats,
  type CopcPointCloudRendererFactory,
  type CopcPointCloudQualityPreset as RenderQuality,
  type CopcPointCloudQualitySettings as RenderQualitySettings,
  type CopcPointSampleCacheStats,
  type PointSample,
} from "copc-cesium";
import { createHardcodedPointSamples } from "./hardcodedPointSamples";
import { selectCameraStreamAdaptiveBudgetState } from "./selectCameraStreamAdaptiveBudgetState";
import {
  createLocalFileCopcSource,
  createCustomCopcSource,
  DEFAULT_SAMPLE_COPC_SOURCE,
  SAMPLE_COPC_SOURCES,
  type CustomCopcProjectionOptions,
  type CopcSourceConfig,
  type SampleCopcSource,
} from "./sampleCopcSources";
import "./style.css";

const CUSTOM_SAMPLE_OPTION_VALUE = "custom";
const AUTO_LOD_PREVIEW_MAX_NODE_COUNT = 8;
const AUTO_LOD_PREVIEW_MAX_RENDERED_POINT_COUNT = 48_000;
const AUTO_LOD_PREVIEW_MAX_SOURCE_POINT_COUNT = 180_000;
const AUTO_LOD_PREVIEW_MAX_POINT_DATA_LENGTH = 8 * 1024 * 1024;
const AUTO_LOD_PREVIEW_POINT_COUNT_PER_NODE = 8_000;
const AUTO_LOD_PREVIEW_TARGET_NODE_SCREEN_PIXELS = 360;
const AUTO_LOD_PREVIEW_TARGET_POINT_SPACING_SCREEN_PIXELS = 12;
const INTERACTIVE_PREVIEW_REQUEST_PRIORITY_OFFSET = 2;
const INTERACTIVE_DETAIL_REQUEST_PRIORITY_OFFSET = 1;
const DEFAULT_AUTO_STREAM_ON_CAMERA_MOVE = true;
const DEFAULT_CAMERA_STREAM_MAX_RENDERED_POINT_COUNT =
  readQualityCameraStreamMaxRenderedPointCount(
    RENDER_QUALITY_SETTINGS[DEFAULT_RENDER_QUALITY],
  );
const DEFAULT_MAX_POINT_COUNT_PER_NODE =
  RENDER_QUALITY_SETTINGS[DEFAULT_RENDER_QUALITY].maxPointCountPerNode;
const BENCHMARK_CAMERA_STEP_COUNT = 24;
const BENCHMARK_CAMERA_DURATION_MILLISECONDS = 2400;
const BENCHMARK_CAMERA_MOVE_METERS = 25;
const HIERARCHY_PAGE_CACHE_LIMIT = 64;
const HIERARCHY_PAGE_CACHE_BYTE_LIMIT = 16 * 1024 * 1024;
const POINT_SAMPLE_CACHE_LIMIT = 768;
const POINT_SAMPLE_CACHE_BYTE_LIMIT = 384 * 1024 * 1024;
const POINT_GEOMETRY_BATCH_CACHE_LIMIT = 256;
const TRANSFORMED_POINT_GEOMETRY_BATCH_CACHE_LIMIT = 256;
const POINT_GEOMETRY_CACHE_BYTE_LIMIT = 384 * 1024 * 1024;
const DECODED_POINT_DATA_VIEW_CACHE_LIMIT_PER_WORKER = 128;
const DECODED_POINT_DATA_VIEW_CACHE_BYTE_LIMIT_PER_WORKER = 128 * 1024 * 1024;
const DECODED_POINT_DATA_VIEW_CACHE_BYTE_LIMIT_ACROSS_WORKERS =
  768 * 1024 * 1024;
const INITIAL_POINT_GEOMETRY_WORKER_WARMUP_TIMEOUT_MILLISECONDS = 1_500;
const WORKER_POOL_SETTINGS = createWorkerPoolSettings({
  hardwareConcurrency: readNavigatorHardwareConcurrency(),
});
const CAMERA_STREAM_RUNTIME_SETTINGS = createCameraStreamRuntimeSettings({
  // The typed-array renderer retains one primitive per geometry batch. Commit
  // newly decoded detail batches one at a time so a cold terminal refinement
  // never uploads multiple new GPU buffers in the same animation frame.
  fastRendererProgressBatchNodeCount: 1,
  previewCompletionNodeCount: 2,
  previewCompletionPointCount: 2_800,
});
const POINT_SAMPLE_WORKER_CONCURRENCY =
  WORKER_POOL_SETTINGS.pointSampleWorkerConcurrency;
const POINT_SAMPLE_WORKER_WARMUP_COUNT =
  WORKER_POOL_SETTINGS.pointSampleWorkerWarmupCount;
const POINT_GEOMETRY_WORKER_CONCURRENCY =
  WORKER_POOL_SETTINGS.pointGeometryWorkerConcurrency;
const POINT_GEOMETRY_WORKER_WARMUP_COUNT =
  WORKER_POOL_SETTINGS.pointGeometryWorkerWarmupCount;
const CAMERA_STREAM_DETAIL_MAX_ACTIVE_NODE_REQUESTS = Math.max(
  1,
  Math.min(
    POINT_GEOMETRY_WORKER_CONCURRENCY,
    CAMERA_STREAM_RUNTIME_SETTINGS.detailMaxActiveNodeRequests,
  ),
);
const POINT_RENDERER_LABELS = {
  typed: "Primitive typed arrays",
  primitive: "PointPrimitiveCollection",
  buffer: "BufferPointCollection (experimental)",
} as const;
const DEFAULT_POINT_RENDERER_KIND: PointRendererKind = "typed";
const BACKGROUND_CAMERA_HIERARCHY_MAX_PAGES = 16;
const RETAINED_RENDER_PREFETCH_DELAY_MILLISECONDS = 350;

type PointRendererKind = keyof typeof POINT_RENDERER_LABELS;
type CameraStreamRenderDisposition =
  | "new-render"
  | "retained-exact-render";

interface BasicViewerBenchmarkCameraOptions {
  readonly steps?: number;
  readonly durationMilliseconds?: number;
  readonly heightAboveCloudMeters?: number;
  readonly moveMeters?: number;
}

interface BasicViewerBenchmarkStatus {
  readonly status: string;
  readonly cameraMovementCompletedAtMilliseconds?: number;
  readonly cameraStreamFirstResponseMilliseconds?: number;
  readonly cameraStreamForegroundCompletionMilliseconds?: number;
  readonly cameraStreamFirstResponseEvidence?: BasicViewerFirstResponseEvidence;
  readonly cameraStreamRequestId?: number;
  readonly expectedCameraStreamRequestId?: number;
  readonly cameraStreamCameraEpoch: number;
  readonly cameraStreamCameraPoseFingerprint: string;
  readonly pointRenderer?: string;
  readonly rendererTiming?: string;
  readonly rendererPayload?: string;
  readonly pointGeometryTiming?: string;
  readonly cameraStreamDiagnostics?: string;
  readonly cameraStreamDiagnosticsData?: CameraStreamDiagnostics;
  readonly cameraStreamDetailProgress?: CameraStreamDetailProgressState;
  readonly cameraStreamVisualQuality?: CameraStreamVisualQualityState;
  readonly cameraStreamRenderSignature?: string;
  readonly cameraStreamRenderDisposition?: CameraStreamRenderDisposition;
  readonly cameraStreamRendererRevision?: number;
  readonly cameraStreamSelectedNodeKeys?: readonly string[];
  readonly cameraStreamHierarchyHeld: boolean;
  readonly cameraStreamNodeReuse?: CameraStreamNodeReuseState;
  readonly cameraStreamPrefetch?: string;
  readonly cameraStreamPrefetchData?: CameraStreamPrefetchStatus;
  readonly cameraStreamLod?: string;
  readonly cameraStreamLodData?: CameraStreamLodSettings;
  readonly hierarchyPages?: string;
  readonly hierarchyCacheStats?: CopcHierarchyCacheStats;
  readonly pointCache?: string;
  readonly geometryCache?: string;
  readonly decodedWorkerCache?: string;
  readonly decodedPointDataCache?: CopcPointCloudLayerDecodedPointDataCacheStats;
  readonly renderSet?: string;
  readonly autoLod?: string;
  readonly cameraStreamBudget?: string;
}

interface BasicViewerFirstResponseEvidence {
  readonly source: "app-render-commit" | "app-render-retained";
  readonly requestId: number;
  readonly appliedRequestId?: number;
  readonly elapsedMilliseconds: number;
  readonly renderDisposition: CameraStreamRenderDisposition;
  readonly rendererRevision?: number;
  readonly status: string;
  readonly rendererTiming?: string;
  readonly pointGeometryTiming?: string;
  readonly cameraStreamDiagnostics?: CameraStreamDiagnostics;
  readonly cameraStreamVisualQuality?: CameraStreamVisualQualityState;
  readonly selectedNodeKeys: readonly string[];
}

interface BasicViewerBenchmarkHierarchyHoldResult {
  readonly held: true;
  readonly hierarchyCacheStats: CopcHierarchyCacheStats;
}

interface CameraStreamNodeReuseState {
  readonly finalNodeCount: number;
  readonly cachedFinalNodeCount: number;
  readonly freshCachedFinalNodeCount: number;
  readonly cachedCoverageNodeCount: number;
}

interface CameraStreamCommittedRenderState {
  readonly layer: CopcPointCloudLayer;
  readonly result: CopcPointCloudLayerNodesRenderResult;
  readonly maxPointCountPerNode: number;
  readonly renderedPointBudget: number;
  readonly rendererRevision: number;
  readonly visualQuality: CameraStreamVisualQualityState;
}

interface BasicViewerBenchmarkCacheResetResult {
  readonly pointSampleSetCount: number;
  readonly pointGeometryBatchCount: number;
  readonly pointSampleWorkerCount: number;
  readonly pointGeometryWorkerCount: number;
  readonly pointGeometryWorkerWarmupMilliseconds?: number;
  readonly cameraStreamRequestId?: number;
}

interface BasicViewerBenchmarkCacheResetOptions {
  readonly resetLayerCaches?: boolean;
}

interface BasicViewerCameraStreamControllerSmokeResult {
  readonly completedPointCount: number;
  readonly listenerCountRestored: boolean;
  readonly updatePhases: readonly ("progress" | "complete")[];
}

interface BasicViewerRendererBenchmarkOptions {
  readonly maxPointCountPerNode: number;
  readonly renderer: PointRendererKind;
}

interface InspectSourceOptions {
  readonly initialRenderMode?: "automatic" | "selected-node";
}

interface BasicViewerBenchmarkApi {
  readonly moveCameraForSmoothness: (
    options?: BasicViewerBenchmarkCameraOptions,
  ) => Promise<BasicViewerBenchmarkStatus>;
  readonly waitForCameraStreamPrefetch: (
    timeoutMilliseconds?: number,
  ) => Promise<BasicViewerBenchmarkStatus>;
  readonly holdCameraHierarchyForSmoothness: () => Promise<BasicViewerBenchmarkHierarchyHoldResult>;
  readonly releaseCameraHierarchyForSmoothness: () => void;
  readonly clearStreamingCaches: (
    options?: BasicViewerBenchmarkCacheResetOptions,
  ) => Promise<BasicViewerBenchmarkCacheResetResult>;
  readonly verifyCameraStreamController: () => Promise<BasicViewerCameraStreamControllerSmokeResult>;
  readonly renderForRendererBenchmark: (
    options: BasicViewerRendererBenchmarkOptions,
  ) => Promise<BasicViewerBenchmarkStatus>;
  readonly waitForSceneReady: (timeoutMilliseconds?: number) => Promise<void>;
  readonly getStatus: () => BasicViewerBenchmarkStatus;
}

interface CameraStreamPrefetchStatus {
  readonly state: "pending" | "completed" | "skipped" | "failed";
  readonly plannedNodeCount: number;
  readonly requestedNodeCount: number;
  readonly prefetchedNodeCount: number;
  readonly skippedNodeCount: number;
  readonly selectedDepth: number;
  readonly completed: boolean;
  readonly reason?: string;
}

interface CameraHierarchyRefinementState {
  readonly pendingRelevantHierarchyPageCount: number;
  readonly pendingRelevantHierarchyPageSignature: string | undefined;
  readonly isHierarchyCompleteForView: boolean;
  readonly refinedThroughDepth?: number;
}

interface CameraHierarchyPrefetchOptions {
  readonly delayMilliseconds?: number;
  readonly prefetchGeometryBatches?: boolean;
  readonly selectedDepth?: number;
}

declare global {
  interface Window {
    __copcBasicViewerBenchmark?: BasicViewerBenchmarkApi;
  }
}

const elements = getPrototypeElements();
initializeRendererBenchmarkControls();
let currentLayer: CopcPointCloudLayer | undefined;
let currentInspection: CopcInspection | undefined;
let currentHierarchy: CopcHierarchySummary | undefined;
let currentCoordinateTransform: CopcCoordinateTransformStatus | undefined;
let currentSuggestion: CopcHierarchyNodeSuggestion | undefined;
let currentSource: CopcSourceConfig = DEFAULT_SAMPLE_COPC_SOURCE;
let currentPointRendererKind: PointRendererKind = DEFAULT_POINT_RENDERER_KIND;
let lastCameraStreamDiagnostics: CameraStreamDiagnostics | undefined;
let lastCameraStreamDetailProgress: CameraStreamDetailProgressState | undefined;
let lastCameraStreamVisualQuality: CameraStreamVisualQualityState | undefined;
let lastCameraStreamPrefetchStatus: CameraStreamPrefetchStatus | undefined;
let lastCameraStreamAppliedRequestId: number | undefined;
let automaticAutoLodRequestId = 0;
let automaticAutoLodAbortController: AbortController | undefined;
let adaptiveAutoLodBudgetState: AdaptiveBudgetState = {};
let adaptiveCameraStreamBudgetState: AdaptiveBudgetState = {};
let lastAutoLodRenderedPointBudget: number | undefined;
let lastCameraStreamRenderedPointBudget: number | undefined;
let lastCameraStreamEffectiveBudget: CameraStreamEffectiveBudget | undefined;
let lastCameraStreamSelectedNodeKeys: readonly string[] = [];
let lastCameraStreamRenderSignature: string | undefined;
let lastCameraStreamRenderDisposition:
  | CameraStreamRenderDisposition
  | undefined;
let lastCameraStreamNodeReuse: CameraStreamNodeReuseState | undefined;
let lastCameraStreamCommittedRender: CameraStreamCommittedRenderState | undefined;
let lastCameraStreamLodSettings: CameraStreamLodSettings | undefined;
let lastCameraHierarchyRefinement: CameraHierarchyRefinementState | undefined;
let cameraStreamCameraEpoch = 0;
let activeAutomaticStreamCameraEpoch = 0;
let manualRenderRequestId = 0;
let manualRenderAbortController: AbortController | undefined;
let suppressNextAutomaticCameraStream = false;
let suppressedAutomaticCameraPoseFingerprint: string | undefined;
let suppressAutomaticCameraStreamEvents = false;
let automaticCameraMoveInProgress = false;
const cameraHierarchyFollowupSignatures = new Set<string>();
const renderNodeSet = new Set<string>();
const cameraStreamNodeSampleCache =
  new CameraStreamNodeSampleCache<CopcNodePointSampleResult>({
    maxSampleSetCount: CAMERA_STREAM_RUNTIME_SETTINGS.retainedNodeSampleLimit,
    canRenderNodeSample: (nodeResult) =>
      currentLayer?.canRenderNodeSampleResult(nodeResult) ?? true,
  });
const automaticStreamRequests = new CameraStreamRequestController({
  maxReusedBackgroundRequests:
    CAMERA_STREAM_RUNTIME_SETTINGS.maxReusedBackgroundStreams,
  minExactNodeOverlapRatio:
    CAMERA_STREAM_RUNTIME_SETTINGS.reuseMinExactNodeOverlapRatio,
  minNodeFamilyOverlapRatio:
    CAMERA_STREAM_RUNTIME_SETTINGS.reuseMinNodeFamilyOverlapRatio,
  reusedBackgroundRequestGraceMilliseconds:
    CAMERA_STREAM_RUNTIME_SETTINGS.reusedBackgroundStreamGraceMilliseconds,
  scheduler: {
    setTimeout: (callback, delayMilliseconds) =>
      window.setTimeout(callback, delayMilliseconds),
    clearTimeout: (timeoutHandle) =>
      window.clearTimeout(timeoutHandle as number),
  },
});
const automaticStreamPrefetches = new CameraStreamPrefetchController();
let queuedCameraStreamPrefetchTimeout: number | undefined;
let benchmarkHierarchyHoldLayer: CopcPointCloudLayer | undefined;
const naturalEarthBaseLayer = ImageryLayer.fromProviderAsync(
  createNaturalEarthImageryProvider(),
);
naturalEarthBaseLayer.errorEvent.addEventListener(
  handleNaturalEarthImageryError,
);

const viewer = new Viewer(elements.container, {
  animation: false,
  baseLayer: naturalEarthBaseLayer,
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  // This viewer has no 2D or Columbus-view mode switch. Keeping Cesium in 3D
  // avoids projecting every new COPC geometry batch into unused 2D buffers on
  // its first rendered frame.
  scene3DOnly: true,
  sceneModePicker: false,
  selectionIndicator: false,
  timeline: false,
  navigationHelpButton: false,
});
// Cesium defaults this threshold to 50%, which makes camera-driven LOD react
// too late during wheel zoom. Debouncing below keeps the extra callbacks cheap.
viewer.camera.percentageChanged = 0.01;

async function createNaturalEarthImageryProvider(): Promise<TileMapServiceImageryProvider> {
  const provider = await TileMapServiceImageryProvider.fromUrl(
    buildModuleUrl("Assets/Textures/NaturalEarthII"),
  );

  provider.errorEvent.addEventListener(handleNaturalEarthImageryError);
  return provider;
}

function handleNaturalEarthImageryError(error: unknown): void {
  if (isTileProviderError(error)) {
    error.retry = false;
  }
}

function isTileProviderError(error: unknown): error is TileProviderError {
  return typeof error === "object" && error !== null && "retry" in error;
}

const points = createHardcodedPointSamples();
const previewRenderer = new CesiumPointPrimitiveRenderer(viewer.scene);
previewRenderer.setPoints(points);

viewer.camera.flyTo({
  destination: cameraTargetForPoints(points),
  duration: 0,
});

function cameraTargetForPoints(
  pointSamples: readonly PointSample[],
): Cartesian3 {
  const firstPoint = pointSamples[0];

  if (!firstPoint) {
    throw new Error("Cannot focus the camera without point samples.");
  }

  return Cartesian3.fromDegrees(
    firstPoint.longitudeDegrees,
    firstPoint.latitudeDegrees,
    firstPoint.heightMeters + 1200,
  );
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    void inspectSource(createSourceConfigFromForm());
  } catch (error) {
    setInspectionError(error);
  }
});

elements.sampleSelect.addEventListener("change", () => {
  const sample = findSampleById(elements.sampleSelect.value);

  if (!sample) {
    syncCustomProjectionControls();
    elements.urlInput.focus();
    return;
  }

  elements.fileInput.value = "";
  elements.urlInput.value = sample.url;
  clearCustomProjectionInputs();
  syncCustomProjectionControls();
  void inspectSource(sample);
});

elements.rendererSelect.addEventListener("change", () => {
  void inspectSource(createSourceConfigFromForm());
});

elements.qualitySelect.addEventListener("change", () => {
  applyRenderQualitySettings(readRenderQuality());
  resetAutoLodAdaptiveBudget();
  resetCameraStreamAdaptiveBudget();
  void inspectSource(createSourceConfigFromForm());
});

elements.maxPointCountInput.addEventListener("change", () => {
  resetAutoLodAdaptiveBudget();
  void inspectSource(createSourceConfigFromForm());
});

elements.cameraStreamPointBudgetInput.addEventListener("change", () => {
  resetCameraStreamAdaptiveBudget();

  if (!elements.autoStreamCheckbox.checked) {
    return;
  }

  automaticStreamRequests.clearRenderSignature();
  void renderAutomaticNodeSetForCameraMove(true);
});

elements.urlInput.addEventListener("input", () => {
  elements.fileInput.value = "";
  syncSampleSelectWithUrl(elements.urlInput.value);
});

elements.fileInput.addEventListener("change", () => {
  const file = elements.fileInput.files?.[0];

  if (!file) {
    return;
  }

  elements.sampleSelect.value = CUSTOM_SAMPLE_OPTION_VALUE;
  elements.urlInput.value = file.name;
  syncCustomProjectionControls();
  void inspectSource(createSourceConfigFromForm());
});

elements.applySuggestionButton.addEventListener("click", () => {
  if (!currentSuggestion) {
    return;
  }

  elements.nodeSelect.value = currentSuggestion.node.key;
  void renderSelectedHierarchyNode();
});

elements.addSelectedButton.addEventListener("click", () => {
  if (elements.nodeSelect.value) {
    addNodeToRenderSet(elements.nodeSelect.value);
  }
});

elements.addSuggestionButton.addEventListener("click", () => {
  if (currentSuggestion) {
    addNodeToRenderSet(currentSuggestion.node.key);
  }
});

elements.loadMoreHierarchyButton.addEventListener("click", () => {
  void loadNextHierarchyPage();
});

elements.autoLodButton.addEventListener("click", () => {
  void renderAutomaticNodeSet();
});

elements.autoStreamCheckbox.addEventListener("change", () => {
  automaticStreamRequests.clearRenderSignature();
  advanceCameraStreamCameraEpoch();

  if (!elements.autoStreamCheckbox.checked) {
    cancelAutomaticCameraStreamRender();
    cancelCameraStreamPrefetch();
    clearQueuedAutomaticStreamRender();
    resetCameraStreamAdaptiveBudget();
    return;
  }

  if (elements.autoStreamCheckbox.checked) {
    resetCameraStreamAdaptiveBudget();
    void renderAutomaticNodeSetForCameraMove(true);
  }
});

elements.renderSetButton.addEventListener("click", () => {
  void renderSelectedNodeSet();
});

elements.clearSetButton.addEventListener("click", () => {
  renderNodeSet.clear();
  renderRenderSetControls();
});

viewer.camera.moveEnd.addEventListener(() => {
  updateSuggestedNode();

  if (suppressAutomaticCameraStreamEvents) {
    return;
  }

  if (shouldSuppressAutomaticCameraStreamForCurrentPose()) {
    return;
  }

  if (!automaticCameraMoveInProgress) {
    beginAutomaticCameraMove();
  }
  automaticCameraMoveInProgress = false;

  queueAutomaticStreamRenderForCameraMove(false);
});

viewer.camera.changed.addEventListener(() => {
  if (
    suppressAutomaticCameraStreamEvents ||
    shouldSuppressAutomaticCameraStreamForCurrentPose() ||
    !elements.autoStreamCheckbox.checked
  ) {
    return;
  }

  if (!automaticCameraMoveInProgress) {
    beginAutomaticCameraMove();
  }
  queueAutomaticStreamRenderForCameraMove(false);
});

viewer.camera.moveStart.addEventListener(() => {
  if (
    suppressAutomaticCameraStreamEvents ||
    shouldSuppressAutomaticCameraStreamForCurrentPose()
  ) {
    return;
  }

  beginAutomaticCameraMove();
});

installBasicViewerBenchmarkApi();
populateSampleSelect();
void inspectSource(DEFAULT_SAMPLE_COPC_SOURCE);

function installBasicViewerBenchmarkApi(): void {
  window.__copcBasicViewerBenchmark = {
    moveCameraForSmoothness,
    waitForCameraStreamPrefetch,
    holdCameraHierarchyForSmoothness,
    releaseCameraHierarchyForSmoothness,
    clearStreamingCaches: clearStreamingCachesForBenchmark,
    verifyCameraStreamController,
    renderForRendererBenchmark,
    waitForSceneReady: waitForSceneReadyForBenchmark,
    getStatus: readBenchmarkStatus,
  };
}

async function waitForSceneReadyForBenchmark(
  timeoutMilliseconds = 10_000,
): Promise<void> {
  if (!Number.isFinite(timeoutMilliseconds) || timeoutMilliseconds <= 0) {
    throw new Error("timeoutMilliseconds must be a positive finite number.");
  }

  const globe = viewer.scene.globe;

  if (!globe.tilesLoaded) {
    await new Promise<void>((resolve, reject) => {
      let removeListener: (() => void) | undefined;
      let completed = false;
      const timeoutId = globalThis.setTimeout(() => {
        finish(new Error("Timed out waiting for Cesium globe tiles."));
      }, timeoutMilliseconds);
      const finish = (error?: Error): void => {
        if (completed) {
          return;
        }

        completed = true;
        globalThis.clearTimeout(timeoutId);
        removeListener?.();

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      removeListener = globe.tileLoadProgressEvent.addEventListener(() => {
        if (globe.tilesLoaded) {
          finish();
        }
      });

      if (globe.tilesLoaded) {
        finish();
      }
    });
  }

  await new Promise<void>((resolve, reject) => {
    let removeListener: (() => void) | undefined;
    let completed = false;
    const timeoutId = globalThis.setTimeout(() => {
      finish(new Error("Timed out waiting for the Cesium scene to render."));
    }, timeoutMilliseconds);
    const finish = (error?: Error): void => {
      if (completed) {
        return;
      }

      completed = true;
      globalThis.clearTimeout(timeoutId);
      removeListener?.();

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    removeListener = viewer.scene.postRender.addEventListener(() => finish());
    viewer.scene.requestRender();
  });
}

async function renderForRendererBenchmark(
  options: BasicViewerRendererBenchmarkOptions,
): Promise<BasicViewerBenchmarkStatus> {
  if (!(options.renderer in POINT_RENDERER_LABELS)) {
    throw new Error(`Unknown point renderer: ${options.renderer}.`);
  }

  if (!isPositiveSafeInteger(options.maxPointCountPerNode)) {
    throw new Error("maxPointCountPerNode must be a positive integer.");
  }

  elements.rendererSelect.value = options.renderer;
  elements.maxPointCountInput.value = String(options.maxPointCountPerNode);
  await inspectSource(createSourceConfigFromForm(), {
    initialRenderMode: "selected-node",
  });

  const status = readBenchmarkStatus();

  if (!status.status.startsWith("Rendered ")) {
    throw new Error(
      `Renderer benchmark did not complete its selected-node render: ${status.status}`,
    );
  }

  return status;
}

async function verifyCameraStreamController(): Promise<BasicViewerCameraStreamControllerSmokeResult> {
  const layer = currentLayer;

  if (!layer) {
    throw new Error(
      "Load a COPC layer before verifying the camera stream controller.",
    );
  }

  cancelAutomaticCameraStreamRender();
  cancelCameraStreamPrefetch();
  clearQueuedAutomaticStreamRender();

  const cameraEvents = [
    viewer.camera.moveStart,
    viewer.camera.changed,
    viewer.camera.moveEnd,
  ] as const;
  const listenerCountsBefore = cameraEvents.map(
    (event) => event.numberOfListeners,
  );
  const updatePhases: Array<"progress" | "complete"> = [];
  const previousSuppression = suppressAutomaticCameraStreamEvents;
  let completedPointCount = 0;
  const controller = new CopcPointCloudCameraStream({
    camera: viewer.camera,
    layer,
    quality: readRenderQuality(),
    // Cesium can raise passive camera-changed events while this explicit smoke
    // render is active. Keep them queued; destroy() clears the pending timer.
    debounceMilliseconds: 60_000,
    renderOnStart: false,
    renderOptions: {
      maxNodes: 8,
      maxRenderedPointCount: 32_000,
      maxPointCountPerNode: 8_000,
    },
    onUpdate: ({ phase }) => {
      updatePhases.push(phase);
    },
  });

  suppressAutomaticCameraStreamEvents = true;

  try {
    controller.start();
    const result = await controller.render();

    if (!result) {
      throw new Error(
        "Camera stream controller did not return a render result.",
      );
    }

    completedPointCount = result.renderStats.pointCount;
  } finally {
    controller.destroy();
    suppressAutomaticCameraStreamEvents = previousSuppression;

    const listenerCountRestored = cameraEvents.every(
      (event, index) => event.numberOfListeners === listenerCountsBefore[index],
    );

    if (!listenerCountRestored) {
      throw new Error(
        "Camera stream controller did not restore Cesium camera listeners.",
      );
    }
  }

  return {
    completedPointCount,
    listenerCountRestored: true,
    updatePhases,
  };
}

async function moveCameraForSmoothness(
  options: BasicViewerBenchmarkCameraOptions = {},
): Promise<BasicViewerBenchmarkStatus> {
  const steps = readBenchmarkPositiveInteger(
    options.steps,
    BENCHMARK_CAMERA_STEP_COUNT,
  );
  const durationMilliseconds = readBenchmarkPositiveNumber(
    options.durationMilliseconds,
    BENCHMARK_CAMERA_DURATION_MILLISECONDS,
  );
  const heightAboveCloudMeters = readOptionalBenchmarkPositiveNumber(
    options.heightAboveCloudMeters,
  );
  const moveMeters = readBenchmarkPositiveNumber(
    options.moveMeters,
    BENCHMARK_CAMERA_MOVE_METERS,
  );
  const waitMilliseconds = durationMilliseconds / steps;

  if (heightAboveCloudMeters !== undefined) {
    focusBenchmarkCameraOnInspectionBounds(heightAboveCloudMeters);
  }

  beginAutomaticCameraMove();
  suppressAutomaticCameraStreamEvents = true;

  try {
    for (let index = 0; index < steps; index += 1) {
      moveBenchmarkCamera(index, moveMeters);
      viewer.scene.requestRender();
      if (index % 3 === 0) {
        queueAutomaticStreamRenderForCameraMove(false);
      }
      await delayForBenchmark(waitMilliseconds);
    }

    const cameraMovementCompletedAtMilliseconds = performance.now();
    automaticCameraMoveInProgress = false;

    updateSuggestedNode();
    clearQueuedAutomaticStreamRender();
    lastCameraStreamDiagnostics = undefined;
    lastCameraStreamDetailProgress = undefined;
    lastCameraStreamVisualQuality = undefined;
    lastCameraStreamPrefetchStatus = undefined;
    lastCameraStreamAppliedRequestId = undefined;
    lastCameraStreamLodSettings = undefined;
    lastCameraStreamRenderedPointBudget = undefined;
    lastCameraStreamEffectiveBudget = undefined;
    lastCameraStreamSelectedNodeKeys = [];
    lastCameraStreamRenderSignature = undefined;
    lastCameraStreamRenderDisposition = undefined;
    lastCameraStreamNodeReuse = undefined;
    elements.statusText.textContent =
      "Smoothness benchmark camera stream pending...";
    const foregroundRenderStartedAt = performance.now();
    let cameraStreamFirstResponseMilliseconds: number | undefined;
    let cameraStreamFirstResponseEvidence:
      BasicViewerFirstResponseEvidence | undefined;
    const expectedCameraStreamRequestId =
      await renderAutomaticNodeSetForCameraMove(
        true,
        false,
        (requestId, renderDisposition) => {
          if (cameraStreamFirstResponseMilliseconds !== undefined) {
            return;
          }

          cameraStreamFirstResponseMilliseconds =
            performance.now() - foregroundRenderStartedAt;
          const responseStatus = readBenchmarkStatus();
          cameraStreamFirstResponseEvidence = {
            source:
              renderDisposition === "retained-exact-render"
                ? "app-render-retained"
                : "app-render-commit",
            requestId,
            appliedRequestId: responseStatus.cameraStreamRequestId,
            elapsedMilliseconds: cameraStreamFirstResponseMilliseconds,
            renderDisposition,
            rendererRevision:
              responseStatus.cameraStreamRendererRevision,
            status: responseStatus.status,
            rendererTiming: responseStatus.rendererTiming,
            pointGeometryTiming: responseStatus.pointGeometryTiming,
            cameraStreamDiagnostics:
              responseStatus.cameraStreamDiagnosticsData,
            cameraStreamVisualQuality:
              responseStatus.cameraStreamVisualQuality,
            selectedNodeKeys:
              responseStatus.cameraStreamSelectedNodeKeys ?? [],
          };
        },
      );
    const cameraStreamForegroundCompletionMilliseconds =
      performance.now() - foregroundRenderStartedAt;
    await delayForBenchmark(200);
    return {
      ...readBenchmarkStatus(),
      cameraMovementCompletedAtMilliseconds,
      cameraStreamFirstResponseMilliseconds,
      cameraStreamForegroundCompletionMilliseconds,
      cameraStreamFirstResponseEvidence,
      expectedCameraStreamRequestId,
    };
  } finally {
    automaticCameraMoveInProgress = false;
    // Ignore the delayed Cesium changed/moveEnd pair generated by the
    // synthetic benchmark path; the explicit foreground request already owns
    // the final benchmark camera pose.
    suppressNextAutomaticCameraStream = true;
    captureSuppressedAutomaticCameraPose();
    suppressAutomaticCameraStreamEvents = false;
  }
}

async function waitForCameraStreamPrefetch(
  timeoutMilliseconds = 5_000,
): Promise<BasicViewerBenchmarkStatus> {
  await waitForCameraStreamPrefetchIdle(timeoutMilliseconds);
  return readBenchmarkStatus();
}

async function holdCameraHierarchyForSmoothness(): Promise<BasicViewerBenchmarkHierarchyHoldResult> {
  await Promise.resolve();
  const layer = currentLayer;

  if (!layer) {
    throw new Error(
      "A COPC layer must be loaded before holding its hierarchy.",
    );
  }

  if (
    queuedCameraStreamPrefetchTimeout !== undefined ||
    automaticStreamPrefetches.isActive
  ) {
    throw new Error(
      "Camera hierarchy can only be held after background prefetch is idle.",
    );
  }

  if (lastCameraStreamPrefetchStatus?.state !== "completed") {
    throw new Error(
      "Camera hierarchy can only be held after a completed warmup prefetch.",
    );
  }

  benchmarkHierarchyHoldLayer = layer;

  return {
    held: true,
    hierarchyCacheStats: layer.source.getHierarchyCacheStats(),
  };
}

function releaseCameraHierarchyForSmoothness(): void {
  benchmarkHierarchyHoldLayer = undefined;
}

function moveBenchmarkCamera(index: number, moveMeters: number): void {
  switch (index % 4) {
    case 0:
      viewer.camera.moveRight(moveMeters);
      break;
    case 1:
      viewer.camera.moveForward(moveMeters);
      break;
    case 2:
      viewer.camera.moveLeft(moveMeters);
      break;
    default:
      viewer.camera.moveBackward(moveMeters);
      break;
  }
}

function focusBenchmarkCameraOnInspectionBounds(
  heightAboveCloudMeters: number,
): void {
  if (!currentInspection || !currentSource) {
    return;
  }

  const coordinateTransforms =
    currentSource.coordinateTransforms(currentInspection);
  suppressNextAutomaticCameraStream = true;
  viewer.camera.setView({
    destination: createCopcCameraDestination(
      currentInspection,
      coordinateTransforms.toCesium,
      {
        minHeightAboveCloudMeters: heightAboveCloudMeters,
        extentHeightMultiplier: 0,
        verticalHeightMultiplier: 0,
      },
    ),
  });
  captureSuppressedAutomaticCameraPose();
  viewer.scene.requestRender();
}

async function clearStreamingCachesForBenchmark(
  options: BasicViewerBenchmarkCacheResetOptions = {},
): Promise<BasicViewerBenchmarkCacheResetResult> {
  cancelAutomaticCameraStreamRender();
  cancelCameraStreamPrefetch();
  releaseCameraHierarchyForSmoothness();
  clearQueuedAutomaticStreamRender();
  automaticStreamRequests.clearRenderSignature();
  cameraStreamNodeSampleCache.clear();
  resetCameraStreamAdaptiveBudget();
  lastCameraStreamDiagnostics = undefined;
  lastCameraStreamDetailProgress = undefined;
  lastCameraStreamVisualQuality = undefined;
  lastCameraStreamPrefetchStatus = undefined;
  lastCameraStreamAppliedRequestId = undefined;
  lastCameraStreamLodSettings = undefined;
  lastCameraStreamRenderedPointBudget = undefined;
  lastCameraStreamEffectiveBudget = undefined;
  lastCameraStreamSelectedNodeKeys = [];
  lastCameraStreamRenderSignature = undefined;
  lastCameraStreamRenderDisposition = undefined;
  lastCameraStreamNodeReuse = undefined;
  invalidateCameraStreamCommittedRender();
  advanceCameraStreamCameraEpoch();
  elements.statusText.textContent = options.resetLayerCaches
    ? "Camera stream layer caches reset for benchmark."
    : "Camera stream state reset for benchmark.";

  const resetResult =
    options.resetLayerCaches && currentLayer
      ? currentLayer.resetStreamingCaches()
      : {
          pointSampleSetCount: 0,
          pointGeometryBatchCount: 0,
          pointSampleWorkerCount: 0,
          pointGeometryWorkerCount: 0,
        };
  let pointGeometryWorkerWarmupMilliseconds: number | undefined;

  if (options.resetLayerCaches && currentLayer) {
    const warmupStartedAt = performance.now();
    await currentLayer.waitForPointGeometryWorkerWarmup();
    pointGeometryWorkerWarmupMilliseconds = performance.now() - warmupStartedAt;
  }

  return {
    ...resetResult,
    pointGeometryWorkerWarmupMilliseconds,
    cameraStreamRequestId: lastCameraStreamAppliedRequestId,
  };
}

function readBenchmarkStatus(): BasicViewerBenchmarkStatus {
  const metadata = readBenchmarkMetadataRows();

  return {
    status: elements.statusText.textContent?.trim() ?? "",
    cameraStreamRequestId: lastCameraStreamAppliedRequestId,
    cameraStreamCameraEpoch,
    cameraStreamCameraPoseFingerprint:
      createCameraStreamCameraPoseFingerprint(),
    pointRenderer: metadata["Point renderer"],
    rendererTiming: metadata["Renderer timing"],
    rendererPayload: metadata["Renderer payload"],
    pointGeometryTiming: metadata["Point geometry timing"],
    cameraStreamDiagnostics: metadata["Camera stream diagnostics"],
    cameraStreamDiagnosticsData: lastCameraStreamDiagnostics,
    cameraStreamDetailProgress: lastCameraStreamDetailProgress,
    cameraStreamVisualQuality: lastCameraStreamVisualQuality,
    cameraStreamRenderSignature: lastCameraStreamRenderSignature,
    cameraStreamRenderDisposition: lastCameraStreamRenderDisposition,
    cameraStreamRendererRevision: currentLayer?.getRendererRevision(),
    cameraStreamSelectedNodeKeys: [...lastCameraStreamSelectedNodeKeys],
    cameraStreamHierarchyHeld: benchmarkHierarchyHoldLayer === currentLayer,
    cameraStreamNodeReuse: lastCameraStreamNodeReuse,
    cameraStreamPrefetch: formatCameraStreamPrefetchStatus(
      lastCameraStreamPrefetchStatus,
    ),
    cameraStreamPrefetchData: lastCameraStreamPrefetchStatus,
    cameraStreamLod: metadata["Camera stream LOD"],
    cameraStreamLodData: lastCameraStreamLodSettings,
    hierarchyPages: metadata["Hierarchy pages"],
    hierarchyCacheStats: currentLayer?.source.getHierarchyCacheStats(),
    pointCache: metadata["Point cache"],
    geometryCache: metadata["Point geometry cache"],
    decodedWorkerCache: metadata["Decoded worker cache"],
    decodedPointDataCache: currentLayer?.getDecodedPointDataCacheStats(),
    renderSet: metadata["Render set"],
    autoLod: metadata["Auto LOD"],
    cameraStreamBudget: metadata["Camera stream budget"],
  };
}

function readBenchmarkMetadataRows(): Record<string, string> {
  const rows: Record<string, string> = {};

  elements.metadataList.querySelectorAll("dt").forEach((label) => {
    const key = label.textContent?.trim();

    if (!key) {
      return;
    }

    rows[key] = label.nextElementSibling?.textContent?.trim() ?? "";
  });

  return rows;
}

function readBenchmarkPositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  return value !== undefined && isPositiveSafeInteger(value) ? value : fallback;
}

function readBenchmarkPositiveNumber(
  value: number | undefined,
  fallback: number,
): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function readOptionalBenchmarkPositiveNumber(
  value: number | undefined,
): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function delayForBenchmark(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function waitForCameraStreamPrefetchIdle(
  timeoutMilliseconds: number,
): Promise<void> {
  const deadline = performance.now() + Math.max(0, timeoutMilliseconds);

  while (performance.now() < deadline) {
    const remainingMilliseconds = deadline - performance.now();

    if (automaticStreamPrefetches.isActive) {
      await Promise.race([
        automaticStreamPrefetches.waitForIdle(),
        delayForBenchmark(Math.min(50, remainingMilliseconds)),
      ]);
      continue;
    }

    if (
      lastCameraStreamPrefetchStatus?.completed === true &&
      queuedCameraStreamPrefetchTimeout === undefined
    ) {
      return;
    }

    await delayForBenchmark(Math.min(50, remainingMilliseconds));
  }
}

function createCameraStreamCameraPoseFingerprint(): string {
  const cameraVectors = [
    viewer.camera.positionWC,
    viewer.camera.directionWC,
    viewer.camera.upWC,
    viewer.camera.rightWC,
  ];

  return [
    ...cameraVectors.flatMap((vector) => [vector.x, vector.y, vector.z]),
    viewer.scene.canvas.clientWidth,
    viewer.scene.canvas.clientHeight,
  ]
    .map((value) =>
      Number.isFinite(value) ? value.toPrecision(15) : String(value),
    )
    .join("|");
}

function captureSuppressedAutomaticCameraPose(): void {
  if (!suppressNextAutomaticCameraStream) {
    return;
  }

  suppressedAutomaticCameraPoseFingerprint =
    createCameraStreamCameraPoseFingerprint();
}

function clearAutomaticCameraStreamPoseSuppression(): void {
  suppressNextAutomaticCameraStream = false;
  suppressedAutomaticCameraPoseFingerprint = undefined;
}

function shouldSuppressAutomaticCameraStreamForCurrentPose(): boolean {
  if (!suppressNextAutomaticCameraStream) {
    return false;
  }

  if (
    suppressedAutomaticCameraPoseFingerprint !== undefined &&
    suppressedAutomaticCameraPoseFingerprint !==
      createCameraStreamCameraPoseFingerprint()
  ) {
    // The camera no longer matches the programmatic pose. This is a real user
    // movement, so stale suppression must not consume its first refinement.
    clearAutomaticCameraStreamPoseSuppression();
    return false;
  }

  return true;
}

function advanceCameraStreamCameraEpoch(
  options: {
    readonly preserveKnownHierarchy?: boolean;
  } = {},
): void {
  cameraStreamCameraEpoch += 1;
  manualRenderAbortController?.abort();
  manualRenderAbortController = undefined;
  manualRenderRequestId += 1;
  cameraHierarchyFollowupSignatures.clear();

  if (!options.preserveKnownHierarchy) {
    lastCameraHierarchyRefinement = undefined;
  }
}

function readPendingCameraHierarchyPageCount(): number {
  // Until a camera-scoped hierarchy pass proves otherwise, the visible
  // hierarchy is deliberately treated as incomplete. This prevents a coarse
  // additive set from being advertised as terminal during background
  // refinement.
  return lastCameraHierarchyRefinement?.pendingRelevantHierarchyPageCount ?? 1;
}

async function inspectSource(
  source: CopcSourceConfig,
  options: InspectSourceOptions = {},
): Promise<void> {
  const activeSource = normalizeSourceConfig(source);
  const pointRendererKind = readPointRendererKind();
  const maxPointCountPerNode = readMaxPointCountPerNode();
  const previousLayer = currentLayer;
  releaseCameraHierarchyForSmoothness();
  cancelAutomaticAutoLodRender();
  cancelAutomaticCameraStreamRender();
  cancelCameraStreamPrefetch();
  currentLayer = undefined;
  previousLayer?.destroy();
  setInspectionLoading();
  previewRenderer.clear();
  const layer = new CopcPointCloudLayer(viewer.scene, {
    source: readCopcSourceInput(activeSource),
    maxCachedHierarchyPages: HIERARCHY_PAGE_CACHE_LIMIT,
    maxCachedHierarchyPageBytes: HIERARCHY_PAGE_CACHE_BYTE_LIMIT,
    maxCachedSampleSets: POINT_SAMPLE_CACHE_LIMIT,
    maxCachedPointSampleBytes: POINT_SAMPLE_CACHE_BYTE_LIMIT,
    maxCachedPointGeometryBatches: POINT_GEOMETRY_BATCH_CACHE_LIMIT,
    maxCachedTransformedPointGeometryBatches:
      TRANSFORMED_POINT_GEOMETRY_BATCH_CACHE_LIMIT,
    maxCachedPointGeometryBytes: POINT_GEOMETRY_CACHE_BYTE_LIMIT,
    maxConcurrentPointSampleWorkerRequests: POINT_SAMPLE_WORKER_CONCURRENCY,
    maxPointCountPerNode,
    pointSampleLoading: "worker",
    pointGeometryLoading: "integrated-worker",
    maxConcurrentPointGeometryWorkerRequests: POINT_GEOMETRY_WORKER_CONCURRENCY,
    activePointGeometryWorkerCancellation: "terminate-uncached",
    decodedNodeWorkerFallbackDelayMilliseconds:
      WORKER_POOL_SETTINGS.decodedNodeWorkerFallbackDelayMilliseconds,
    maxDecodedPointDataViewsPerWorker:
      DECODED_POINT_DATA_VIEW_CACHE_LIMIT_PER_WORKER,
    maxDecodedPointDataViewBytesPerWorker:
      DECODED_POINT_DATA_VIEW_CACHE_BYTE_LIMIT_PER_WORKER,
    maxDecodedPointDataViewBytesAcrossWorkers:
      DECODED_POINT_DATA_VIEW_CACHE_BYTE_LIMIT_ACROSS_WORKERS,
    createPointRenderer: createPointRendererFactory(pointRendererKind),
    showBounds: false,
    coordinateTransforms: activeSource.coordinateTransforms,
  });
  layer.warmUpPointSampleWorkers({
    workerCount: POINT_SAMPLE_WORKER_WARMUP_COUNT,
  });
  layer.warmUpPointGeometryWorkers({
    workerCount: POINT_GEOMETRY_WORKER_WARMUP_COUNT,
  });
  currentLayer = layer;
  currentInspection = undefined;
  currentHierarchy = undefined;
  currentCoordinateTransform = undefined;
  currentSuggestion = undefined;
  lastCameraStreamDiagnostics = undefined;
  lastCameraStreamDetailProgress = undefined;
  lastCameraStreamVisualQuality = undefined;
  lastCameraStreamPrefetchStatus = undefined;
  lastCameraStreamAppliedRequestId = undefined;
  lastCameraStreamRenderedPointBudget = undefined;
  lastCameraStreamEffectiveBudget = undefined;
  lastCameraStreamSelectedNodeKeys = [];
  lastCameraStreamRenderSignature = undefined;
  lastCameraStreamRenderDisposition = undefined;
  lastCameraStreamNodeReuse = undefined;
  lastCameraStreamLodSettings = undefined;
  invalidateCameraStreamCommittedRender();
  advanceCameraStreamCameraEpoch();
  cameraStreamNodeSampleCache.clear();
  currentSource = activeSource;
  currentPointRendererKind = pointRendererKind;
  cancelCameraStreamPrefetch();
  automaticStreamRequests.clearRenderSignature();
  clearQueuedAutomaticStreamRender();
  resetAutoLodAdaptiveBudget();
  resetCameraStreamAdaptiveBudget();
  elements.urlInput.value = activeSource.url;
  syncSampleSelectWithSource(activeSource);
  renderNodeSet.clear();
  renderSuggestion(undefined);
  renderHierarchyPageControls();
  renderRenderSetControls();

  try {
    const { inspection, hierarchy, coordinateTransform } = await layer.load();

    if (layer !== currentLayer) {
      return;
    }

    currentInspection = inspection;
    currentHierarchy = hierarchy;
    currentCoordinateTransform = coordinateTransform;
    if (
      DEFAULT_AUTO_STREAM_ON_CAMERA_MOVE &&
      coordinateTransform.supportsCameraSelection
    ) {
      elements.autoStreamCheckbox.checked = true;
    }
    populateNodeSelect(hierarchy);
    renderHierarchyPageControls();
    renderInspection(inspection);
    updateSuggestedNode();
    await waitForPointGeometryWorkerWarmup(layer);

    if (options.initialRenderMode === "selected-node") {
      elements.autoStreamCheckbox.checked = false;
      await renderSelectedHierarchyNode();
    } else if (
      layer === currentLayer &&
      currentCoordinateTransform?.supportsCameraSelection
    ) {
      focusCameraOnInspectionBounds(
        inspection,
        activeSource.coordinateTransforms(inspection),
      );
      try {
        if (elements.autoStreamCheckbox.checked) {
          await renderAutomaticNodeSetForCameraMove(true);
        } else {
          await renderAutomaticNodeSet();
        }
      } finally {
        // Keep filtering delayed events for this exact programmatic pose. The
        // first real user movement changes the pose fingerprint and clears the
        // suppression before its stream request is queued.
        captureSuppressedAutomaticCameraPose();
      }
    } else {
      await renderSelectedHierarchyNode();
    }
  } catch (error) {
    if (layer !== currentLayer) {
      return;
    }

    layer.destroy();
    currentLayer = undefined;
    currentCoordinateTransform = undefined;
    setInspectionError(error);
  }
}

function setInspectionLoading(): void {
  elements.statusText.textContent = "Reading COPC metadata...";
  elements.metadataList.replaceChildren();
  elements.nodeSelect.disabled = true;
  elements.nodeSelect.replaceChildren(new Option("Loading hierarchy...", ""));
  invalidateCameraStreamCommittedRender();
  currentLayer?.clear();
  renderSuggestion(undefined);
  renderHierarchyPageControls();
  renderRenderSetControls();
}

async function waitForPointGeometryWorkerWarmup(
  layer: CopcPointCloudLayer,
): Promise<void> {
  await Promise.race([
    layer.waitForPointGeometryWorkerWarmup(),
    delayForBenchmark(
      INITIAL_POINT_GEOMETRY_WORKER_WARMUP_TIMEOUT_MILLISECONDS,
    ),
  ]);
}

function setInspectionError(error: unknown): void {
  const message = readUnknownErrorMessage(error);
  elements.statusText.textContent = message
    ? `COPC inspection failed: ${message}`
    : "COPC inspection failed.";
  elements.metadataList.replaceChildren();
  elements.nodeSelect.disabled = true;
  invalidateCameraStreamCommittedRender();
  currentLayer?.clear();
  renderSuggestion(undefined);
  renderHierarchyPageControls();
  renderRenderSetControls();
}

function renderInspection(
  inspection: CopcInspection,
  pointResult?: CopcNodePointSampleResult,
  selectedNode?: CopcHierarchyNodeSummary,
  nodeSetResult?: CopcMultiNodePointSampleResult,
  cameraSelection?: CopcHierarchyNodeCameraSelection,
  renderStats?: CopcPointCloudLayerRenderStats,
): void {
  elements.statusText.textContent = "COPC metadata loaded.";
  elements.metadataList.replaceChildren(
    metadataRow("Point count", inspection.pointCount.toLocaleString()),
    metadataRow("Source preset", currentSource.label),
    metadataRow("Source note", currentSource.description),
    metadataRow(
      "Point renderer",
      POINT_RENDERER_LABELS[currentPointRendererKind],
    ),
    metadataRow("Render quality", formatRenderQuality(readRenderQuality())),
    metadataRow(
      "Max points / node",
      readMaxPointCountPerNode().toLocaleString(),
    ),
    metadataRow("Camera stream budget", formatCameraStreamBudget()),
    metadataRow("Auto LOD budget", formatAutoLodBudget()),
    metadataRow("Camera stream LOD", formatCameraStreamLod()),
    metadataRow(
      "Renderer timing",
      renderStats ? formatRenderStats(renderStats) : "Not rendered yet",
    ),
    metadataRow(
      "Renderer payload",
      renderStats ? formatRendererPayload(renderStats) : "Not rendered yet",
    ),
    metadataRow(
      "Point geometry timing",
      renderStats?.pointGeometryTimings
        ? formatPointGeometryTimings(renderStats.pointGeometryTimings)
        : "Not available",
    ),
    metadataRow(
      "Point geometry cache",
      currentLayer
        ? formatPointGeometryCacheStats(
            currentLayer.getPointGeometryCacheStats(),
          )
        : "Not available",
    ),
    metadataRow(
      "Decoded worker cache",
      currentLayer
        ? formatDecodedPointDataCacheStats(
            currentLayer.getDecodedPointDataCacheStats(),
          )
        : "Not available",
    ),
    metadataRow(
      "Camera stream diagnostics",
      lastCameraStreamDiagnostics
        ? formatCameraStreamDiagnostics(lastCameraStreamDiagnostics)
        : "Not streamed yet",
    ),
    metadataRow(
      "Camera stream coverage",
      formatCameraStreamDetailProgress(lastCameraStreamDetailProgress),
    ),
    metadataRow(
      "Camera stream visual quality",
      formatCameraStreamVisualQuality(lastCameraStreamVisualQuality),
    ),
    metadataRow(
      "Camera stream prefetch",
      formatCameraStreamPrefetchStatus(lastCameraStreamPrefetchStatus),
      "copc-camera-stream-prefetch",
    ),
    metadataRow("LAS version", inspection.lasVersion),
    metadataRow(
      "Point format",
      `${inspection.pointDataRecordFormat} (${inspection.pointDataRecordLength} bytes)`,
    ),
    metadataRow("Bounds min", formatBoundsMin(inspection.bounds)),
    metadataRow("Bounds max", formatBoundsMax(inspection.bounds)),
    metadataRow("COPC cube min", formatBoundsMin(inspection.cube)),
    metadataRow("COPC cube max", formatBoundsMax(inspection.cube)),
    metadataRow("Scale", formatVector(inspection.scale)),
    metadataRow("Offset", formatVector(inspection.offset)),
    metadataRow("Spacing", formatNumber(inspection.spacing)),
    metadataRow(
      "Root hierarchy",
      `${inspection.rootHierarchyPage.pageLength.toLocaleString()} bytes at ${inspection.rootHierarchyPage.pageOffset.toLocaleString()}`,
    ),
    metadataRow(
      "Hierarchy pages",
      currentHierarchy && currentLayer
        ? formatHierarchyPageStats(
            currentHierarchy,
            currentLayer.source.getHierarchyCacheStats(),
          )
        : "Not loaded",
    ),
    metadataRow("GPS time", formatVector(inspection.gpsTimeRange)),
    metadataRow(
      "Coordinate transform",
      currentCoordinateTransform
        ? formatCoordinateTransform(currentCoordinateTransform)
        : "Not loaded yet",
    ),
    metadataRow(
      "Selected node",
      pointResult
        ? `${pointResult.nodePointCount.toLocaleString()} loaded, ${pointResult.sampledPointCount.toLocaleString()} rendered`
        : "Not loaded yet",
    ),
    metadataRow(
      "Node bounds min",
      selectedNode ? formatBoundsMin(selectedNode.bounds) : "Not selected",
    ),
    metadataRow(
      "Node bounds max",
      selectedNode ? formatBoundsMax(selectedNode.bounds) : "Not selected",
    ),
    metadataRow(
      "Node density",
      selectedNode ? formatDensity(selectedNode.pointDensity) : "Not selected",
    ),
    metadataRow(
      "Render set",
      nodeSetResult
        ? `${nodeSetResult.nodeKeys.length.toLocaleString()} nodes, ${nodeSetResult.sampledPointCount.toLocaleString()} points rendered`
        : formatRenderSetSummary(),
    ),
    metadataRow(
      "Point cache",
      currentLayer
        ? formatPointSampleCacheStats(
            currentLayer.source.getPointSampleCacheStats(),
          )
        : "Not loaded",
    ),
    metadataRow("Point loader", "Web Worker with main-thread fallback"),
    metadataRow(
      "Auto LOD",
      cameraSelection ? formatCameraSelection(cameraSelection) : "Not applied",
    ),
    metadataRow("VLRs", formatVlrs(inspection)),
    metadataRow(
      "WKT",
      inspection.wkt ? truncateText(inspection.wkt, 220) : "Not found",
    ),
  );
}

function cameraTargetForPointCloud(
  pointSamples: readonly PointSample[],
): Cartesian3 {
  if (pointSamples.length === 0) {
    throw new Error("Cannot focus the camera without point samples.");
  }

  const totals = pointSamples.reduce(
    (sum, point) => ({
      longitudeDegrees: sum.longitudeDegrees + point.longitudeDegrees,
      latitudeDegrees: sum.latitudeDegrees + point.latitudeDegrees,
      maxHeightMeters: Math.max(sum.maxHeightMeters, point.heightMeters),
    }),
    {
      longitudeDegrees: 0,
      latitudeDegrees: 0,
      maxHeightMeters: Number.NEGATIVE_INFINITY,
    },
  );

  return Cartesian3.fromDegrees(
    totals.longitudeDegrees / pointSamples.length,
    totals.latitudeDegrees / pointSamples.length,
    totals.maxHeightMeters + 2_400,
  );
}

function focusCameraOnPointCloud(pointSamples: readonly PointSample[]): void {
  suppressNextAutomaticCameraStream = true;
  viewer.camera.setView({
    destination: cameraTargetForPointCloud(pointSamples),
  });
  captureSuppressedAutomaticCameraPose();
  viewer.scene.requestRender();
}

function focusCameraOnInspectionBounds(
  inspection: CopcInspection,
  coordinateTransforms: CopcCoordinateTransformSet,
): void {
  suppressNextAutomaticCameraStream = true;
  viewer.camera.setView({
    destination: createCopcCameraDestination(
      inspection,
      coordinateTransforms.toCesium,
    ),
  });
  captureSuppressedAutomaticCameraPose();
  viewer.scene.requestRender();
}

elements.nodeSelect.addEventListener("change", () => {
  void renderSelectedHierarchyNode();
});

async function renderSelectedHierarchyNode(): Promise<void> {
  if (!currentInspection || !currentLayer || !elements.nodeSelect.value) {
    return;
  }

  const layer = currentLayer;
  const nodeKey = elements.nodeSelect.value;
  const manualRequest = beginManualCameraRender();
  elements.statusText.textContent = `Reading COPC node ${nodeKey}...`;

  try {
    const result = await layer.renderNode(nodeKey, {
      signal: manualRequest.signal,
    });

    if (!isCurrentManualRender(layer, manualRequest)) {
      return;
    }

    focusCameraOnPointCloud(result.points);
    cameraStreamNodeSampleCache.remember([result.pointSamples]);
    renderInspection(
      result.inspection,
      result.pointSamples,
      result.node,
      undefined,
      undefined,
      result.renderStats,
    );
    elements.statusText.textContent = `Rendered ${result.pointSamples.sampledPointCount.toLocaleString()} real COPC points from node ${nodeKey}.`;
    updateSuggestedNode();
    renderRenderSetControls();
  } catch (error) {
    if (!isCurrentManualRender(layer, manualRequest)) {
      return;
    }

    setInspectionError(error);
  }
}

async function loadNextHierarchyPage(): Promise<void> {
  if (!currentInspection || !currentLayer || !currentHierarchy) {
    return;
  }

  const layer = currentLayer;
  const inspection = currentInspection;
  const nextPage = currentHierarchy.pendingPages[0];

  if (!nextPage) {
    elements.statusText.textContent = "No pending COPC hierarchy pages remain.";
    renderHierarchyPageControls();
    return;
  }

  const manualRequest = beginManualCameraRender();
  const previousNodeKey = elements.nodeSelect.value;
  elements.statusText.textContent = `Reading COPC hierarchy page ${nextPage.key}...`;

  try {
    const hierarchy = await layer.loadNextHierarchyPage();

    if (!isCurrentManualRender(layer, manualRequest) || !hierarchy) {
      return;
    }

    currentHierarchy = hierarchy;
    populateNodeSelect(hierarchy, previousNodeKey);
    renderHierarchyPageControls();
    updateSuggestedNode();
    renderInspection(inspection);
    elements.statusText.textContent = `Loaded hierarchy page ${nextPage.key}. ${hierarchy.nodes.length.toLocaleString()} nodes are available.`;
  } catch (error) {
    if (!isCurrentManualRender(layer, manualRequest)) {
      return;
    }

    setInspectionError(error);
  }
}

async function renderSelectedNodeSet(): Promise<void> {
  await renderNodeKeySet([...renderNodeSet]);
}

async function renderAutomaticNodeSet(): Promise<void> {
  if (!currentInspection || !currentHierarchy || !currentLayer) {
    return;
  }

  if (!currentCoordinateTransform?.supportsCameraSelection) {
    elements.statusText.textContent =
      "Auto LOD unavailable: coordinateTransforms.toCopc is required.";
    return;
  }

  const layer = currentLayer;
  invalidateCameraStreamCommittedRender();
  automaticAutoLodAbortController?.abort();
  cancelAutomaticCameraStreamRender();
  cancelCameraStreamPrefetch();
  clearQueuedAutomaticStreamRender();
  advanceCameraStreamCameraEpoch();
  const abortController = new AbortController();
  automaticAutoLodAbortController = abortController;
  const { signal } = abortController;
  const requestId = (automaticAutoLodRequestId += 1);
  const qualitySettings = readRenderQualitySettings();
  const autoLodStartedAt = performance.now();
  const autoLodSourcePointBudget = readEffectiveAutoLodMaxSourcePointCount(
    qualitySettings.autoLodMaxSourcePointCount,
  );
  const autoLodNodePointBudget = readEffectiveAutoLodMaxNodePointCount(
    qualitySettings.autoLodMaxNodePointCount,
  );
  const autoLodPointCountPerNode = Math.min(
    readMaxPointCountPerNode(),
    autoLodNodePointBudget,
  );
  const autoLodPointDataLengthBudget = readEffectiveAutoLodMaxPointDataLength(
    qualitySettings.autoLodMaxPointDataLength,
  );
  const autoLodNodePointDataLengthBudget =
    readEffectiveAutoLodMaxNodePointDataLength(
      qualitySettings.autoLodMaxNodePointDataLength,
    );
  let loadedPageKeys: readonly string[] = [];
  let didApplyHierarchyExpansion = false;
  let didRenderDetailProgress = false;
  elements.statusText.textContent =
    "Auto LOD loading a quick COPC preview for the current view...";

  try {
    const applyAutoLodProgress = (
      result: CopcPointCloudLayerAutomaticRenderResult,
      isFinal: boolean,
      phase: "preview" | "detail",
    ): void => {
      if (!isCurrentAutomaticAutoLodRequest(layer, requestId, signal)) {
        return;
      }

      if (!didApplyHierarchyExpansion && result.hierarchyExpansion) {
        loadedPageKeys = applyHierarchyExpansion(result.hierarchyExpansion);
        didApplyHierarchyExpansion = true;
      }

      renderNodeSet.clear();
      result.nodes.forEach((node) => renderNodeSet.add(node.key));
      renderRenderSetControls();
      cameraStreamNodeSampleCache.remember(result.pointSamples.nodeResults);
      renderInspection(
        result.inspection,
        undefined,
        undefined,
        result.pointSamples,
        result.cameraSelection,
        result.renderStats,
      );
      elements.statusText.textContent =
        phase === "preview"
          ? `Auto LOD preview rendered ${result.pointSamples.sampledPointCount.toLocaleString()} points from ${result.pointSamples.nodeKeys.length.toLocaleString()} low-cost COPC nodes before detail loading.`
          : isFinal
            ? `Auto LOD rendered ${result.pointSamples.sampledPointCount.toLocaleString()} points from ${result.pointSamples.nodeKeys.length.toLocaleString()} COPC nodes${formatLoadedHierarchyPages(loadedPageKeys)}.`
            : `Auto LOD partial render ${result.pointSamples.sampledPointCount.toLocaleString()} points from ${result.pointSamples.nodeKeys.length.toLocaleString()} of ${result.cameraSelection.nodes.length.toLocaleString()} COPC nodes${formatLoadedHierarchyPages(loadedPageKeys)}.`;
      updateSuggestedNode();
      lastAutoLodRenderedPointBudget = result.pointSamples.sampledPointCount;

      if (isFinal && phase === "detail") {
        updateAutoLodAdaptiveBudget(
          qualitySettings,
          performance.now() - autoLodStartedAt,
          result.renderStats,
        );
      }
    };

    const previewNodeResults = await renderAutoLodPreview({
      layer,
      qualitySettings,
      sourcePointBudget: autoLodSourcePointBudget,
      nodePointBudget: autoLodNodePointBudget,
      pointDataLengthBudget: autoLodPointDataLengthBudget,
      nodePointDataLengthBudget: autoLodNodePointDataLengthBudget,
      requestPriority: createInteractiveRequestPriority(
        requestId,
        INTERACTIVE_PREVIEW_REQUEST_PRIORITY_OFFSET,
      ),
      signal,
      applyProgress: applyAutoLodProgress,
    });

    if (!isCurrentAutomaticAutoLodRequest(layer, requestId, signal)) {
      return;
    }

    const result = await layer.renderAutomaticProgressively({
      camera: viewer.camera,
      viewportWidthPixels: viewer.scene.canvas.clientWidth,
      viewportHeightPixels: viewer.scene.canvas.clientHeight,
      expandHierarchy: true,
      selectionMode: "coverage",
      maxNodes: qualitySettings.autoLodMaxNodes,
      targetNodeScreenPixels: qualitySettings.autoLodTargetNodeScreenPixels,
      targetPointSpacingScreenPixels:
        qualitySettings.autoLodTargetPointSpacingScreenPixels,
      maxHierarchyPages: qualitySettings.autoLodMaxHierarchyPages,
      maxNodePointCount: autoLodNodePointBudget,
      maxPointCountPerNode: autoLodPointCountPerNode,
      maxNodePointDataLength: autoLodNodePointDataLengthBudget,
      maxTotalPointCount: autoLodSourcePointBudget,
      maxTotalPointDataLength: autoLodPointDataLengthBudget,
      maxRenderedPointCount: qualitySettings.autoLodMaxRenderedPointCount,
      backgroundNodeResults: previewNodeResults,
      includePointsInResult: false,
      requestPriority: createInteractiveRequestPriority(
        requestId,
        INTERACTIVE_DETAIL_REQUEST_PRIORITY_OFFSET,
      ),
      showBounds: false,
      signal,
      progressBatchNodeCount: 1,
      progressRenderMode: "incremental",
      onProgress: (progressResult) => {
        const isFinal =
          progressResult.pointSamples.nodeKeys.length >=
          progressResult.cameraSelection.nodes.length;
        if (isFinal) {
          didRenderDetailProgress = true;
        }
        applyAutoLodProgress(progressResult, isFinal, "detail");
      },
    });

    if (
      !result ||
      !isCurrentAutomaticAutoLodRequest(layer, requestId, signal)
    ) {
      return;
    }

    if (!didRenderDetailProgress) {
      applyAutoLodProgress(result, true, "detail");
    }

    queueCameraHierarchyPrefetch(layer, {
      selectedDepth: result.cameraSelection.selectedDepth,
    });
  } catch (error) {
    if (
      isAbortError(error) ||
      !isCurrentAutomaticAutoLodRequest(layer, requestId, signal)
    ) {
      return;
    }

    setInspectionError(error);
  } finally {
    if (automaticAutoLodAbortController === abortController) {
      automaticAutoLodAbortController = undefined;
    }
  }
}

async function renderAutoLodPreview(options: {
  readonly layer: CopcPointCloudLayer;
  readonly qualitySettings: RenderQualitySettings;
  readonly sourcePointBudget: number;
  readonly nodePointBudget: number;
  readonly pointDataLengthBudget: number;
  readonly nodePointDataLengthBudget: number;
  readonly requestPriority: number;
  readonly signal: AbortSignal;
  readonly applyProgress: (
    result: CopcPointCloudLayerAutomaticRenderResult,
    isFinal: boolean,
    phase: "preview" | "detail",
  ) => void;
}): Promise<readonly CopcNodePointSampleResult[]> {
  const maxPreviewNodes = Math.min(
    options.qualitySettings.autoLodMaxNodes,
    AUTO_LOD_PREVIEW_MAX_NODE_COUNT,
  );
  const maxPreviewRenderedPointCount = Math.min(
    options.qualitySettings.autoLodMaxRenderedPointCount,
    AUTO_LOD_PREVIEW_MAX_RENDERED_POINT_COUNT,
    maxPreviewNodes * AUTO_LOD_PREVIEW_POINT_COUNT_PER_NODE,
  );
  let latestPreviewNodeResults: readonly CopcNodePointSampleResult[] = [];

  const result = await options.layer.renderAutomaticProgressively({
    camera: viewer.camera,
    viewportWidthPixels: viewer.scene.canvas.clientWidth,
    viewportHeightPixels: viewer.scene.canvas.clientHeight,
    expandHierarchy: false,
    selectionMode: "coverage",
    maxNodes: maxPreviewNodes,
    targetNodeScreenPixels: Math.max(
      options.qualitySettings.autoLodTargetNodeScreenPixels,
      AUTO_LOD_PREVIEW_TARGET_NODE_SCREEN_PIXELS,
    ),
    targetPointSpacingScreenPixels: Math.max(
      options.qualitySettings.autoLodTargetPointSpacingScreenPixels,
      AUTO_LOD_PREVIEW_TARGET_POINT_SPACING_SCREEN_PIXELS,
    ),
    maxNodePointDataLength: Math.min(
      options.nodePointDataLengthBudget,
      AUTO_LOD_PREVIEW_MAX_POINT_DATA_LENGTH,
    ),
    maxNodePointCount: Math.min(
      options.nodePointBudget,
      AUTO_LOD_PREVIEW_MAX_SOURCE_POINT_COUNT,
    ),
    maxTotalPointCount: Math.min(
      options.sourcePointBudget,
      AUTO_LOD_PREVIEW_MAX_SOURCE_POINT_COUNT,
    ),
    maxTotalPointDataLength: Math.min(
      options.pointDataLengthBudget,
      AUTO_LOD_PREVIEW_MAX_POINT_DATA_LENGTH,
    ),
    maxPointCountPerNode: AUTO_LOD_PREVIEW_POINT_COUNT_PER_NODE,
    maxRenderedPointCount: maxPreviewRenderedPointCount,
    includePointsInResult: false,
    requestPriority: options.requestPriority,
    showBounds: false,
    signal: options.signal,
    progressBatchNodeCount: 1,
    progressRenderMode: "incremental",
    onProgress: (progressResult) => {
      latestPreviewNodeResults = progressResult.pointSamples.nodeResults;
      options.applyProgress(progressResult, false, "preview");
    },
  });

  return result?.pointSamples.nodeResults ?? latestPreviewNodeResults;
}

async function renderAutomaticNodeSetForCameraMove(
  forceRender: boolean,
  hierarchyFollowup = false,
  onFirstAppliedRender?: (
    requestId: number,
    renderDisposition: CameraStreamRenderDisposition,
  ) => void,
): Promise<number | undefined> {
  clearQueuedAutomaticStreamRender();

  if (
    !elements.autoStreamCheckbox.checked ||
    !currentInspection ||
    !currentHierarchy ||
    !currentLayer ||
    !currentCoordinateTransform?.supportsCameraSelection
  ) {
    return;
  }

  manualRenderRequestId += 1;
  const layer = currentLayer;
  cancelCameraStreamPrefetch({ preserveStatus: hierarchyFollowup });
  const streamRequest = automaticStreamRequests.startRequest();
  activeAutomaticStreamCameraEpoch = cameraStreamCameraEpoch;
  const { abortController, previousRequest, requestId, signal } = streamRequest;
  const requestPriorityOffsets = selectCameraStreamRequestPriorityOffsets();
  const streamStartedAt = performance.now();
  let loadedPageKeys: readonly string[] = [];
  let expandHierarchyMilliseconds = 0;
  let applyHierarchyMilliseconds = 0;
  const cameraLodSettings = createCurrentCameraStreamLodSettings();
  const streamPointBudgetLimit = readCameraStreamMaxRenderedPointCount();
  if (
    isCameraStreamZoomRefinement(lastCameraStreamLodSettings, cameraLodSettings)
  ) {
    adaptiveCameraStreamBudgetState = {};
    lastCameraStreamEffectiveBudget = undefined;
  }
  // Timing feedback may lower work while the camera is moving, but a settled
  // current view must converge to the configured quality ceiling. Otherwise a
  // slow superseded request can make the same pose terminate at a shallower
  // depth, leaving final density dependent on request timing history.
  const streamBudget = createEffectiveCameraStreamBudget(
    streamPointBudgetLimit,
    cameraLodSettings,
    {
      applyAdaptiveBudget: automaticCameraMoveInProgress,
    },
  );
  const streamPointBudget = streamBudget.renderedPointCount;
  const streamSourcePointBudget = streamBudget.sourcePointCount;
  const streamNodePointBudget = streamBudget.nodePointCount;
  const streamPointDataLengthBudget = streamBudget.pointDataLength;
  const streamNodePointDataLengthBudget = streamBudget.nodePointDataLength;
  let completeRequestInBackground = false;

  try {
    const selectNodesStartedAt = performance.now();
    const cameraSelection = await layer.selectNodesForCamera({
      camera: viewer.camera,
      viewportWidthPixels: viewer.scene.canvas.clientWidth,
      viewportHeightPixels: viewer.scene.canvas.clientHeight,
      selectionMode: "coverage",
      coverageMode: "complete-depth",
      maxNodes: cameraLodSettings.maxNodes,
      maxDepth: cameraLodSettings.maxDepth,
      maxNodePointCount: streamNodePointBudget,
      maxNodePointDataLength: streamNodePointDataLengthBudget,
      maxTotalPointCount: streamSourcePointBudget,
      maxTotalPointDataLength: streamPointDataLengthBudget,
      targetNodeScreenPixels: cameraLodSettings.targetNodeScreenPixels,
      targetPointSpacingScreenPixels:
        cameraLodSettings.targetPointSpacingScreenPixels,
      signal,
    });
    const selectNodesMilliseconds = performance.now() - selectNodesStartedAt;

    if (!isCurrentAutomaticStreamRequest(layer, requestId, signal)) {
      return;
    }

    if (!cameraSelection || cameraSelection.nodes.length === 0) {
      if (hierarchyFollowup) {
        settleCameraHierarchyFollowupFailure(
          cameraLodSettings.maxDepth,
          "No camera-selected nodes were available for the queued hierarchy refinement.",
        );
      } else {
        settleCameraStreamEmptySelection({
          layer,
          requestId,
          cameraLodSettings,
          effectiveBudget: streamBudget,
          selectNodesMilliseconds,
          streamStartedAt,
        });
      }
      return;
    }

    const refinedThroughDepth =
      lastCameraHierarchyRefinement?.refinedThroughDepth;
    if (
      refinedThroughDepth !== undefined &&
      cameraSelection.selectedDepth > refinedThroughDepth
    ) {
      lastCameraHierarchyRefinement = {
        pendingRelevantHierarchyPageCount: Math.max(
          1,
          readPendingCameraHierarchyPageCount(),
        ),
        pendingRelevantHierarchyPageSignature: `depth-advanced:${refinedThroughDepth}->${cameraSelection.selectedDepth}`,
        isHierarchyCompleteForView: false,
        refinedThroughDepth,
      };
    }
    const pendingHierarchyPageCountForRender =
      readPendingCameraHierarchyPageCount();

    const streamPlan = createCameraStreamRenderPlan({
      cameraSelection,
      configuredMaxPointCountPerNode: readMaxPointCountPerNode(),
      effectiveNodePointDataLengthBudget: streamNodePointDataLengthBudget,
      effectivePointDataLengthBudget: streamPointDataLengthBudget,
      effectiveSourcePointBudget: streamSourcePointBudget,
      hierarchy: layer.hierarchy ?? currentHierarchy,
      lodSettings: cameraLodSettings,
      maxFinalNodeCount: CAMERA_STREAM_RUNTIME_SETTINGS.detailMaxFinalNodeCount,
      minFinalNodeCount: cameraLodSettings.detailMinFinalNodeCount,
      minPointCountPerFinalNode:
        cameraLodSettings.detailTargetPointCountPerNode,
      maxPointCountPerFinalNode: cameraLodSettings.detailMaxPointCountPerNode,
      previewMinFinalNodeCount:
        CAMERA_STREAM_RUNTIME_SETTINGS.previewMinFinalNodeCount,
      previewMaxNodeCount: CAMERA_STREAM_RUNTIME_SETTINGS.previewMaxNodeCount,
      previewMaxPointDataLength:
        CAMERA_STREAM_RUNTIME_SETTINGS.previewMaxPointDataLength,
      renderedPointBudget: streamPointBudget,
    });
    const {
      coverageNodeKeys,
      finalNodeKeys,
      finalSelectedNodeCount,
      maxPointCountPerNode: streamMaxPointCountPerNode,
      previewNodeKeys,
      renderSignature,
      selectedNodeKeys,
    } = streamPlan;
    const selectedPointCountByNodeKey = new Map(
      cameraSelection.nodes.map((node) => [node.key, node.pointCount]),
    );
    const finalNodeWeights = finalNodeKeys.map((nodeKey) => ({
      nodeKey,
      weight: selectedPointCountByNodeKey.get(nodeKey) ?? 1,
    }));
    lastCameraStreamSelectedNodeKeys = selectedNodeKeys;
    lastCameraStreamRenderSignature = renderSignature;
    const previewPointCountPerNode = createCameraStreamPreviewPointCountPerNode(
      {
        previewNodeCount: previewNodeKeys.length,
        runtimeSettings: CAMERA_STREAM_RUNTIME_SETTINGS,
      },
    );
    automaticStreamRequests.setActiveNodeKeys(finalNodeKeys);
    // Superseded progressive renders can still mutate the shared Cesium
    // renderer before their publication callback is rejected. Abort every
    // older render-capable request before deciding whether this frame can be
    // retained; predictive prefetch owns load-only overlap instead.
    automaticStreamRequests.abortSupersededRenderRequests(previousRequest);

    if (
      !forceRender &&
      automaticStreamRequests.hasRenderSignature(renderSignature)
    ) {
      queueCameraHierarchyPrefetch(layer, {
        prefetchGeometryBatches: true,
        selectedDepth: cameraSelection.selectedDepth,
      });
      return;
    }

    let initialNodeResults = cameraStreamNodeSampleCache.read(
      finalNodeKeys,
      streamMaxPointCountPerNode,
    );
    let backgroundNodeResults = mergeCameraStreamNodeSampleResults(
      cameraStreamNodeSampleCache.read(
        coverageNodeKeys,
        streamMaxPointCountPerNode,
      ),
      cameraStreamNodeSampleCache.read(
        [...renderNodeSet],
        streamMaxPointCountPerNode,
      ),
    );
    const freshCachedFinalNodeCount = initialNodeResults.filter((nodeResult) =>
      hasFreshCameraStreamNodeResults(
        [nodeResult.nodeKey],
        [nodeResult],
        streamMaxPointCountPerNode,
      ),
    ).length;
    lastCameraStreamNodeReuse = {
      finalNodeCount: finalNodeKeys.length,
      cachedFinalNodeCount: initialNodeResults.length,
      freshCachedFinalNodeCount,
      cachedCoverageNodeCount: backgroundNodeResults.length,
    };
    const finalNodeKeySet = new Set(finalNodeKeys);
    let renderNodesMilliseconds = 0;
    let renderedInteractiveProgress = false;
    let foregroundResolved = false;
    let firstAppliedRenderReported = false;
    let predictivePrefetchQueued = false;
    let resolveForegroundRender: (
      requestId: number | undefined,
    ) => void = () => {};
    const foregroundRenderReady = new Promise<number | undefined>((resolve) => {
      resolveForegroundRender = resolve;
    });
    const queuePredictiveCameraPrefetch = (): void => {
      if (!renderedInteractiveProgress) {
        return;
      }

      if (predictivePrefetchQueued) {
        return;
      }

      predictivePrefetchQueued = true;
      queueCameraHierarchyPrefetch(layer, {
        selectedDepth: cameraSelection.selectedDepth,
      });
    };
    const resolveForegroundRenderOnce = (): void => {
      if (foregroundResolved) {
        return;
      }

      foregroundResolved = true;
      resolveForegroundRender(requestId);
    };
    const reportFirstAppliedRenderOnce = (
      renderDisposition: CameraStreamRenderDisposition = "new-render",
    ): void => {
      if (
        firstAppliedRenderReported ||
        !isCurrentAutomaticStreamRequest(layer, requestId, signal)
      ) {
        return;
      }

      firstAppliedRenderReported = true;
      onFirstAppliedRender?.(requestId, renderDisposition);
    };

    elements.statusText.textContent =
      initialNodeResults.length + backgroundNodeResults.length > 0
        ? `Streaming ${finalNodeKeys.length.toLocaleString()} COPC nodes for ${cameraLodSettings.label} camera position, reusing ${(initialNodeResults.length + backgroundNodeResults.length).toLocaleString()} loaded nodes...`
        : `Streaming a quick coverage preview before ${finalNodeKeys.length.toLocaleString()} detail nodes for ${cameraLodSettings.label} camera position...`;

    const renderNodesStartedAt = performance.now();
    const committedRender = lastCameraStreamCommittedRender;
    const retainedVisualQuality = committedRender
      ? createCameraStreamVisualQualityState({
          frontierNodeKeys: selectedNodeKeys,
          requiredNodeKeys: finalNodeKeys,
          renderedNodeKeys: committedRender.result.pointSamples.nodeKeys,
          pendingRelevantHierarchyPageCount:
            pendingHierarchyPageCountForRender,
        })
      : undefined;
    const canRetainExactCommittedRender =
      committedRender?.layer === layer &&
      committedRender.rendererRevision === layer.getRendererRevision() &&
      committedRender.visualQuality.isFrontierAntichain &&
      committedRender.visualQuality.frontierDepthSpan === 0 &&
      committedRender.visualQuality.isAdditiveClosureComplete &&
      committedRender.visualQuality.unexpectedRenderedNodeCount === 0 &&
      retainedVisualQuality?.isFrontierAntichain === true &&
      retainedVisualQuality.frontierDepthSpan === 0 &&
      retainedVisualQuality.isAdditiveClosureComplete &&
      retainedVisualQuality.unexpectedRenderedNodeCount === 0 &&
      canReuseCameraStreamCommittedRender({
        requiredNodeKeys: finalNodeKeys,
        renderedNodeSamples:
          committedRender.result.pointSamples.nodeResults,
        maxPointCountPerNode: streamMaxPointCountPerNode,
        previousMaxPointCountPerNode:
          committedRender.maxPointCountPerNode,
        renderedPointBudget: streamPointBudget,
        previousRenderedPointBudget: committedRender.renderedPointBudget,
      });

    if (
      canRetainExactCommittedRender &&
      committedRender &&
      retainedVisualQuality
    ) {
      const retainedResult = committedRender.result;
      const detailProgress = createCameraStreamDetailProgressState({
        finalNodeKeys,
        finalNodeWeights,
        renderedNodeKeys: retainedResult.pointSamples.nodeKeys,
        renderedPointBudget: streamPointBudget,
        renderedPointCount: retainedResult.pointSamples.sampledPointCount,
      });
      renderNodesMilliseconds = performance.now() - renderNodesStartedAt;
      const diagnostics = {
        expandHierarchyMilliseconds,
        applyHierarchyMilliseconds,
        selectNodesMilliseconds,
        renderNodesMilliseconds,
        totalMilliseconds: performance.now() - streamStartedAt,
        loadedHierarchyPageCount: loadedPageKeys.length,
        selectedNodeCount: retainedResult.pointSamples.nodeKeys.length,
        selectedDepth: cameraSelection.selectedDepth,
        ...summarizeCameraStreamSourceNodes(retainedResult.nodes),
      };

      cameraStreamNodeSampleCache.remember(
        retainedResult.pointSamples.nodeResults,
      );
      if (retainedVisualQuality.isTerminalReady) {
        automaticStreamRequests.rememberRenderSignature(renderSignature);
      }
      applyCameraStreamRenderResult({
        layer,
        requestId,
        result: retainedResult,
        cameraSelection,
        cameraLodSettings,
        diagnostics,
        detailProgress,
        visualQuality: retainedVisualQuality,
        effectiveBudget: streamBudget,
        maxPointCountPerNode: streamMaxPointCountPerNode,
        renderedPointBudget: retainedResult.pointSamples.sampledPointCount,
        renderDisposition: "retained-exact-render",
        statusText: retainedVisualQuality.isTerminalReady
          ? `Camera stream retained the exact ${retainedResult.pointSamples.nodeKeys.length.toLocaleString()}-node terminal render with ${retainedResult.pointSamples.sampledPointCount.toLocaleString()} points for the unchanged current-view plan (${cameraLodSettings.label}); no geometry resubmission was needed.`
          : `Camera stream retained the complete current ${retainedResult.pointSamples.nodeKeys.length.toLocaleString()}-node render with ${retainedResult.pointSamples.sampledPointCount.toLocaleString()} points while ${retainedVisualQuality.pendingRelevantHierarchyPageCount.toLocaleString()} visible hierarchy ${retainedVisualQuality.pendingRelevantHierarchyPageCount === 1 ? "page remains" : "pages remain"} under refinement (${cameraLodSettings.label}); no geometry resubmission was needed.`,
      });
      reportFirstAppliedRenderOnce("retained-exact-render");
      resolveForegroundRenderOnce();
      if (!automaticCameraMoveInProgress) {
        queueCameraHierarchyPrefetch(layer, {
          delayMilliseconds: Math.max(
            CAMERA_STREAM_RUNTIME_SETTINGS.backgroundPrefetchDelayMilliseconds,
            RETAINED_RENDER_PREFETCH_DELAY_MILLISECONDS,
          ),
          prefetchGeometryBatches: true,
          selectedDepth: cameraSelection.selectedDepth,
        });
      }
      return foregroundRenderReady;
    }

    if (
      previewNodeKeys.length > 0 &&
      !hasFreshCameraStreamNodeResults(
        previewNodeKeys,
        mergeCameraStreamNodeSampleResults(
          initialNodeResults,
          backgroundNodeResults,
        ),
        previewPointCountPerNode,
      )
    ) {
      const previewResult = await renderCameraStreamPreview({
        layer,
        requestId,
        signal,
        previewNodeKeys,
        cameraSelection,
        cameraLodSettings,
        requestPriority: createInteractiveRequestPriority(
          requestId,
          requestPriorityOffsets.preview,
        ),
        streamStartedAt,
        loadedPageKeys,
        expandHierarchyMilliseconds,
        applyHierarchyMilliseconds,
        selectNodesMilliseconds,
        effectiveBudget: streamBudget,
        maxPointCountPerNode: previewPointCountPerNode,
        frontierNodeKeys: selectedNodeKeys,
        requiredNodeKeys: finalNodeKeys,
        pendingRelevantHierarchyPageCount: pendingHierarchyPageCountForRender,
        onAppliedProgress: reportFirstAppliedRenderOnce,
      });

      if (!isCurrentAutomaticStreamRequest(layer, requestId, signal)) {
        return;
      }

      if (previewResult) {
        initialNodeResults = mergeCameraStreamNodeSampleResults(
          initialNodeResults,
          previewResult.nodeResults.filter((nodeResult) =>
            finalNodeKeySet.has(nodeResult.nodeKey),
          ),
        );
        backgroundNodeResults = mergeCameraStreamNodeSampleResults(
          backgroundNodeResults,
          previewResult.nodeResults.filter(
            (nodeResult) => !finalNodeKeySet.has(nodeResult.nodeKey),
          ),
        );
        resolveForegroundRenderOnce();
        queuePredictiveCameraPrefetch();
      }
    }
    const detailWarmupPolicy = selectCameraStreamDetailWarmupPolicy({
      finalNodeKeys,
      initialNodeResults,
      detailMaxPointCountPerNode: streamMaxPointCountPerNode,
      warmupPointCountPerNode:
        CAMERA_STREAM_RUNTIME_SETTINGS.detailWarmupPointCountPerNode,
      decodeGranularity: "node",
      minSameNodeInitialCoverageRatio:
        CAMERA_STREAM_RUNTIME_SETTINGS.detailWarmupMinInitialCoverageRatio,
      maxWarmupNodeCount:
        CAMERA_STREAM_RUNTIME_SETTINGS.detailWarmupMaxNodeCount,
    });

    const canRetainCachedCoverage =
      hierarchyFollowup &&
      backgroundNodeResults.length > 0 &&
      sameNodeKeys(
        backgroundNodeResults.map((nodeResult) => nodeResult.nodeKey),
        [...renderNodeSet],
      );

    if (backgroundNodeResults.length > 0 && !canRetainCachedCoverage) {
      const coverageResult = await layer.renderNodeSampleResults(
        backgroundNodeResults,
        {
          includePointsInResult: false,
          maxPointCountPerNode: streamMaxPointCountPerNode,
          maxRenderedPointCount: streamPointBudget,
          showBounds: false,
          signal,
        },
      );
      renderNodesMilliseconds = performance.now() - renderNodesStartedAt;

      if (!isCurrentAutomaticStreamRequest(layer, requestId, signal)) {
        return;
      }

      const coverageVisualQuality = createCameraStreamVisualQualityState({
        frontierNodeKeys: selectedNodeKeys,
        requiredNodeKeys: finalNodeKeys,
        renderedNodeKeys: coverageResult.pointSamples.nodeKeys,
        pendingRelevantHierarchyPageCount: pendingHierarchyPageCountForRender,
      });
      applyCameraStreamRenderResult({
        layer,
        requestId,
        result: coverageResult,
        cameraSelection,
        cameraLodSettings,
        diagnostics: {
          expandHierarchyMilliseconds,
          applyHierarchyMilliseconds,
          selectNodesMilliseconds,
          renderNodesMilliseconds,
          totalMilliseconds: performance.now() - streamStartedAt,
          loadedHierarchyPageCount: loadedPageKeys.length,
          selectedNodeCount: coverageResult.pointSamples.nodeKeys.length,
          selectedDepth: cameraSelection.selectedDepth,
          ...summarizeCameraStreamSourceNodes(coverageResult.nodes),
        },
        effectiveBudget: streamBudget,
        maxPointCountPerNode: streamMaxPointCountPerNode,
        renderedPointBudget: coverageResult.pointSamples.sampledPointCount,
        visualQuality: coverageVisualQuality,
        statusText: `Camera stream reused ${coverageResult.pointSamples.nodeKeys.length.toLocaleString()} cached coverage nodes while loading ${finalNodeKeys.length.toLocaleString()} detail nodes for the current view (${cameraLodSettings.label})${formatLoadedHierarchyPages(loadedPageKeys)}.`,
      });
      reportFirstAppliedRenderOnce();
      resolveForegroundRenderOnce();
      queuePredictiveCameraPrefetch();
    }

    let shouldApplyDetailWarmupProgress = true;

    if (detailWarmupPolicy.shouldWarmup) {
      void prefetchCameraStreamDetailWarmup({
        layer,
        requestId,
        signal,
        finalNodeKeys: detailWarmupPolicy.warmupNodeKeys,
        maxPointCountPerNode: detailWarmupPolicy.maxPointCountPerNode,
        requestPriority: createInteractiveRequestPriority(
          requestId,
          requestPriorityOffsets.detailWarmup,
        ),
        shouldApplyProgress: () => shouldApplyDetailWarmupProgress,
      }).catch(() => undefined);
    }

    const canRetainCurrentGeometryUntilNewDetail =
      hierarchyFollowup &&
      initialNodeResults.length > 0 &&
      sameNodeKeys(
        initialNodeResults.map((nodeResult) => nodeResult.nodeKey),
        [...renderNodeSet],
      );

    const detailRenderPromise = runCameraStreamTerminalRender({
      layer,
      frontierNodeKeys: selectedNodeKeys,
      requiredNodeKeys: finalNodeKeys,
      finalNodeWeights,
      initialNodeResults,
      backgroundNodeResults,
      requestPriority: createInteractiveRequestPriority(
        requestId,
        requestPriorityOffsets.detail,
      ),
      maxPointCountPerNode: streamMaxPointCountPerNode,
      renderedPointBudget: streamPointBudget,
      maxActiveNodeRequests: CAMERA_STREAM_DETAIL_MAX_ACTIVE_NODE_REQUESTS,
      rendererKind: readPointRendererKind(),
      lodSettings: cameraLodSettings,
      runtimeSettings: CAMERA_STREAM_RUNTIME_SETTINGS,
      skipInitialProgressRender: canRetainCurrentGeometryUntilNewDetail,
      signal,
      shouldPublish: () =>
        isCurrentAutomaticStreamRequest(layer, requestId, signal),
      shouldRenderProgress: (candidate) => {
        const candidateProgress = createCameraStreamDetailProgressState({
          finalNodeKeys,
          finalNodeWeights,
          renderedNodeKeys: candidate.nodeKeys,
          renderedPointBudget: streamPointBudget,
          renderedPointCount: candidate.sampledPointCount,
        });
        const committedRender = lastCameraStreamCommittedRender;
        const currentRendererFrameIsProven =
          committedRender?.layer === layer &&
          committedRender.rendererRevision === layer.getRendererRevision();
        const retainsCurrentRendererFrame =
          currentRendererFrameIsProven &&
          (lastCameraStreamAppliedRequestId === requestId ||
            canRetainCurrentGeometryUntilNewDetail);

        return shouldRenderCameraStreamProgress({
          candidateRenderedPointCount: candidate.sampledPointCount,
          currentRendererPointCount: currentRendererFrameIsProven
            ? committedRender.result.pointSamples.sampledPointCount
            : 0,
          retainsCurrentRendererFrame,
          isComplete: candidateProgress.isComplete,
        });
      },
      onUpdate: ({ stage, result, detailProgress }) => {
        shouldApplyDetailWarmupProgress = false;
        renderNodesMilliseconds = performance.now() - renderNodesStartedAt;

        cameraStreamNodeSampleCache.remember(result.pointSamples.nodeResults);

        const { isComplete, reachedRenderBudget, renderedFinalNodeCount } =
          detailProgress;
        const visualQuality = createCameraStreamVisualQualityState({
          frontierNodeKeys: selectedNodeKeys,
          requiredNodeKeys: finalNodeKeys,
          renderedNodeKeys: result.pointSamples.nodeKeys,
          pendingRelevantHierarchyPageCount: pendingHierarchyPageCountForRender,
        });
        const isTerminalReady =
          stage === "terminal" && visualQuality.isTerminalReady;
        const sourceSummary = summarizeCameraStreamSourceNodes(result.nodes);
        const diagnostics = {
          expandHierarchyMilliseconds,
          applyHierarchyMilliseconds,
          selectNodesMilliseconds,
          renderNodesMilliseconds,
          totalMilliseconds: performance.now() - streamStartedAt,
          loadedHierarchyPageCount: loadedPageKeys.length,
          selectedNodeCount: result.pointSamples.nodeKeys.length,
          selectedDepth: cameraSelection.selectedDepth,
          ...sourceSummary,
        };
        if (isComplete && !renderedInteractiveProgress) {
          updateCameraStreamAdaptiveBudget(
            streamPointBudgetLimit,
            cameraLodSettings,
            diagnostics.totalMilliseconds,
            result.renderStats,
          );
          renderedInteractiveProgress = true;
        }

        if (isTerminalReady) {
          automaticStreamRequests.rememberRenderSignature(renderSignature);
        }

        applyCameraStreamRenderResult({
          layer,
          requestId,
          result,
          cameraSelection,
          cameraLodSettings,
          diagnostics,
          detailProgress,
          visualQuality,
          effectiveBudget: streamBudget,
          maxPointCountPerNode: streamMaxPointCountPerNode,
          renderedPointBudget: result.pointSamples.sampledPointCount,
          statusText: isTerminalReady
            ? `Camera stream terminal rendered ${result.pointSamples.sampledPointCount.toLocaleString()} points from the complete ${result.pointSamples.nodeKeys.length.toLocaleString()}-node additive set (${finalSelectedNodeCount.toLocaleString()} frontier nodes, ${cameraLodSettings.label})${formatLoadedHierarchyPages(loadedPageKeys)}.`
            : stage === "terminal" &&
                visualQuality.pendingRelevantHierarchyPageCount > 0
              ? `Camera stream hierarchy-refining with ${result.pointSamples.sampledPointCount.toLocaleString()} points from the complete current ${result.pointSamples.nodeKeys.length.toLocaleString()}-node additive set (${finalSelectedNodeCount.toLocaleString()} frontier nodes, ${visualQuality.pendingRelevantHierarchyPageCount.toLocaleString()} visible hierarchy ${visualQuality.pendingRelevantHierarchyPageCount === 1 ? "page" : "pages"} still loading, ${cameraLodSettings.label})${formatLoadedHierarchyPages(loadedPageKeys)}.`
              : isComplete
                ? `Camera stream interactive-ready with ${result.pointSamples.sampledPointCount.toLocaleString()} points from ${result.pointSamples.nodeKeys.length.toLocaleString()} COPC nodes (${cameraLodSettings.label}, ${visualQuality.missingRequiredNodeCount.toLocaleString()} additive nodes still refining${reachedRenderBudget ? ", render budget filled" : `, ${formatFinalNodeMix(finalSelectedNodeCount, finalNodeKeys.length)}`})${formatLoadedHierarchyPages(loadedPageKeys)}.`
                : `Camera stream partial render ${result.pointSamples.sampledPointCount.toLocaleString()} points from ${renderedFinalNodeCount.toLocaleString()} of ${finalNodeKeys.length.toLocaleString()} detail nodes over coverage for the current view (${cameraLodSettings.label}, loading more detail)${formatLoadedHierarchyPages(loadedPageKeys)}.`,
        });

        reportFirstAppliedRenderOnce();
        resolveForegroundRenderOnce();
        queuePredictiveCameraPrefetch();
      },
    });
    completeRequestInBackground = true;
    void detailRenderPromise
      .then(() => {
        shouldApplyDetailWarmupProgress = false;

        if (!isCurrentAutomaticStreamRequest(layer, requestId, signal)) {
          resolveForegroundRenderOnce();
          return;
        }

        queueCameraHierarchyPrefetch(layer, {
          prefetchGeometryBatches: true,
          selectedDepth: cameraSelection.selectedDepth,
        });
        resolveForegroundRenderOnce();
      })
      .catch((error: unknown) => {
        shouldApplyDetailWarmupProgress = false;

        if (
          isAbortError(error) ||
          !isCurrentAutomaticStreamRequest(layer, requestId, signal)
        ) {
          resolveForegroundRenderOnce();
          return;
        }

        if (layer === currentLayer) {
          if (hierarchyFollowup) {
            settleCameraHierarchyFollowupFailure(
              cameraLodSettings.maxDepth,
              readUnknownErrorMessage(error) ??
                "The queued hierarchy refinement render failed.",
            );
          } else {
            setInspectionError(error);
          }
        }

        resolveForegroundRenderOnce();
      })
      .finally(() => {
        automaticStreamRequests.completeRequest(abortController);
      });

    return foregroundRenderReady;
  } catch (error) {
    if (
      isAbortError(error) ||
      !isCurrentAutomaticStreamRequest(layer, requestId, signal)
    ) {
      return requestId;
    }

    if (layer !== currentLayer) {
      return requestId;
    }

    if (hierarchyFollowup) {
      settleCameraHierarchyFollowupFailure(
        cameraLodSettings.maxDepth,
        readUnknownErrorMessage(error) ??
          "The queued hierarchy refinement render failed.",
      );
    } else {
      setInspectionError(error);
    }
    return requestId;
  } finally {
    if (!completeRequestInBackground) {
      automaticStreamRequests.completeRequest(abortController);
    }
  }
}

function settleCameraStreamEmptySelection(options: {
  readonly layer: CopcPointCloudLayer;
  readonly requestId: number;
  readonly cameraLodSettings: CameraStreamLodSettings;
  readonly effectiveBudget: CameraStreamEffectiveBudget;
  readonly selectNodesMilliseconds: number;
  readonly streamStartedAt: number;
}): void {
  invalidateCameraStreamCommittedRender();
  options.layer.clear();
  automaticStreamRequests.setActiveNodeKeys([]);
  automaticStreamRequests.clearRenderSignature();
  lastCameraStreamAppliedRequestId = options.requestId;
  lastCameraStreamDiagnostics = {
    expandHierarchyMilliseconds: 0,
    applyHierarchyMilliseconds: 0,
    selectNodesMilliseconds: options.selectNodesMilliseconds,
    renderNodesMilliseconds: 0,
    totalMilliseconds: performance.now() - options.streamStartedAt,
    loadedHierarchyPageCount: 0,
    selectedNodeCount: 0,
    selectedDepth: 0,
    selectedSourcePointCount: 0,
    selectedPointDataLength: 0,
  };
  lastCameraStreamDetailProgress = undefined;
  lastCameraStreamVisualQuality = createCameraStreamVisualQualityState({
    frontierNodeKeys: [],
    requiredNodeKeys: [],
    renderedNodeKeys: [],
    pendingRelevantHierarchyPageCount: readPendingCameraHierarchyPageCount(),
  });
  lastCameraStreamRenderedPointBudget = 0;
  lastCameraStreamEffectiveBudget = options.effectiveBudget;
  lastCameraStreamSelectedNodeKeys = [];
  lastCameraStreamRenderSignature = undefined;
  lastCameraStreamNodeReuse = undefined;
  lastCameraStreamLodSettings = options.cameraLodSettings;
  lastCameraStreamPrefetchStatus = {
    state: "skipped",
    plannedNodeCount: 0,
    requestedNodeCount: 0,
    prefetchedNodeCount: 0,
    skippedNodeCount: 0,
    selectedDepth: 0,
    completed: true,
    reason: "No COPC nodes are visible for the current camera.",
  };
  refreshCameraStreamPrefetchMetadata();
  renderNodeSet.clear();
  renderRenderSetControls();

  if (currentInspection) {
    renderInspection(currentInspection);
  }
  elements.statusText.textContent = `Camera stream settled with no COPC nodes visible for the current view (${options.cameraLodSettings.label}).`;
  updateSuggestedNode();
}

function settleCameraHierarchyFollowupFailure(
  selectedDepth: number,
  reason: string,
): void {
  lastCameraStreamPrefetchStatus = {
    state: "failed",
    plannedNodeCount: 0,
    requestedNodeCount: 0,
    prefetchedNodeCount: 0,
    skippedNodeCount: 0,
    selectedDepth,
    completed: true,
    reason,
  };
  refreshCameraStreamPrefetchMetadata();
  elements.statusText.textContent = `Camera stream hierarchy refinement failed; keeping the last rendered view: ${reason}`;
}

function queueAutomaticStreamRenderForCameraMove(
  forceRender: boolean,
  hierarchyFollowup = false,
): void {
  cancelCameraStreamPrefetch({ preserveStatus: hierarchyFollowup });
  automaticStreamRequests.queueRender(
    CAMERA_STREAM_RUNTIME_SETTINGS.moveDebounceMilliseconds,
    () => {
      void renderAutomaticNodeSetForCameraMove(forceRender, hierarchyFollowup);
    },
  );
}

function beginAutomaticCameraMove(): void {
  automaticCameraMoveInProgress = true;
  advanceCameraStreamCameraEpoch({
    preserveKnownHierarchy: benchmarkHierarchyHoldLayer === currentLayer,
  });
  cancelAutomaticAutoLodRender();
  cancelCameraStreamPrefetch();
  clearQueuedAutomaticStreamRender();
}

function clearQueuedAutomaticStreamRender(): void {
  automaticStreamRequests.clearQueuedRender();
}

function createInteractiveRequestPriority(
  requestId: number,
  offset: number,
): number {
  return createCameraStreamRequestPriority({ requestId, offset });
}

function cancelAutomaticCameraStreamRender(): void {
  automaticStreamRequests.cancelRequest();
}

function beginManualCameraRender(): {
  readonly requestId: number;
  readonly signal: AbortSignal;
} {
  invalidateCameraStreamCommittedRender();
  cancelAutomaticAutoLodRender();
  cancelAutomaticCameraStreamRender();
  cancelCameraStreamPrefetch();
  clearQueuedAutomaticStreamRender();
  automaticStreamRequests.clearRenderSignature();
  advanceCameraStreamCameraEpoch();
  const abortController = new AbortController();
  manualRenderAbortController = abortController;
  return {
    requestId: manualRenderRequestId,
    signal: abortController.signal,
  };
}

function isCurrentManualRender(
  layer: CopcPointCloudLayer,
  request: { readonly requestId: number; readonly signal: AbortSignal },
): boolean {
  return (
    !request.signal.aborted &&
    layer === currentLayer &&
    request.requestId === manualRenderRequestId
  );
}

function isCurrentAutomaticStreamRequest(
  layer: CopcPointCloudLayer,
  requestId: number,
  signal: AbortSignal,
): boolean {
  return (
    layer === currentLayer &&
    activeAutomaticStreamCameraEpoch === cameraStreamCameraEpoch &&
    automaticStreamRequests.isCurrentRequest(requestId, signal) &&
    elements.autoStreamCheckbox.checked
  );
}

function cancelAutomaticAutoLodRender(): void {
  automaticAutoLodAbortController?.abort();
  automaticAutoLodAbortController = undefined;
  automaticAutoLodRequestId += 1;
}

function isCurrentAutomaticAutoLodRequest(
  layer: CopcPointCloudLayer,
  requestId: number,
  signal: AbortSignal,
): boolean {
  return (
    !signal.aborted &&
    layer === currentLayer &&
    requestId === automaticAutoLodRequestId
  );
}

async function renderCameraStreamPreview(options: {
  readonly layer: CopcPointCloudLayer;
  readonly requestId: number;
  readonly signal: AbortSignal;
  readonly previewNodeKeys: readonly string[];
  readonly cameraSelection: CopcHierarchyNodeCameraSelection;
  readonly cameraLodSettings: CameraStreamLodSettings;
  readonly requestPriority: number;
  readonly streamStartedAt: number;
  readonly loadedPageKeys: readonly string[];
  readonly expandHierarchyMilliseconds: number;
  readonly applyHierarchyMilliseconds: number;
  readonly selectNodesMilliseconds: number;
  readonly effectiveBudget: CameraStreamEffectiveBudget;
  readonly maxPointCountPerNode: number;
  readonly frontierNodeKeys: readonly string[];
  readonly requiredNodeKeys: readonly string[];
  readonly pendingRelevantHierarchyPageCount: number;
  readonly onAppliedProgress?: () => void;
}): Promise<
  | {
      readonly nodeResults: readonly CopcNodePointSampleResult[];
    }
  | undefined
> {
  if (options.previewNodeKeys.length === 0) {
    return undefined;
  }

  const previewStartedAt = performance.now();
  let latestPreviewNodeResults: readonly CopcNodePointSampleResult[] = [];
  const maxRenderedPointCount = Math.min(
    CAMERA_STREAM_RUNTIME_SETTINGS.previewMaxRenderedPointCount,
    options.previewNodeKeys.length * options.maxPointCountPerNode,
  );
  const previewCompletionNodeCount = Math.min(
    options.previewNodeKeys.length,
    CAMERA_STREAM_RUNTIME_SETTINGS.previewCompletionNodeCount,
  );

  await options.layer.renderNodesProgressively(options.previewNodeKeys, {
    includePointsInResult: false,
    maxPointCountPerNode: options.maxPointCountPerNode,
    maxRenderedPointCount,
    requestPriority: options.requestPriority,
    progressBatchNodeCount: 1,
    progressRenderMode: "incremental",
    showBounds: false,
    signal: options.signal,
    shouldStopAfterProgress: (result) =>
      result.pointSamples.sampledPointCount >=
        Math.min(
          CAMERA_STREAM_RUNTIME_SETTINGS.previewCompletionPointCount,
          maxRenderedPointCount,
        ) || result.pointSamples.nodeKeys.length >= previewCompletionNodeCount,
    onProgress: (result) => {
      if (
        !isCurrentAutomaticStreamRequest(
          options.layer,
          options.requestId,
          options.signal,
        )
      ) {
        return;
      }

      latestPreviewNodeResults = result.pointSamples.nodeResults;
      cameraStreamNodeSampleCache.remember(result.pointSamples.nodeResults);
      const visualQuality = createCameraStreamVisualQualityState({
        frontierNodeKeys: options.frontierNodeKeys,
        requiredNodeKeys: options.requiredNodeKeys,
        renderedNodeKeys: result.pointSamples.nodeKeys,
        pendingRelevantHierarchyPageCount:
          options.pendingRelevantHierarchyPageCount,
      });
      applyCameraStreamRenderResult({
        layer: options.layer,
        requestId: options.requestId,
        result,
        cameraSelection: options.cameraSelection,
        cameraLodSettings: options.cameraLodSettings,
        diagnostics: {
          expandHierarchyMilliseconds: options.expandHierarchyMilliseconds,
          applyHierarchyMilliseconds: options.applyHierarchyMilliseconds,
          selectNodesMilliseconds: options.selectNodesMilliseconds,
          renderNodesMilliseconds: performance.now() - previewStartedAt,
          totalMilliseconds: performance.now() - options.streamStartedAt,
          loadedHierarchyPageCount: options.loadedPageKeys.length,
          selectedNodeCount: result.pointSamples.nodeKeys.length,
          selectedDepth: maxNodeKeyDepth(result.pointSamples.nodeKeys),
          ...summarizeCameraStreamSourceNodes(result.nodes),
        },
        effectiveBudget: options.effectiveBudget,
        maxPointCountPerNode: options.maxPointCountPerNode,
        renderedPointBudget: result.pointSamples.sampledPointCount,
        visualQuality,
        statusText: `Camera stream previewed ${result.pointSamples.sampledPointCount.toLocaleString()} points from ${result.pointSamples.nodeKeys.length.toLocaleString()} coverage nodes while loading detail for the current view (${options.cameraLodSettings.label})${formatLoadedHierarchyPages(options.loadedPageKeys)}.`,
      });
      options.onAppliedProgress?.();
    },
  });

  return latestPreviewNodeResults.length > 0
    ? { nodeResults: latestPreviewNodeResults }
    : undefined;
}

async function prefetchCameraStreamDetailWarmup(options: {
  readonly layer: CopcPointCloudLayer;
  readonly requestId: number;
  readonly signal: AbortSignal;
  readonly finalNodeKeys: readonly string[];
  readonly maxPointCountPerNode: number;
  readonly requestPriority: number;
  readonly shouldApplyProgress: () => boolean;
}): Promise<void> {
  if (options.finalNodeKeys.length === 0) {
    return;
  }

  await options.layer.prefetchNodePointGeometryBatches(options.finalNodeKeys, {
    maxConcurrentRequests:
      CAMERA_STREAM_RUNTIME_SETTINGS.backgroundPrefetchMaxConcurrentRequests,
    maxPointCountPerNode: options.maxPointCountPerNode,
    requestPriority: options.requestPriority,
    signal: options.signal,
    onProgress: () => {
      if (
        !isCurrentAutomaticStreamRequest(
          options.layer,
          options.requestId,
          options.signal,
        )
      ) {
        return;
      }

      if (!options.shouldApplyProgress()) {
        return;
      }
    },
  });
}

function applyCameraStreamRenderResult(options: {
  readonly layer: CopcPointCloudLayer;
  readonly requestId: number;
  readonly result: CopcPointCloudLayerNodesRenderResult;
  readonly cameraSelection: CopcHierarchyNodeCameraSelection;
  readonly cameraLodSettings: CameraStreamLodSettings;
  readonly diagnostics: CameraStreamDiagnostics;
  readonly detailProgress?: CameraStreamDetailProgressState;
  readonly visualQuality?: CameraStreamVisualQualityState;
  readonly effectiveBudget: CameraStreamEffectiveBudget;
  readonly maxPointCountPerNode: number;
  readonly renderedPointBudget: number;
  readonly renderDisposition?: CameraStreamRenderDisposition;
  readonly statusText: string;
}): void {
  lastCameraStreamRenderedPointBudget = options.renderedPointBudget;
  lastCameraStreamEffectiveBudget = options.effectiveBudget;
  lastCameraStreamAppliedRequestId = options.requestId;
  lastCameraStreamLodSettings = options.cameraLodSettings;
  lastCameraStreamDiagnostics = options.diagnostics;
  lastCameraStreamDetailProgress = options.detailProgress;
  lastCameraStreamVisualQuality = options.visualQuality;
  lastCameraStreamRenderDisposition =
    options.renderDisposition ?? "new-render";
  if (options.visualQuality) {
    lastCameraStreamCommittedRender = {
      layer: options.layer,
      result: options.result,
      maxPointCountPerNode: options.maxPointCountPerNode,
      renderedPointBudget: options.effectiveBudget.renderedPointCount,
      rendererRevision: options.layer.getRendererRevision(),
      visualQuality: options.visualQuality,
    };
  }
  const renderedNodeKeys = options.result.nodes.map((node) => node.key);
  if (!sameNodeKeys([...renderNodeSet], renderedNodeKeys)) {
    renderNodeSet.clear();
    renderedNodeKeys.forEach((nodeKey) => renderNodeSet.add(nodeKey));
    renderRenderSetControls();
  }

  if (options.renderDisposition === "retained-exact-render") {
    updateMetadataRows(
      new Map([
        ["Camera stream budget", formatCameraStreamBudget()],
        ["Camera stream LOD", formatCameraStreamLod()],
        [
          "Camera stream diagnostics",
          formatCameraStreamDiagnostics(lastCameraStreamDiagnostics),
        ],
        [
          "Camera stream coverage",
          formatCameraStreamDetailProgress(lastCameraStreamDetailProgress),
        ],
        [
          "Camera stream visual quality",
          formatCameraStreamVisualQuality(lastCameraStreamVisualQuality),
        ],
        [
          "Camera stream prefetch",
          formatCameraStreamPrefetchStatus(lastCameraStreamPrefetchStatus),
        ],
        ["Auto LOD", formatCameraSelection(options.cameraSelection)],
      ]),
    );
    elements.statusText.textContent = options.statusText;
    return;
  }

  renderInspection(
    options.result.inspection,
    undefined,
    undefined,
    options.result.pointSamples,
    options.cameraSelection,
    options.result.renderStats,
  );
  elements.statusText.textContent = options.statusText;
  updateSuggestedNode();
}

function updateMetadataRows(updates: ReadonlyMap<string, string>): void {
  elements.metadataList.querySelectorAll("dt").forEach((label) => {
    const key = label.textContent?.trim();

    if (!key || !updates.has(key)) {
      return;
    }

    const value = label.nextElementSibling;
    if (value) {
      value.textContent = updates.get(key) ?? "";
    }
  });
}

function queueCameraHierarchyPrefetch(
  layer: CopcPointCloudLayer,
  options: CameraHierarchyPrefetchOptions = {},
): void {
  if (layer !== currentLayer || !elements.autoStreamCheckbox.checked) {
    return;
  }

  const delayMilliseconds =
    options.delayMilliseconds ??
    CAMERA_STREAM_RUNTIME_SETTINGS.backgroundPrefetchDelayMilliseconds;
  const prefetchGeometryBatches = options.prefetchGeometryBatches === true;
  const selectedDepth = options.selectedDepth;
  const cameraEpoch = cameraStreamCameraEpoch;

  clearQueuedCameraHierarchyPrefetch();
  queuedCameraStreamPrefetchTimeout = window.setTimeout(() => {
    queuedCameraStreamPrefetchTimeout = undefined;

    if (
      layer !== currentLayer ||
      cameraEpoch !== cameraStreamCameraEpoch ||
      !elements.autoStreamCheckbox.checked
    ) {
      return;
    }

    if (prefetchGeometryBatches) {
      automaticStreamPrefetches.cancel();
    }

    automaticStreamPrefetches.start((signal) =>
      prefetchCameraHierarchy(
        layer,
        signal,
        prefetchGeometryBatches,
        cameraEpoch,
        selectedDepth,
      ),
    );
  }, delayMilliseconds);
}

function clearQueuedCameraHierarchyPrefetch(): void {
  if (queuedCameraStreamPrefetchTimeout === undefined) {
    return;
  }

  window.clearTimeout(queuedCameraStreamPrefetchTimeout);
  queuedCameraStreamPrefetchTimeout = undefined;
}

async function prefetchCameraHierarchy(
  layer: CopcPointCloudLayer,
  signal: AbortSignal,
  prefetchGeometryBatches: boolean,
  cameraEpoch: number,
  selectedDepth: number | undefined,
): Promise<void> {
  try {
    const cameraLodSettings =
      lastCameraStreamLodSettings ?? createCurrentCameraStreamLodSettings();
    // Warm smoothness runs hold the hierarchy after the normal warmup settle
    // so every measured repeat uses the exact same frontier. Geometry prefetch
    // continues below; only benchmark-only hierarchy growth is suspended.
    const previousHierarchyRefinement = lastCameraHierarchyRefinement;
    const hierarchyExpansionDepth =
      selectedDepth === undefined
        ? cameraLodSettings.maxDepth
        : resolveCameraStreamHierarchyExpansionDepth(
            cameraLodSettings.maxDepth,
            selectedDepth,
          );
    const hierarchyExpansion =
      benchmarkHierarchyHoldLayer === layer
        ? undefined
        : await layer.expandHierarchyForCamera({
            camera: viewer.camera,
            viewportWidthPixels: viewer.scene.canvas.clientWidth,
            viewportHeightPixels: viewer.scene.canvas.clientHeight,
            maxPages: Math.max(
              BACKGROUND_CAMERA_HIERARCHY_MAX_PAGES,
              cameraLodSettings.maxHierarchyPages + 1,
            ),
            // A page deeper than the resource-bounded selected frontier cannot
            // contribute to this render. Chasing the screen-space LOD ceiling
            // can exceed the hierarchy cache even when the visible node plan
            // is already complete at a coarser depth.
            maxDepth: hierarchyExpansionDepth,
            signal,
          });

    if (
      signal.aborted ||
      layer !== currentLayer ||
      cameraEpoch !== cameraStreamCameraEpoch ||
      !elements.autoStreamCheckbox.checked
    ) {
      return;
    }

    if (hierarchyExpansion) {
      lastCameraHierarchyRefinement = createCameraHierarchyRefinementState(
        hierarchyExpansion,
        hierarchyExpansionDepth,
      );
      applyHierarchyExpansion(hierarchyExpansion, {
        refreshNodeSelect: false,
      });
      updateSuggestedNode();
    } else if (benchmarkHierarchyHoldLayer !== layer) {
      // `expandHierarchyForCamera` returns undefined only when no relevant
      // pending page can be selected for this camera/depth. Treat that as an
      // explicit completeness proof, not as unknown state.
      lastCameraHierarchyRefinement = {
        pendingRelevantHierarchyPageCount: 0,
        pendingRelevantHierarchyPageSignature: undefined,
        isHierarchyCompleteForView: true,
        refinedThroughDepth: hierarchyExpansionDepth,
      };
    }

    const effectiveHierarchyRefinement = lastCameraHierarchyRefinement;

    if (effectiveHierarchyRefinement && prefetchGeometryBatches) {
      const selectedNodeKeys = await prefetchCameraNodeSamples(
        layer,
        cameraLodSettings,
        signal,
        prefetchGeometryBatches,
        true,
      );

      if (
        signal.aborted ||
        layer !== currentLayer ||
        cameraEpoch !== cameraStreamCameraEpoch ||
        !elements.autoStreamCheckbox.checked
      ) {
        return;
      }

      const selectedNodesChanged =
        selectedNodeKeys !== undefined &&
        !sameNodeKeys(selectedNodeKeys, lastCameraStreamSelectedNodeKeys);
      const pendingSignatureChanged =
        effectiveHierarchyRefinement.pendingRelevantHierarchyPageSignature !==
          previousHierarchyRefinement?.pendingRelevantHierarchyPageSignature;
      const hierarchyBecameComplete =
        effectiveHierarchyRefinement.isHierarchyCompleteForView &&
        previousHierarchyRefinement?.isHierarchyCompleteForView !== true;
      const renderedPlanNeedsHierarchyFollowup =
        lastCameraStreamVisualQuality?.isHierarchyCompleteForView !== true;
      const madeHierarchyProgress =
        (hierarchyExpansion?.loadedPageKeys.length ?? 0) > 0 ||
        selectedNodesChanged ||
        pendingSignatureChanged ||
        hierarchyBecameComplete ||
        (effectiveHierarchyRefinement.isHierarchyCompleteForView &&
          renderedPlanNeedsHierarchyFollowup);
      const followupSignature = createCameraHierarchyFollowupSignature(
        effectiveHierarchyRefinement,
        selectedNodeKeys ?? lastCameraStreamSelectedNodeKeys,
      );

      if (
        madeHierarchyProgress &&
        !cameraHierarchyFollowupSignatures.has(followupSignature)
      ) {
        cameraHierarchyFollowupSignatures.add(followupSignature);
        lastCameraStreamPrefetchStatus = {
          state: "pending",
          plannedNodeCount: selectedNodeKeys?.length ?? 0,
          requestedNodeCount: 0,
          prefetchedNodeCount: 0,
          skippedNodeCount: 0,
          selectedDepth: hierarchyExpansionDepth,
          completed: false,
          reason: effectiveHierarchyRefinement.isHierarchyCompleteForView
            ? "Final hierarchy-complete render queued for the current camera."
            : "Hierarchy refinement queued for the current camera.",
        };
        refreshCameraStreamPrefetchMetadata();
        automaticStreamRequests.clearRenderSignature();
        queueAutomaticStreamRenderForCameraMove(true, true);
        return;
      }
    }

    if (
      effectiveHierarchyRefinement &&
      !effectiveHierarchyRefinement.isHierarchyCompleteForView
    ) {
      lastCameraStreamPrefetchStatus = {
        state: prefetchGeometryBatches ? "failed" : "pending",
        plannedNodeCount: 0,
        requestedNodeCount: 0,
        prefetchedNodeCount: 0,
        skippedNodeCount: 0,
        selectedDepth: hierarchyExpansionDepth,
        completed: prefetchGeometryBatches,
        reason: prefetchGeometryBatches
          ? `${effectiveHierarchyRefinement.pendingRelevantHierarchyPageCount.toLocaleString()} visible hierarchy ${effectiveHierarchyRefinement.pendingRelevantHierarchyPageCount === 1 ? "page remains" : "pages remain"} without forward progress.`
          : `${effectiveHierarchyRefinement.pendingRelevantHierarchyPageCount.toLocaleString()} visible hierarchy ${effectiveHierarchyRefinement.pendingRelevantHierarchyPageCount === 1 ? "page remains" : "pages remain"}; terminal refinement will continue after the foreground render.`,
      };
      refreshCameraStreamPrefetchMetadata();
      return;
    }

    await prefetchCameraNodeSamples(
      layer,
      cameraLodSettings,
      signal,
      prefetchGeometryBatches,
    );
  } catch (error) {
    if (
      signal.aborted ||
      layer !== currentLayer ||
      cameraEpoch !== cameraStreamCameraEpoch ||
      !elements.autoStreamCheckbox.checked
    ) {
      return;
    }

    lastCameraStreamPrefetchStatus = {
      state: "failed",
      plannedNodeCount: 0,
      requestedNodeCount: 0,
      prefetchedNodeCount: 0,
      skippedNodeCount: 0,
      selectedDepth: lastCameraStreamLodSettings?.maxDepth ?? 0,
      completed: true,
      reason: readUnknownErrorMessage(error) ?? "Unknown prefetch error.",
    };
    refreshCameraStreamPrefetchMetadata();
  }
}

function createCameraHierarchyFollowupSignature(
  refinement: CameraHierarchyRefinementState,
  selectedNodeKeys: readonly string[],
): string {
  const hierarchySignature = refinement.isHierarchyCompleteForView
    ? "complete"
    : `pending:${refinement.pendingRelevantHierarchyPageSignature ?? refinement.pendingRelevantHierarchyPageCount}`;

  return `${hierarchySignature}|nodes:${[...selectedNodeKeys].sort().join("|")}`;
}

function createCameraHierarchyRefinementState(
  expansion: CopcPointCloudLayerHierarchyExpansionResult,
  refinedThroughDepth: number,
): CameraHierarchyRefinementState {
  return {
    pendingRelevantHierarchyPageCount:
      expansion.pendingRelevantHierarchyPageCount,
    pendingRelevantHierarchyPageSignature:
      expansion.pendingRelevantHierarchyPageSignature,
    isHierarchyCompleteForView: expansion.isHierarchyCompleteForView,
    refinedThroughDepth,
  };
}

async function prefetchCameraNodeSamples(
  layer: CopcPointCloudLayer,
  cameraLodSettings: CameraStreamLodSettings,
  signal: AbortSignal,
  prefetchGeometryBatches: boolean,
  selectionOnly = false,
): Promise<readonly string[] | undefined> {
  const prefetchSourcePointBudget =
    readEffectiveCameraStreamMaxSourcePointCount(
      cameraLodSettings.maxSourcePointCount,
    );
  const prefetchNodePointBudget = readEffectiveCameraStreamMaxNodePointCount(
    cameraLodSettings.maxNodePointCount,
  );
  const prefetchPointDataLengthBudget =
    readEffectiveCameraStreamMaxPointDataLength(
      cameraLodSettings.maxPointDataLength,
    );
  const prefetchNodePointDataLengthBudget =
    readEffectiveCameraStreamMaxNodePointDataLength(
      cameraLodSettings.maxNodePointDataLength,
    );
  const prefetchMaxNodeCount = createCameraStreamPrefetchNodeCount({
    lodSettings: cameraLodSettings,
    runtimeSettings: CAMERA_STREAM_RUNTIME_SETTINGS,
  });
  const prefetchSelectionPlan = createCameraStreamPrefetchSelectionPlan({
    lodSettings: cameraLodSettings,
    maxNodeCount: prefetchMaxNodeCount,
    maxNodePointCount: prefetchNodePointBudget,
    maxNodePointDataLength: prefetchNodePointDataLengthBudget,
    maxTotalPointCount: prefetchSourcePointBudget,
    maxTotalPointDataLength: prefetchPointDataLengthBudget,
  });
  const cameraSelection = await layer.selectNodesForCamera({
    camera: viewer.camera,
    viewportWidthPixels: viewer.scene.canvas.clientWidth,
    viewportHeightPixels: viewer.scene.canvas.clientHeight,
    ...prefetchSelectionPlan,
    signal,
  });

  if (
    signal.aborted ||
    layer !== currentLayer ||
    !elements.autoStreamCheckbox.checked
  ) {
    return undefined;
  }

  if (!cameraSelection || cameraSelection.nodes.length === 0) {
    lastCameraStreamPrefetchStatus = {
      state: "skipped",
      plannedNodeCount: 0,
      requestedNodeCount: 0,
      prefetchedNodeCount: 0,
      skippedNodeCount: 0,
      selectedDepth:
        cameraSelection?.selectedDepth ?? prefetchSelectionPlan.maxDepth,
      completed: true,
      reason: "No camera-selected prefetch nodes were available.",
    };
    refreshCameraStreamPrefetchMetadata();
    return undefined;
  }

  const selectedNodeKeys = cameraSelection.nodes.map((node) => node.key);

  if (selectionOnly) {
    return selectedNodeKeys;
  }

  const prefetchNodeWeights = cameraSelection.nodes.map((node) => ({
    nodeKey: node.key,
    weight: node.pointCount,
  }));
  const renderNodeKeys = createCameraStreamRenderNodeKeys(
    cameraSelection.nodes,
    layer.hierarchy ?? currentHierarchy,
  );
  const coverageNodeKeys = createCameraStreamCoverageNodeKeys(
    renderNodeKeys,
    cameraSelection.selectedDepth,
  );
  const prefetchPlan = createCameraStreamPrefetchPlan({
    selectedNodeKeys,
    coverageNodeKeys,
    maxNodeCount: prefetchMaxNodeCount,
    basePointCountPerNode:
      CAMERA_STREAM_RUNTIME_SETTINGS.prefetchPointCountPerNode,
    baseMaxRenderedPointCount:
      CAMERA_STREAM_RUNTIME_SETTINGS.prefetchMaxRenderedPointCount,
    nodeWeights: prefetchNodeWeights,
    priorityNodeKeys: lastCameraStreamSelectedNodeKeys,
    // Keep cache checks light here; the background task may warm decoded point
    // data during active detail loading or full geometry batches after detail
    // settles, but it never publishes batches to the Cesium renderer.
    lodSettings: cameraLodSettings,
    hasUsableNodeSample: (nodeKey, maxPointCountPerNode) =>
      cameraStreamNodeSampleCache.find(nodeKey, maxPointCountPerNode) !==
      undefined,
  });

  if (!prefetchPlan.shouldPrefetch) {
    lastCameraStreamPrefetchStatus = {
      state: "skipped",
      plannedNodeCount: 0,
      requestedNodeCount: 0,
      prefetchedNodeCount: 0,
      skippedNodeCount: 0,
      selectedDepth: cameraSelection.selectedDepth,
      completed: true,
      reason: "All selected prefetch nodes already have usable samples.",
    };
    refreshCameraStreamPrefetchMetadata();
    return selectedNodeKeys;
  }

  lastCameraStreamPrefetchStatus = {
    state: "pending",
    plannedNodeCount: prefetchPlan.prefetchNodeKeys.length,
    requestedNodeCount: prefetchPlan.prefetchNodeKeys.length,
    prefetchedNodeCount: 0,
    skippedNodeCount: 0,
    selectedDepth: cameraSelection.selectedDepth,
    completed: false,
  };
  refreshCameraStreamPrefetchMetadata();

  const prefetchOptions = {
    maxConcurrentRequests:
      CAMERA_STREAM_RUNTIME_SETTINGS.backgroundPrefetchMaxConcurrentRequests,
    requestPriority:
      CAMERA_STREAM_RUNTIME_SETTINGS.backgroundPrefetchRequestPriority,
    signal,
    onProgress: (progress: CopcPointCloudLayerPrefetchNodePointDataResult) => {
      if (
        signal.aborted ||
        layer !== currentLayer ||
        !elements.autoStreamCheckbox.checked
      ) {
        return;
      }

      const completed =
        progress.prefetchedNodeCount + progress.skippedNodeCount >=
        progress.requestedNodeCount;
      lastCameraStreamPrefetchStatus = {
        state: completed ? "completed" : "pending",
        plannedNodeCount: prefetchPlan.prefetchNodeKeys.length,
        requestedNodeCount: progress.requestedNodeCount,
        prefetchedNodeCount: progress.prefetchedNodeCount,
        skippedNodeCount: progress.skippedNodeCount,
        selectedDepth: cameraSelection.selectedDepth,
        completed,
      };
      refreshCameraStreamPrefetchMetadata();
    },
  };
  const prefetchResult = prefetchGeometryBatches
    ? await layer.prefetchNodePointGeometryBatches(
        prefetchPlan.prefetchNodeKeys,
        {
          ...prefetchOptions,
          maxPointCountPerNode: prefetchPlan.maxPointCountPerNode,
        },
      )
    : await layer.prefetchNodePointDataViews(
        prefetchPlan.prefetchNodeKeys,
        prefetchOptions,
      );

  if (
    signal.aborted ||
    layer !== currentLayer ||
    !elements.autoStreamCheckbox.checked
  ) {
    return undefined;
  }

  lastCameraStreamPrefetchStatus = createCameraStreamPrefetchStatus({
    plannedNodeCount: prefetchPlan.prefetchNodeKeys.length,
    selectedDepth: cameraSelection.selectedDepth,
    result: prefetchResult,
  });
  refreshCameraStreamPrefetchMetadata();
  return selectedNodeKeys;
}

function sameNodeKeys(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightNodeKeys = new Set(right);
  return left.every((nodeKey) => rightNodeKeys.has(nodeKey));
}

function invalidateCameraStreamCommittedRender(): void {
  lastCameraStreamCommittedRender = undefined;
  lastCameraStreamRenderDisposition = undefined;
}

function cancelCameraStreamPrefetch(
  options: { readonly preserveStatus?: boolean } = {},
): void {
  clearQueuedCameraHierarchyPrefetch();
  automaticStreamPrefetches.cancel();
  if (!options.preserveStatus) {
    lastCameraStreamPrefetchStatus = undefined;
    refreshCameraStreamPrefetchMetadata();
  }
}

async function renderNodeKeySet(nodeKeys: readonly string[]): Promise<void> {
  if (!currentInspection || !currentLayer || nodeKeys.length === 0) {
    return;
  }

  const layer = currentLayer;
  const manualRequest = beginManualCameraRender();
  elements.statusText.textContent = `Reading ${nodeKeys.length.toLocaleString()} COPC nodes...`;

  try {
    const result = await layer.renderNodes(nodeKeys, {
      maxRenderedPointCount: Math.max(
        readMaxPointCountPerNode(),
        nodeKeys.length,
      ),
      signal: manualRequest.signal,
    });

    if (!isCurrentManualRender(layer, manualRequest)) {
      return;
    }

    focusCameraOnPointCloud(result.points);
    cameraStreamNodeSampleCache.remember(result.pointSamples.nodeResults);
    renderInspection(
      result.inspection,
      undefined,
      undefined,
      result.pointSamples,
      undefined,
      result.renderStats,
    );
    elements.statusText.textContent = `Rendered ${result.pointSamples.sampledPointCount.toLocaleString()} points from ${result.pointSamples.nodeKeys.length.toLocaleString()} COPC nodes.`;
    updateSuggestedNode();
    renderRenderSetControls();
  } catch (error) {
    if (!isCurrentManualRender(layer, manualRequest)) {
      return;
    }

    setInspectionError(error);
  }
}

function updateSuggestedNode(): void {
  currentSuggestion = undefined;

  if (!currentInspection || !currentHierarchy || !currentLayer) {
    renderSuggestion(undefined);
    return;
  }

  if (!currentCoordinateTransform?.supportsCameraSelection) {
    renderSuggestionUnavailable(
      "Suggested node unavailable: coordinateTransforms.toCopc is required.",
    );
    return;
  }

  try {
    currentSuggestion = currentLayer.suggestNodeForCamera(viewer.camera);
    renderSuggestion(currentSuggestion);
  } catch (error) {
    renderSuggestionUnavailable(
      error instanceof Error
        ? `Suggested node unavailable: ${error.message}`
        : "Suggested node unavailable.",
    );
  }
}

function renderSuggestion(
  suggestion: CopcHierarchyNodeSuggestion | undefined,
): void {
  if (!suggestion) {
    elements.suggestionText.textContent = "Suggested node: not available.";
    elements.applySuggestionButton.disabled = true;
    return;
  }

  const isSelected = suggestion.node.key === elements.nodeSelect.value;
  elements.suggestionText.textContent = `Suggested node: ${suggestion.node.key} (${formatSuggestionDistance(suggestion.distanceToBounds)})`;
  elements.applySuggestionButton.disabled = isSelected;
  renderRenderSetControls();
}

function renderSuggestionUnavailable(message: string): void {
  elements.suggestionText.textContent = message;
  elements.applySuggestionButton.disabled = true;
}

function addNodeToRenderSet(nodeKey: string): void {
  renderNodeSet.add(nodeKey);
  renderRenderSetControls();
}

function applyHierarchyExpansion(
  expansion: CopcPointCloudLayerHierarchyExpansionResult | undefined,
  options: {
    readonly refreshNodeSelect?: boolean;
  } = {},
): readonly string[] {
  if (!expansion) {
    return [];
  }

  const refreshNodeSelect = options.refreshNodeSelect ?? true;
  currentHierarchy = expansion.hierarchy;

  if (refreshNodeSelect) {
    populateNodeSelect(expansion.hierarchy, elements.nodeSelect.value);
  }

  renderHierarchyPageControls();
  return expansion.loadedPageKeys;
}

function renderHierarchyPageControls(): void {
  if (!currentHierarchy) {
    elements.hierarchyPagesText.textContent = "Hierarchy pages: not loaded.";
    elements.loadMoreHierarchyButton.disabled = true;
    return;
  }

  elements.hierarchyPagesText.textContent = `Hierarchy pages: ${formatHierarchyPageStats(
    currentHierarchy,
    currentLayer?.source.getHierarchyCacheStats(),
  )}.`;
  elements.loadMoreHierarchyButton.disabled =
    !currentLayer || currentHierarchy.pendingPageCount === 0;
}

function renderRenderSetControls(): void {
  const nodeKeys = [...renderNodeSet];
  const hasNodes = nodeKeys.length > 0;
  const selectedNodeKey = elements.nodeSelect.value;
  const suggestedNodeKey = currentSuggestion?.node.key;
  const canUseCameraSelection = Boolean(
    currentInspection &&
    currentHierarchy &&
    currentCoordinateTransform?.supportsCameraSelection,
  );

  elements.renderSetText.textContent = hasNodes
    ? `Render set: ${nodeKeys.join(", ")}`
    : "Render set: empty.";
  elements.addSelectedButton.disabled =
    !selectedNodeKey || renderNodeSet.has(selectedNodeKey);
  elements.addSuggestionButton.disabled =
    !suggestedNodeKey || renderNodeSet.has(suggestedNodeKey);
  elements.autoLodButton.disabled = !canUseCameraSelection;
  elements.autoLodButton.title = canUseCameraSelection
    ? ""
    : "Auto LOD requires coordinateTransforms.toCopc.";
  elements.autoStreamCheckbox.disabled = !canUseCameraSelection;
  if (!canUseCameraSelection) {
    elements.autoStreamCheckbox.checked = false;
    automaticStreamRequests.clearRenderSignature();
    cancelCameraStreamPrefetch();
    resetCameraStreamAdaptiveBudget();
  }
  elements.renderSetButton.disabled = !hasNodes;
  elements.clearSetButton.disabled = !hasNodes;
}

function populateSampleSelect(): void {
  elements.sampleSelect.replaceChildren(
    ...SAMPLE_COPC_SOURCES.map((sample) => {
      const option = new Option(sample.label, sample.id);
      option.title = sample.description;
      return option;
    }),
    new Option("Custom URL / local file", CUSTOM_SAMPLE_OPTION_VALUE),
  );
  elements.sampleSelect.value = DEFAULT_SAMPLE_COPC_SOURCE.id;
  elements.urlInput.value = DEFAULT_SAMPLE_COPC_SOURCE.url;
  clearCustomProjectionInputs();
  syncCustomProjectionControls();
}

function syncSampleSelectWithUrl(url: string): void {
  const sample = findSampleByUrl(url.trim());
  elements.sampleSelect.value = sample?.id ?? CUSTOM_SAMPLE_OPTION_VALUE;
  syncCustomProjectionControls();
}

function syncSampleSelectWithSource(source: CopcSourceConfig): void {
  const sample = isSampleCopcSource(source) ? source : undefined;
  elements.sampleSelect.value = sample?.id ?? CUSTOM_SAMPLE_OPTION_VALUE;
  syncCustomProjectionControls();
}

function findSampleById(sampleId: string): SampleCopcSource | undefined {
  return SAMPLE_COPC_SOURCES.find((sample) => sample.id === sampleId);
}

function findSampleByUrl(url: string): SampleCopcSource | undefined {
  return SAMPLE_COPC_SOURCES.find((sample) => sample.url === url);
}

function isSampleCopcSource(
  source: CopcSourceConfig,
): source is SampleCopcSource {
  return "id" in source;
}

function createSourceConfigFromForm(): CopcSourceConfig {
  const file = elements.fileInput.files?.[0];

  if (file) {
    return createLocalFileCopcSource(file, readCustomProjectionOptions());
  }

  const normalizedUrl = elements.urlInput.value.trim();

  if (!normalizedUrl) {
    throw new Error("COPC URL or local file is required.");
  }

  const sample =
    elements.sampleSelect.value === CUSTOM_SAMPLE_OPTION_VALUE
      ? undefined
      : findSampleByUrl(normalizedUrl);

  return (
    sample ??
    createCustomCopcSource(normalizedUrl, readCustomProjectionOptions())
  );
}

function normalizeSourceConfig(source: CopcSourceConfig): CopcSourceConfig {
  return {
    ...source,
    url: source.url.trim(),
  };
}

function readCopcSourceInput(source: CopcSourceConfig): string | Blob {
  return source.source ?? source.url;
}

function readCustomProjectionOptions(): CustomCopcProjectionOptions {
  return {
    sourceCrs: elements.sourceCrsInput.value,
    sourceDefinition: elements.sourceDefinitionInput.value,
  };
}

function readPointRendererKind(): PointRendererKind {
  const value = elements.rendererSelect.value;

  return value in POINT_RENDERER_LABELS
    ? (value as PointRendererKind)
    : DEFAULT_POINT_RENDERER_KIND;
}

function initializeRendererBenchmarkControls(): void {
  const params = new URLSearchParams(window.location.search);
  const renderer = params.get("renderer");

  if (renderer === "buffer" || renderer === "primitive") {
    elements.rendererSelect.value = renderer;
  }

  const quality = params.get("quality");
  elements.qualitySelect.value = isRenderQuality(quality)
    ? quality
    : DEFAULT_RENDER_QUALITY;
  const qualitySettings = readRenderQualitySettings();
  const maxPointCountParam =
    params.get("maxPointCountPerNode") ?? params.get("maxPoints");

  if (!maxPointCountParam) {
    elements.maxPointCountInput.value = String(
      qualitySettings.maxPointCountPerNode,
    );
  } else {
    const maxPointCount = Number(maxPointCountParam);
    elements.maxPointCountInput.value = String(
      isPositiveSafeInteger(maxPointCount)
        ? maxPointCount
        : DEFAULT_MAX_POINT_COUNT_PER_NODE,
    );
  }

  const streamPointBudgetParam =
    params.get("cameraStreamMaxPoints") ?? params.get("streamMaxPoints");

  if (!streamPointBudgetParam) {
    elements.cameraStreamPointBudgetInput.value = String(
      readQualityCameraStreamMaxRenderedPointCount(qualitySettings),
    );
  } else {
    const streamPointBudget = Number(streamPointBudgetParam);
    elements.cameraStreamPointBudgetInput.value = String(
      isPositiveSafeInteger(streamPointBudget)
        ? streamPointBudget
        : DEFAULT_CAMERA_STREAM_MAX_RENDERED_POINT_COUNT,
    );
  }
}

function readMaxPointCountPerNode(): number {
  const maxPointCount = Number(elements.maxPointCountInput.value);
  return isPositiveSafeInteger(maxPointCount)
    ? maxPointCount
    : DEFAULT_MAX_POINT_COUNT_PER_NODE;
}

function readRenderQuality(): RenderQuality {
  const quality = elements.qualitySelect.value;

  return isRenderQuality(quality) ? quality : DEFAULT_RENDER_QUALITY;
}

function readRenderQualitySettings(): RenderQualitySettings {
  return RENDER_QUALITY_SETTINGS[readRenderQuality()];
}

function applyRenderQualitySettings(quality: RenderQuality): void {
  const settings = RENDER_QUALITY_SETTINGS[quality];
  elements.qualitySelect.value = quality;
  elements.maxPointCountInput.value = String(settings.maxPointCountPerNode);
  elements.cameraStreamPointBudgetInput.value = String(
    readQualityCameraStreamMaxRenderedPointCount(settings),
  );
}

function isRenderQuality(value: string | null): value is RenderQuality {
  return value !== null && value in RENDER_QUALITY_SETTINGS;
}

function readCameraStreamMaxRenderedPointCount(): number {
  const pointBudget = Number(elements.cameraStreamPointBudgetInput.value);
  return isPositiveSafeInteger(pointBudget)
    ? pointBudget
    : DEFAULT_CAMERA_STREAM_MAX_RENDERED_POINT_COUNT;
}

function readCameraHeightMeters(): number {
  const absoluteHeightMeters = viewer.camera.positionCartographic.height;
  const height =
    currentLayer?.getCameraHeightAbovePointCloudMeters(absoluteHeightMeters) ??
    absoluteHeightMeters;

  return Number.isFinite(height)
    ? Math.max(0, height)
    : Number.POSITIVE_INFINITY;
}

function createCurrentCameraStreamLodSettings(): CameraStreamLodSettings {
  return createCameraStreamLodSettings({
    cameraHeightMeters: readCameraHeightMeters(),
    qualitySettings: readRenderQualitySettings(),
  });
}

function readQualityCameraStreamMaxRenderedPointCount(
  qualitySettings: RenderQualitySettings,
): number {
  return createCameraStreamLodSettings({
    cameraHeightMeters: 0,
    qualitySettings,
  }).maxRenderedPointCount;
}

function readEffectiveCameraStreamMaxSourcePointCount(
  maxSourcePointBudget: number,
): number {
  return Math.min(
    maxSourcePointBudget,
    adaptiveCameraStreamBudgetState.sourcePointBudget ??
      Number.POSITIVE_INFINITY,
  );
}

function readEffectiveCameraStreamMaxNodePointCount(
  maxNodePointBudget: number,
): number {
  return Math.min(
    maxNodePointBudget,
    adaptiveCameraStreamBudgetState.nodePointBudget ?? Number.POSITIVE_INFINITY,
  );
}

function readEffectiveCameraStreamMaxPointDataLength(
  maxPointDataLengthBudget: number,
): number {
  return Math.min(
    maxPointDataLengthBudget,
    adaptiveCameraStreamBudgetState.pointDataLengthBudget ??
      Number.POSITIVE_INFINITY,
  );
}

function readEffectiveCameraStreamMaxNodePointDataLength(
  maxNodePointDataLengthBudget: number,
): number {
  return Math.min(
    maxNodePointDataLengthBudget,
    adaptiveCameraStreamBudgetState.nodePointDataLengthBudget ??
      Number.POSITIVE_INFINITY,
  );
}

function readEffectiveAutoLodMaxSourcePointCount(
  maxSourcePointBudget: number,
): number {
  return Math.min(
    maxSourcePointBudget,
    adaptiveAutoLodBudgetState.sourcePointBudget ?? Number.POSITIVE_INFINITY,
  );
}

function readEffectiveAutoLodMaxNodePointCount(
  maxNodePointBudget: number,
): number {
  return Math.min(
    maxNodePointBudget,
    adaptiveAutoLodBudgetState.nodePointBudget ?? Number.POSITIVE_INFINITY,
  );
}

function readEffectiveAutoLodMaxPointDataLength(
  maxPointDataLengthBudget: number,
): number {
  return Math.min(
    maxPointDataLengthBudget,
    adaptiveAutoLodBudgetState.pointDataLengthBudget ??
      Number.POSITIVE_INFINITY,
  );
}

function readEffectiveAutoLodMaxNodePointDataLength(
  maxNodePointDataLengthBudget: number,
): number {
  return Math.min(
    maxNodePointDataLengthBudget,
    adaptiveAutoLodBudgetState.nodePointDataLengthBudget ??
      Number.POSITIVE_INFINITY,
  );
}

function resetAutoLodAdaptiveBudget(): void {
  adaptiveAutoLodBudgetState = {};
  lastAutoLodRenderedPointBudget = undefined;
}

function resetCameraStreamAdaptiveBudget(): void {
  adaptiveCameraStreamBudgetState = {};
  lastCameraStreamRenderedPointBudget = undefined;
  lastCameraStreamEffectiveBudget = undefined;
  lastCameraStreamSelectedNodeKeys = [];
  lastCameraStreamRenderSignature = undefined;
  lastCameraStreamNodeReuse = undefined;
  lastCameraStreamLodSettings = undefined;
}

function updateAutoLodAdaptiveBudget(
  qualitySettings: RenderQualitySettings,
  totalMilliseconds: number,
  renderStats: CopcPointCloudLayerRenderStats,
): void {
  const geometryTimings = renderStats.pointGeometryTimings;
  const update = updateCameraStreamAdaptiveBudgetState({
    state: adaptiveAutoLodBudgetState,
    limits: createAutoLodBudgetLimits(qualitySettings),
    timings: {
      totalMilliseconds,
      decodeMilliseconds: geometryTimings?.maxPointDataViewMilliseconds,
      workerMilliseconds: geometryTimings?.maxWorkerTotalMilliseconds,
      roundTripMilliseconds: geometryTimings?.maxRequestRoundTripMilliseconds,
    },
  });

  adaptiveAutoLodBudgetState = update.state;
}

function createAutoLodBudgetLimits(
  qualitySettings: RenderQualitySettings,
): AdaptiveBudgetLimits {
  return {
    maxRenderedPointCount: qualitySettings.autoLodMaxRenderedPointCount,
    maxSourcePointCount: qualitySettings.autoLodMaxSourcePointCount,
    maxNodePointCount: qualitySettings.autoLodMaxNodePointCount,
    maxPointDataLength: qualitySettings.autoLodMaxPointDataLength,
    maxNodePointDataLength: qualitySettings.autoLodMaxNodePointDataLength,
  };
}

function updateCameraStreamAdaptiveBudget(
  maxPointBudget: number,
  cameraLodSettings: CameraStreamLodSettings,
  totalMilliseconds: number,
  renderStats: CopcPointCloudLayerRenderStats,
): void {
  if (automaticCameraMoveInProgress) {
    return;
  }

  const geometryTimings = renderStats.pointGeometryTimings;
  const update = updateCameraStreamAdaptiveBudgetState({
    state: adaptiveCameraStreamBudgetState,
    limits: createCameraStreamBudgetLimits(maxPointBudget, cameraLodSettings),
    timings: {
      totalMilliseconds,
      renderMilliseconds: renderStats.totalRenderMilliseconds,
      decodeMilliseconds: geometryTimings?.maxPointDataViewMilliseconds,
      workerMilliseconds: geometryTimings?.maxWorkerTotalMilliseconds,
      roundTripMilliseconds: geometryTimings?.maxRequestRoundTripMilliseconds,
    },
  });

  adaptiveCameraStreamBudgetState = update.state;
}

function createCameraStreamBudgetLimits(
  maxPointBudget: number,
  cameraLodSettings: CameraStreamLodSettings,
): AdaptiveBudgetLimits {
  return {
    maxRenderedPointCount: Math.min(
      maxPointBudget,
      cameraLodSettings.maxRenderedPointCount,
    ),
    maxSourcePointCount: cameraLodSettings.maxSourcePointCount,
    maxNodePointCount: cameraLodSettings.maxNodePointCount,
    maxPointDataLength: cameraLodSettings.maxPointDataLength,
    maxNodePointDataLength: cameraLodSettings.maxNodePointDataLength,
  };
}

function createEffectiveCameraStreamBudget(
  maxPointBudget: number,
  cameraLodSettings: CameraStreamLodSettings,
  options: {
    readonly applyAdaptiveBudget?: boolean;
  } = {},
): CameraStreamEffectiveBudget {
  const effectiveBudget = constrainCameraStreamBudgetForRenderedPoints({
    budget: createCameraStreamEffectiveBudget({
      state: selectCameraStreamAdaptiveBudgetState(
        adaptiveCameraStreamBudgetState,
        options.applyAdaptiveBudget !== false,
      ),
      limits: createCameraStreamBudgetLimits(maxPointBudget, cameraLodSettings),
    }),
    minSourcePointCount: 120_000,
    minNodePointCount: 30_000,
    minPointDataLength: 1_200_000,
    minNodePointDataLength: 512 * 1024,
  });

  // Complete-depth selection is all-or-nothing: lowering an individual-node
  // cap can reject an otherwise affordable depth because of one dense tile.
  // Adapt aggregate work, but keep node eligibility stable across zoom bands.
  return {
    ...effectiveBudget,
    nodePointCount: Math.min(
      cameraLodSettings.maxNodePointCount,
      effectiveBudget.sourcePointCount,
    ),
    nodePointDataLength: Math.min(
      cameraLodSettings.maxNodePointDataLength,
      effectiveBudget.pointDataLength,
    ),
  };
}

function readNavigatorHardwareConcurrency(): number | undefined {
  const hardwareConcurrency =
    typeof navigator === "undefined"
      ? undefined
      : navigator.hardwareConcurrency;

  if (
    hardwareConcurrency === undefined ||
    !Number.isSafeInteger(hardwareConcurrency) ||
    hardwareConcurrency <= 0
  ) {
    return undefined;
  }

  return hardwareConcurrency;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function createPointRendererFactory(
  kind: PointRendererKind,
): CopcPointCloudRendererFactory {
  const qualitySettings = readRenderQualitySettings();

  if (kind === "buffer") {
    return (scene) =>
      new CesiumBufferPointRenderer(scene, {
        pointSize: qualitySettings.pointPixelSize,
        outlineWidth: qualitySettings.pointOutlineWidth,
      });
  }

  if (kind === "primitive") {
    return (scene) =>
      new CesiumPointPrimitiveRenderer(scene, {
        pixelSize: qualitySettings.pointPixelSize,
        outlineWidth: qualitySettings.pointOutlineWidth,
      });
  }

  return (scene) =>
    new CesiumPrimitivePointRenderer(scene, {
      pointSize: qualitySettings.pointPixelSize,
    });
}

function syncCustomProjectionControls(): void {
  const isCustomSource =
    elements.sampleSelect.value === CUSTOM_SAMPLE_OPTION_VALUE;
  elements.sourceCrsInput.disabled = !isCustomSource;
  elements.sourceDefinitionInput.disabled = !isCustomSource;
}

function clearCustomProjectionInputs(): void {
  elements.sourceCrsInput.value = "";
  elements.sourceDefinitionInput.value = "";
}

function populateNodeSelect(
  hierarchy: CopcHierarchySummary,
  preferredNodeKey = "",
): void {
  elements.nodeSelect.replaceChildren(
    ...hierarchy.nodes.map((node) => {
      const option = new Option(
        `${node.key} | ${node.pointCount.toLocaleString()} pts | ${formatBytes(node.pointDataLength)}`,
        node.key,
      );
      option.title = `offset ${node.pointDataOffset.toLocaleString()}`;
      return option;
    }),
  );
  elements.nodeSelect.disabled = hierarchy.nodes.length === 0;
  elements.nodeSelect.value = hierarchy.nodes.some(
    (node) => node.key === preferredNodeKey,
  )
    ? preferredNodeKey
    : (hierarchy.nodes[0]?.key ?? "");
}

function getPrototypeElements(): {
  readonly container: HTMLDivElement;
  readonly form: HTMLFormElement;
  readonly sampleSelect: HTMLSelectElement;
  readonly rendererSelect: HTMLSelectElement;
  readonly qualitySelect: HTMLSelectElement;
  readonly maxPointCountInput: HTMLInputElement;
  readonly cameraStreamPointBudgetInput: HTMLInputElement;
  readonly urlInput: HTMLInputElement;
  readonly fileInput: HTMLInputElement;
  readonly sourceCrsInput: HTMLInputElement;
  readonly sourceDefinitionInput: HTMLTextAreaElement;
  readonly nodeSelect: HTMLSelectElement;
  readonly hierarchyPagesText: HTMLParagraphElement;
  readonly loadMoreHierarchyButton: HTMLButtonElement;
  readonly suggestionText: HTMLParagraphElement;
  readonly applySuggestionButton: HTMLButtonElement;
  readonly renderSetText: HTMLParagraphElement;
  readonly addSelectedButton: HTMLButtonElement;
  readonly addSuggestionButton: HTMLButtonElement;
  readonly autoLodButton: HTMLButtonElement;
  readonly autoStreamCheckbox: HTMLInputElement;
  readonly renderSetButton: HTMLButtonElement;
  readonly clearSetButton: HTMLButtonElement;
  readonly statusText: HTMLParagraphElement;
  readonly metadataList: HTMLDListElement;
} {
  const container = document.querySelector<HTMLDivElement>("#cesium-container");
  const form = document.querySelector<HTMLFormElement>("#copc-form");
  const sampleSelect = document.querySelector<HTMLSelectElement>(
    "#copc-sample-select",
  );
  const rendererSelect = document.querySelector<HTMLSelectElement>(
    "#copc-renderer-select",
  );
  const qualitySelect = document.querySelector<HTMLSelectElement>(
    "#copc-quality-select",
  );
  const maxPointCountInput = document.querySelector<HTMLInputElement>(
    "#copc-max-point-count",
  );
  const cameraStreamPointBudgetInput = document.querySelector<HTMLInputElement>(
    "#copc-camera-stream-point-budget",
  );
  const urlInput = document.querySelector<HTMLInputElement>("#copc-url");
  const fileInput = document.querySelector<HTMLInputElement>("#copc-file");
  const sourceCrsInput =
    document.querySelector<HTMLInputElement>("#copc-source-crs");
  const sourceDefinitionInput = document.querySelector<HTMLTextAreaElement>(
    "#copc-source-definition",
  );
  const nodeSelect =
    document.querySelector<HTMLSelectElement>("#copc-node-select");
  const hierarchyPagesText = document.querySelector<HTMLParagraphElement>(
    "#copc-hierarchy-pages",
  );
  const loadMoreHierarchyButton = document.querySelector<HTMLButtonElement>(
    "#copc-load-more-hierarchy",
  );
  const suggestionText =
    document.querySelector<HTMLParagraphElement>("#copc-suggestion");
  const applySuggestionButton = document.querySelector<HTMLButtonElement>(
    "#copc-apply-suggestion",
  );
  const renderSetText =
    document.querySelector<HTMLParagraphElement>("#copc-render-set");
  const addSelectedButton =
    document.querySelector<HTMLButtonElement>("#copc-add-selected");
  const addSuggestionButton = document.querySelector<HTMLButtonElement>(
    "#copc-add-suggestion",
  );
  const autoLodButton =
    document.querySelector<HTMLButtonElement>("#copc-auto-lod");
  const autoStreamCheckbox =
    document.querySelector<HTMLInputElement>("#copc-auto-stream");
  const renderSetButton = document.querySelector<HTMLButtonElement>(
    "#copc-render-set-button",
  );
  const clearSetButton =
    document.querySelector<HTMLButtonElement>("#copc-clear-set");
  const statusText =
    document.querySelector<HTMLParagraphElement>("#copc-status");
  const metadataList =
    document.querySelector<HTMLDListElement>("#copc-metadata");

  if (
    !container ||
    !form ||
    !sampleSelect ||
    !rendererSelect ||
    !qualitySelect ||
    !maxPointCountInput ||
    !cameraStreamPointBudgetInput ||
    !urlInput ||
    !fileInput ||
    !sourceCrsInput ||
    !sourceDefinitionInput ||
    !nodeSelect ||
    !hierarchyPagesText ||
    !loadMoreHierarchyButton ||
    !suggestionText ||
    !applySuggestionButton ||
    !renderSetText ||
    !addSelectedButton ||
    !addSuggestionButton ||
    !autoLodButton ||
    !autoStreamCheckbox ||
    !renderSetButton ||
    !clearSetButton ||
    !statusText ||
    !metadataList
  ) {
    throw new Error("Missing basic viewer DOM elements.");
  }

  return {
    container,
    form,
    sampleSelect,
    rendererSelect,
    qualitySelect,
    maxPointCountInput,
    cameraStreamPointBudgetInput,
    urlInput,
    fileInput,
    sourceCrsInput,
    sourceDefinitionInput,
    nodeSelect,
    hierarchyPagesText,
    loadMoreHierarchyButton,
    suggestionText,
    applySuggestionButton,
    renderSetText,
    addSelectedButton,
    addSuggestionButton,
    autoLodButton,
    autoStreamCheckbox,
    renderSetButton,
    clearSetButton,
    statusText,
    metadataList,
  };
}

function metadataRow(
  label: string,
  value: string,
  descriptionId?: string,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const term = document.createElement("dt");
  const description = document.createElement("dd");

  term.textContent = label;
  description.textContent = value;
  if (descriptionId) {
    description.id = descriptionId;
  }
  fragment.append(term, description);

  return fragment;
}

function refreshCameraStreamPrefetchMetadata(): void {
  const description = document.querySelector<HTMLElement>(
    "#copc-camera-stream-prefetch",
  );

  if (description) {
    description.textContent = formatCameraStreamPrefetchStatus(
      lastCameraStreamPrefetchStatus,
    );
  }
}

function formatBoundsMin(bounds: CopcBounds): string {
  return formatVector([bounds.minX, bounds.minY, bounds.minZ]);
}

function formatBoundsMax(bounds: CopcBounds): string {
  return formatVector([bounds.maxX, bounds.maxY, bounds.maxZ]);
}

function formatVector(values: readonly number[]): string {
  return values.map(formatNumber).join(", ");
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatMilliseconds(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatMeters(value: number): string {
  if (!Number.isFinite(value)) {
    return "unknown height";
  }

  return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} m`;
}

function formatVlrs(inspection: CopcInspection): string {
  return inspection.vlrs
    .map((vlr) => {
      const kind = vlr.isExtended ? "EVLR" : "VLR";
      const description = vlr.description ? `, ${vlr.description}` : "";
      return `${kind} ${vlr.userId}/${vlr.recordId} (${vlr.contentLength.toLocaleString()} bytes${description})`;
    })
    .join(" | ");
}

function formatDensity(value: number): string {
  return `${value.toExponential(3)} pts / unit^3`;
}

function formatRenderSetSummary(): string {
  return renderNodeSet.size > 0
    ? `${renderNodeSet.size.toLocaleString()} nodes queued`
    : "Empty";
}

function formatPointSampleCacheStats(stats: CopcPointSampleCacheStats): string {
  return `${stats.cachedSampleSetCount.toLocaleString()} / ${stats.maxCachedSampleSetCount.toLocaleString()} sample sets, ${formatBytes(stats.cachedPointSampleBytes)} / ${formatBytes(stats.maxCachedPointSampleBytes)}, ${stats.cacheHitCount.toLocaleString()} hits, ${stats.cacheMissCount.toLocaleString()} misses, ${stats.cacheEvictionCount.toLocaleString()} evictions`;
}

function formatPointGeometryCacheStats(
  stats: CopcPointCloudLayerPointGeometryCacheStats,
): string {
  const byteLimit =
    stats.maxCachedPointGeometryBytes === undefined
      ? "unbounded"
      : formatBytes(stats.maxCachedPointGeometryBytes);

  return `${stats.cachedLoadedBatchCount.toLocaleString()} / ${stats.maxCachedLoadedBatchCount.toLocaleString()} loaded batches, ${stats.loadedBatchCacheHitCount.toLocaleString()} hits, ${stats.loadedBatchCacheReuseCount.toLocaleString()} density reuses, ${stats.loadedBatchCacheMissCount.toLocaleString()} misses, ${stats.loadedBatchCacheEvictionCount.toLocaleString()} evictions; ${stats.cachedTransformedBatchCount.toLocaleString()} / ${stats.maxCachedTransformedBatchCount.toLocaleString()} transformed batches; ${formatBytes(stats.cachedPointGeometryBytes)} / ${byteLimit} unique geometry buffers, ${formatBytes(stats.peakCachedPointGeometryBytes)} peak, ${stats.pointGeometryCacheByteEvictionCount.toLocaleString()} byte evictions, ${stats.oversizedPointGeometryBatchCacheSkipCount.toLocaleString()} oversized skips`;
}

function formatDecodedPointDataCacheStats(
  stats: CopcPointCloudLayerDecodedPointDataCacheStats,
): string {
  const aggregateLimit =
    stats.maxDecodedPointDataViewBytesAcrossWorkers === undefined
      ? "unbounded"
      : formatBytes(stats.maxDecodedPointDataViewBytesAcrossWorkers);
  const sampleLimit =
    stats.pointSample.maxDecodedPointDataViewBytesAcrossWorkers === undefined
      ? "unbounded"
      : formatBytes(
          stats.pointSample.maxDecodedPointDataViewBytesAcrossWorkers,
        );
  const geometryLimit =
    stats.integratedPointGeometry.maxDecodedPointDataViewBytesAcrossWorkers ===
    undefined
      ? "unbounded"
      : formatBytes(
          stats.integratedPointGeometry
            .maxDecodedPointDataViewBytesAcrossWorkers,
        );

  return `${stats.retainedViewCount.toLocaleString()} views, ${formatBytes(stats.retainedBytes)} / ${aggregateLimit}, ${formatBytes(stats.peakRetainedBytes)} peak, ${stats.cacheHitCount.toLocaleString()} hits, ${stats.cacheMissCount.toLocaleString()} misses, ${stats.cacheEvictionCount.toLocaleString()} evictions, ${stats.oversizedEntrySkipCount.toLocaleString()} oversized skips; sample ${stats.pointSample.workerCount.toLocaleString()} workers / ${sampleLimit}, geometry ${stats.integratedPointGeometry.workerCount.toLocaleString()} workers / ${geometryLimit}`;
}

function formatRenderStats(stats: CopcPointCloudLayerRenderStats): string {
  return `${stats.pointCount.toLocaleString()} pts, transform ${formatMilliseconds(stats.coordinateTransformMilliseconds)} ms, renderer ${formatMilliseconds(stats.rendererSetPointsMilliseconds)} ms, bounds ${formatMilliseconds(stats.boundsRenderMilliseconds)} ms, total ${formatMilliseconds(stats.totalRenderMilliseconds)} ms`;
}

function formatRendererPayload(stats: CopcPointCloudLayerRenderStats): string {
  return `${formatBytes(stats.estimatedRenderPayloadBytes)} estimated coordinate/color payload`;
}

function formatPointGeometryTimings(
  timings: CopcPointCloudLayerPointGeometryTimingStats,
): string {
  const slowestNodeText =
    timings.slowestNodes.length === 0
      ? ""
      : `, slowest ${timings.slowestNodes
          .slice(0, 3)
          .map((node) => {
            const pointDataLengthText =
              node.pointDataLength === undefined
                ? ""
                : ` / ${formatBytes(node.pointDataLength)}`;

            return `${node.nodeKey} ${formatMilliseconds(node.pointDataViewMilliseconds)} ms (${node.nodePointCount.toLocaleString()} pts${pointDataLengthText})`;
          })
          .join("; ")}`;

  return `${timings.nodeCount.toLocaleString()} nodes, ${timings.cacheHitCount.toLocaleString()} cache hits, max round trip ${formatMilliseconds(timings.maxRequestRoundTripMilliseconds)} ms, max decode ${formatMilliseconds(timings.maxPointDataViewMilliseconds)} ms, max worker ${formatMilliseconds(timings.maxWorkerTotalMilliseconds)} ms, max queue ${formatMilliseconds(timings.maxRequestQueueMilliseconds)} ms, sum decode ${formatMilliseconds(timings.pointDataViewMilliseconds)} ms, sum worker ${formatMilliseconds(timings.workerTotalMilliseconds)} ms, sum queue ${formatMilliseconds(timings.requestQueueMilliseconds)} ms${slowestNodeText}`;
}

function formatRenderQuality(quality: RenderQuality): string {
  const settings = RENDER_QUALITY_SETTINGS[quality];
  const autoLodPointCount =
    settings.autoLodMaxRenderedPointCount.toLocaleString();

  if (quality === "preview") {
    return `Fast preview (${autoLodPointCount} Auto LOD pts, ${settings.pointPixelSize}px points)`;
  }

  if (quality === "detail") {
    return `High detail (${autoLodPointCount} Auto LOD pts, ${settings.pointPixelSize}px points)`;
  }

  if (quality === "ultra") {
    return `Ultra density (${autoLodPointCount} Auto LOD pts, ${settings.pointPixelSize}px points)`;
  }

  return `Balanced detail (${autoLodPointCount} Auto LOD pts, ${settings.pointPixelSize}px points)`;
}

function formatAutoLodBudget(): string {
  const qualitySettings = readRenderQualitySettings();
  const limits = createAutoLodBudgetLimits(qualitySettings);
  const effectiveBudget = createCameraStreamEffectiveBudget({
    state: adaptiveAutoLodBudgetState,
    limits,
  });

  return formatCameraStreamBudgetSummary({
    configuredRenderedPointBudget: limits.maxRenderedPointCount,
    effectiveRenderedPointBudget: effectiveBudget.renderedPointCount,
    effectiveSourcePointBudget: effectiveBudget.sourcePointCount,
    maxSourcePointBudget: limits.maxSourcePointCount,
    effectiveNodePointBudget: effectiveBudget.nodePointCount,
    maxNodePointBudget: limits.maxNodePointCount,
    effectivePointDataLengthBudget: effectiveBudget.pointDataLength,
    maxPointDataLengthBudget: limits.maxPointDataLength,
    effectiveNodePointDataLengthBudget: effectiveBudget.nodePointDataLength,
    maxNodePointDataLengthBudget: limits.maxNodePointDataLength,
    lastRenderedPointBudget: lastAutoLodRenderedPointBudget,
    formatBytes,
  });
}

function formatCameraStreamBudget(): string {
  const configuredPointBudget = readCameraStreamMaxRenderedPointCount();
  const lodSettings =
    lastCameraStreamLodSettings ?? createCurrentCameraStreamLodSettings();
  const effectiveBudget =
    lastCameraStreamEffectiveBudget ??
    createEffectiveCameraStreamBudget(configuredPointBudget, lodSettings);

  return formatCameraStreamBudgetSummary({
    configuredRenderedPointBudget: configuredPointBudget,
    effectiveRenderedPointBudget: effectiveBudget.renderedPointCount,
    maxRenderedPointBudget: Math.min(
      configuredPointBudget,
      lodSettings.maxRenderedPointCount,
    ),
    effectiveSourcePointBudget: effectiveBudget.sourcePointCount,
    maxSourcePointBudget: lodSettings.maxSourcePointCount,
    effectiveNodePointBudget: effectiveBudget.nodePointCount,
    maxNodePointBudget: lodSettings.maxNodePointCount,
    effectivePointDataLengthBudget: effectiveBudget.pointDataLength,
    maxPointDataLengthBudget: lodSettings.maxPointDataLength,
    effectiveNodePointDataLengthBudget: effectiveBudget.nodePointDataLength,
    maxNodePointDataLengthBudget: lodSettings.maxNodePointDataLength,
    lastRenderedPointBudget: lastCameraStreamRenderedPointBudget,
    formatBytes,
  });
}

function formatCameraStreamLod(): string {
  const effectiveBudget = lastCameraStreamLodSettings
    ? (lastCameraStreamEffectiveBudget ??
      createEffectiveCameraStreamBudget(
        readCameraStreamMaxRenderedPointCount(),
        lastCameraStreamLodSettings,
      ))
    : undefined;

  return formatCameraStreamLodSummary({
    lodSettings: lastCameraStreamLodSettings,
    effectiveSourcePointBudget: lastCameraStreamLodSettings
      ? (effectiveBudget?.sourcePointCount ?? 0)
      : 0,
    effectiveNodePointBudget: lastCameraStreamLodSettings
      ? (effectiveBudget?.nodePointCount ?? 0)
      : 0,
    effectivePointDataLengthBudget: lastCameraStreamLodSettings
      ? (effectiveBudget?.pointDataLength ?? 0)
      : 0,
    effectiveNodePointDataLengthBudget: lastCameraStreamLodSettings
      ? (effectiveBudget?.nodePointDataLength ?? 0)
      : 0,
    formatBytes,
    formatMeters,
  });
}

function createCameraStreamPrefetchStatus(options: {
  readonly plannedNodeCount: number;
  readonly selectedDepth: number;
  readonly result: CopcPointCloudLayerPrefetchNodePointDataResult;
}): CameraStreamPrefetchStatus {
  return {
    state: "completed",
    plannedNodeCount: options.plannedNodeCount,
    requestedNodeCount: options.result.requestedNodeCount,
    prefetchedNodeCount: options.result.prefetchedNodeCount,
    skippedNodeCount: options.result.skippedNodeCount,
    selectedDepth: options.selectedDepth,
    completed: true,
  };
}

function formatCameraStreamPrefetchStatus(
  status: CameraStreamPrefetchStatus | undefined,
): string {
  if (!status) {
    return "Not prefetched yet";
  }

  if (status.state === "failed") {
    return `failed at depth ${status.selectedDepth.toLocaleString()}: ${status.reason ?? "Unknown prefetch error."}`;
  }

  if (status.state === "skipped") {
    return `skipped at depth ${status.selectedDepth.toLocaleString()}: ${status.reason ?? "No prefetch work was required."}`;
  }

  return `${status.state}, planned ${status.plannedNodeCount.toLocaleString()} nodes at depth ${status.selectedDepth.toLocaleString()}, requested ${status.requestedNodeCount.toLocaleString()}, prefetched ${status.prefetchedNodeCount.toLocaleString()}, skipped ${status.skippedNodeCount.toLocaleString()}`;
}

function formatHierarchyPageStats(
  hierarchy: CopcHierarchySummary,
  stats?: CopcHierarchyCacheStats,
): string {
  const loadedPageCount = stats?.loadedPageCount ?? hierarchy.loadedPageCount;
  const pendingPageCount =
    stats?.pendingPageCount ?? hierarchy.pendingPageCount;
  const limitSummary = stats
    ? ` / ${stats.maxCachedPageCount.toLocaleString()} page cache limit, ${formatBytes(stats.loadedPageBytes)} / ${formatBytes(stats.maxCachedPageBytes)} hierarchy bytes, ${stats.trackedNodeCount.toLocaleString()} tracked nodes`
    : "";
  const evictionSummary = stats
    ? `, ${stats.cacheEvictionCount.toLocaleString()} evictions`
    : "";
  const overLimitSummary = stats?.isOverLimit ? ", over limit" : "";

  return `${loadedPageCount.toLocaleString()} loaded${limitSummary}, ${pendingPageCount.toLocaleString()} pending${evictionSummary}${overLimitSummary}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function readUnknownErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return undefined;
}

function formatCoordinateTransform(
  status: CopcCoordinateTransformStatus,
): string {
  return `${status.label} (${status.kind}, camera selection ${
    status.supportsCameraSelection ? "supported" : "unavailable"
  })`;
}

function formatSuggestionDistance(value: number): string {
  return value === 0
    ? "camera position inside XY bounds"
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} COPC units from camera XY`;
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function formatBytes(byteCount: number): string {
  if (byteCount < 1024) {
    return `${byteCount.toLocaleString()} B`;
  }

  return `${(byteCount / 1024).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })} KB`;
}
