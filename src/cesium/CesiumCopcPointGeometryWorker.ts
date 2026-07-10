import { Copc } from "copc";
import type { Copc as CopcData, Getter } from "copc";
import {
  createCopcRangeGetter,
  createCopcSourceDescriptor,
  type CopcSourceDescriptor,
} from "../core/copc/createCopcRangeGetter";
import { getSharedLazPerf } from "../core/copc/createLazPerf";
import {
  loadCopcNodePointDataView,
  sampleCopcPointDataView,
  type CopcPointDataView,
} from "../core/copc/loadCopcNodePointSamples";
import type { CopcNodePointSampleResult } from "../core/copc/CopcPointDataSample";
import type { PointGeometryBatch } from "./CopcPointCloudRenderer";
import type {
  CesiumCopcPointGeometryWorkerLoadRequest,
  CesiumCopcPointGeometryWorkerPrefetchRequest,
  CesiumCopcPointGeometryWorkerRequest,
  CesiumCopcPointGeometryWorkerResponse,
} from "./CesiumCopcPointGeometryWorkerProtocol";
import {
  createNodePointSampleBatchKey,
  createPointGeometryBatchFromSerializableTransform,
} from "./pointGeometryBatch";

interface WorkerCopcSource {
  readonly getter: Getter;
  readonly copc: Promise<CopcData>;
  readonly decodedNodeViews: Map<string, WorkerDecodedNodeViewEntry>;
  decodedNodeViewBytes: number;
}

interface WorkerDecodedNodeViewEntry {
  readonly view: Promise<CopcPointDataView>;
  readonly estimatedByteSize: number;
}

interface WorkerPointDataViewResult {
  readonly view: CopcPointDataView;
  readonly cacheHit: boolean;
}

interface WorkerDecodedNodeViewCacheLimits {
  readonly maxDecodedNodeViewCount: number;
  readonly maxDecodedNodeViewBytes: number;
}

const CANCELED_REQUEST_TTL_MS = 60_000;
const DEFAULT_MAX_DECODED_NODE_VIEW_COUNT = 48;
const DEFAULT_MAX_DECODED_NODE_VIEW_BYTES = 192 * 1024 * 1024;
const copcSources = new Map<string, WorkerCopcSource>();
const canceledRequestIds = new Set<number>();
const workerScope = globalThis as unknown as {
  addEventListener(
    type: "message",
    listener: (event: {
      readonly data: CesiumCopcPointGeometryWorkerRequest;
    }) => void,
  ): void;
  postMessage(
    message: CesiumCopcPointGeometryWorkerResponse,
    transfer?: readonly Transferable[],
  ): void;
};

workerScope.addEventListener("message", (event) => {
  void handleRequest(event.data);
});

async function handleRequest(
  request: CesiumCopcPointGeometryWorkerRequest,
): Promise<void> {
  try {
    if (request.type === "warmup") {
      await getSharedLazPerf();

      const sourceDescriptor = readWorkerWarmupSource(request);
      if (sourceDescriptor) {
        await getWorkerCopcSource(sourceDescriptor).copc;
      }

      workerScope.postMessage({
        id: request.id,
        type: "warmup:success",
      });
      return;
    }

    if (request.type === "cancel") {
      rememberCanceledRequest(request.id);
      return;
    }

    if (isRequestCanceled(request.id)) {
      postCanceledResponse(request);
      return;
    }

    if (request.type === "prefetchNodePointData") {
      await handlePrefetchNodePointDataRequest(request);
      return;
    }

    const workerStartedAt = nowMilliseconds();
    const source = getWorkerCopcSource(readWorkerRequestSource(request));
    const pointDataViewStartedAt = nowMilliseconds();
    const pointDataView = await loadWorkerPointDataView(source, request);
    const pointDataViewEndedAt = nowMilliseconds();
    const sampleStartedAt = nowMilliseconds();
    const pointSamplesWithData = sampleCopcPointDataView({
      nodeKey: request.nodeKey,
      view: pointDataView.view,
      maxPointCount: request.maxPointCount,
      sampleFormat: "typed",
    });
    const sampleEndedAt = nowMilliseconds();

    if (isRequestCanceled(request.id)) {
      postCanceledResponse(request);
      return;
    }

    if (!pointSamplesWithData.pointData) {
      throw new Error("Typed COPC point data was not produced.");
    }

    const geometryStartedAt = nowMilliseconds();
    const geometryBatch = createPointGeometryBatchFromSerializableTransform({
      key: createNodePointSampleBatchKey(pointSamplesWithData),
      pointData: pointSamplesWithData.pointData,
      transform: request.transform,
    });
    const geometryEndedAt = nowMilliseconds();
    const pointSamples = stripTransferOnlyPointData(pointSamplesWithData);

    if (isRequestCanceled(request.id)) {
      postCanceledResponse(request);
      return;
    }

    workerScope.postMessage(
      {
        id: request.id,
        type: "loadNodePointGeometry:success",
        result: {
          pointSamples,
          geometryBatch,
          timing: {
            pointDataViewMilliseconds: Math.max(
              0,
              pointDataViewEndedAt - pointDataViewStartedAt,
            ),
            pointDataViewCacheHit: pointDataView.cacheHit,
            sampleMilliseconds: Math.max(0, sampleEndedAt - sampleStartedAt),
            geometryMilliseconds: Math.max(
              0,
              geometryEndedAt - geometryStartedAt,
            ),
            workerTotalMilliseconds: Math.max(
              0,
              geometryEndedAt - workerStartedAt,
            ),
          },
        },
      },
      getPointGeometryBatchTransferables(geometryBatch),
    );
  } catch (error) {
    if (request.type === "warmup") {
      workerScope.postMessage({
        id: request.id,
        type: "warmup:error",
        error: serializeError(error),
      });
      return;
    }

    if (request.type === "cancel") {
      return;
    }

    if (isRequestCanceled(request.id)) {
      postCanceledResponse(request);
      return;
    }

    workerScope.postMessage({
      id: request.id,
      type:
        request.type === "prefetchNodePointData"
          ? "prefetchNodePointData:error"
          : "loadNodePointGeometry:error",
      error: serializeError(error),
    });
  }
}

async function handlePrefetchNodePointDataRequest(
  request: CesiumCopcPointGeometryWorkerPrefetchRequest,
): Promise<void> {
  const workerStartedAt = nowMilliseconds();
  const source = getWorkerCopcSource(readWorkerRequestSource(request));
  const pointDataViewStartedAt = nowMilliseconds();
  const pointDataView = await loadWorkerPointDataView(source, request);
  const pointDataViewEndedAt = nowMilliseconds();

  if (isRequestCanceled(request.id)) {
    postCanceledResponse(request);
    return;
  }

  workerScope.postMessage({
    id: request.id,
    type: "prefetchNodePointData:success",
    result: {
      nodeKey: request.nodeKey,
      timing: {
        pointDataViewMilliseconds: Math.max(
          0,
          pointDataViewEndedAt - pointDataViewStartedAt,
        ),
        pointDataViewCacheHit: pointDataView.cacheHit,
        workerTotalMilliseconds: Math.max(
          0,
          pointDataViewEndedAt - workerStartedAt,
        ),
      },
    },
  });
}

function rememberCanceledRequest(id: number): void {
  canceledRequestIds.add(id);
  setTimeout(() => {
    canceledRequestIds.delete(id);
  }, CANCELED_REQUEST_TTL_MS);
}

function isRequestCanceled(id: number): boolean {
  return canceledRequestIds.has(id);
}

function postCanceledResponse(
  request: CesiumCopcPointGeometryWorkerLoadRequest |
    CesiumCopcPointGeometryWorkerPrefetchRequest,
): void {
  canceledRequestIds.delete(request.id);
  workerScope.postMessage({
    id: request.id,
    type:
      request.type === "prefetchNodePointData"
        ? "prefetchNodePointData:canceled"
        : "loadNodePointGeometry:canceled",
  });
}

function stripTransferOnlyPointData(
  result: CopcNodePointSampleResult,
): CopcNodePointSampleResult {
  return {
    nodeKey: result.nodeKey,
    nodePointCount: result.nodePointCount,
    sampledPointCount: result.sampledPointCount,
    points: [],
  };
}

function getPointGeometryBatchTransferables(
  batch: PointGeometryBatch,
): Transferable[] {
  const transferables: Transferable[] = [];
  addTransferableBuffer(transferables, batch.positions.buffer);
  addTransferableBuffer(transferables, batch.colors.buffer);
  return transferables;
}

function addTransferableBuffer(
  transferables: Transferable[],
  buffer: ArrayBufferLike,
): void {
  if (buffer instanceof ArrayBuffer) {
    transferables.push(buffer);
  }
}

function getWorkerCopcSource(
  descriptor: CopcSourceDescriptor,
): WorkerCopcSource {
  let source = copcSources.get(descriptor.key);

  if (!source) {
    const getter = createCopcRangeGetter(descriptor.input);
    source = {
      getter,
      copc: Copc.create(getter),
      decodedNodeViews: new Map(),
      decodedNodeViewBytes: 0,
    };
    copcSources.set(descriptor.key, source);
  }

  return source;
}

function readWorkerRequestSource(
  request:
    | CesiumCopcPointGeometryWorkerLoadRequest
    | CesiumCopcPointGeometryWorkerPrefetchRequest,
): CopcSourceDescriptor {
  if (request.source) {
    return request.source;
  }

  if (request.url) {
    return createCopcSourceDescriptor(request.url);
  }

  throw new Error("COPC point geometry worker requests require a source or url.");
}

function readWorkerWarmupSource(request: {
  readonly source?: CopcSourceDescriptor;
  readonly url?: string;
}): CopcSourceDescriptor | undefined {
  if (request.source) {
    return request.source;
  }

  if (request.url) {
    return createCopcSourceDescriptor(request.url);
  }

  return undefined;
}

async function loadWorkerPointDataView(
  source: WorkerCopcSource,
  request:
    | CesiumCopcPointGeometryWorkerLoadRequest
    | CesiumCopcPointGeometryWorkerPrefetchRequest,
): Promise<WorkerPointDataViewResult> {
  const cached = source.decodedNodeViews.get(request.nodeKey);

  if (cached) {
    touchDecodedNodeView(source, request.nodeKey, cached);
    return {
      view: await cached.view,
      cacheHit: true,
    };
  }

  const copc = await source.copc;
  const estimatedByteSize =
    request.node.pointCount * copc.header.pointDataRecordLength;
  const view = loadCopcNodePointDataView({
    getter: source.getter,
    copc,
    node: request.node,
  }).catch((error: unknown) => {
    const existing = source.decodedNodeViews.get(request.nodeKey);

    if (existing?.view === view) {
      deleteDecodedNodeView(source, request.nodeKey, existing);
    }

    throw error;
  });
  const entry = {
    view,
    estimatedByteSize,
  };

  source.decodedNodeViews.set(request.nodeKey, entry);
  source.decodedNodeViewBytes += estimatedByteSize;
  evictDecodedNodeViewsIfNeeded(
    source,
    readDecodedNodeViewCacheLimits(request),
  );
  return {
    view: await view,
    cacheHit: false,
  };
}

function nowMilliseconds(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function touchDecodedNodeView(
  source: WorkerCopcSource,
  nodeKey: string,
  entry: WorkerDecodedNodeViewEntry,
): void {
  source.decodedNodeViews.delete(nodeKey);
  source.decodedNodeViews.set(nodeKey, entry);
}

function readDecodedNodeViewCacheLimits(
  request:
    | CesiumCopcPointGeometryWorkerLoadRequest
    | CesiumCopcPointGeometryWorkerPrefetchRequest,
): WorkerDecodedNodeViewCacheLimits {
  return {
    maxDecodedNodeViewCount:
      request.maxDecodedPointDataViews ?? DEFAULT_MAX_DECODED_NODE_VIEW_COUNT,
    maxDecodedNodeViewBytes:
      request.maxDecodedPointDataViewBytes ??
      DEFAULT_MAX_DECODED_NODE_VIEW_BYTES,
  };
}

function evictDecodedNodeViewsIfNeeded(
  source: WorkerCopcSource,
  limits: WorkerDecodedNodeViewCacheLimits,
): void {
  while (
    source.decodedNodeViews.size > limits.maxDecodedNodeViewCount ||
    source.decodedNodeViewBytes > limits.maxDecodedNodeViewBytes
  ) {
    const oldestNodeKey = source.decodedNodeViews.keys().next().value;

    if (!oldestNodeKey) {
      return;
    }

    const oldestEntry = source.decodedNodeViews.get(oldestNodeKey);

    if (!oldestEntry) {
      source.decodedNodeViews.delete(oldestNodeKey);
      continue;
    }

    deleteDecodedNodeView(source, oldestNodeKey, oldestEntry);
  }
}

function deleteDecodedNodeView(
  source: WorkerCopcSource,
  nodeKey: string,
  entry: WorkerDecodedNodeViewEntry,
): void {
  source.decodedNodeViews.delete(nodeKey);
  source.decodedNodeViewBytes = Math.max(
    0,
    source.decodedNodeViewBytes - entry.estimatedByteSize,
  );
}

function serializeError(error: unknown): {
  readonly name?: string;
  readonly message: string;
  readonly stack?: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}
