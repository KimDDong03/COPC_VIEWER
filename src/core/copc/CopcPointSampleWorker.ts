import { Copc } from "copc";
import type { Copc as CopcData, Getter } from "copc";
import {
  createCopcRangeGetter,
  createCopcSourceDescriptor,
  type CopcSourceDescriptor,
} from "./createCopcRangeGetter";
import {
  loadCopcNodePointDataView,
  sampleCopcPointDataView,
  type CopcPointDataView,
} from "./loadCopcNodePointSamples";
import type {
  CopcPointSampleWorkerRequest,
  CopcPointSampleWorkerResponse,
} from "./CopcPointSampleWorkerProtocol";
import type { CopcNodePointSampleResult } from "./CopcPointDataSample";

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
    listener: (event: { readonly data: CopcPointSampleWorkerRequest }) => void,
  ): void;
  postMessage(
    message: CopcPointSampleWorkerResponse,
    transfer?: readonly Transferable[],
  ): void;
};

workerScope.addEventListener("message", (event) => {
  void handleRequest(event.data);
});

async function handleRequest(
  request: CopcPointSampleWorkerRequest,
): Promise<void> {
  try {
    if (request.type === "cancel") {
      canceledRequestIds.add(request.id);
      setTimeout(() => {
        canceledRequestIds.delete(request.id);
      }, CANCELED_REQUEST_TTL_MS);
      return;
    }

    if (canceledRequestIds.has(request.id)) {
      return;
    }

    const source = getWorkerCopcSource(readWorkerRequestSource(request));
    const view = await loadWorkerPointDataView(source, request);
    const result = sampleCopcPointDataView({
      nodeKey: request.nodeKey,
      view,
      maxPointCount: request.maxPointCount,
      sampleFormat: request.sampleFormat,
    });

    if (canceledRequestIds.delete(request.id)) {
      return;
    }

    workerScope.postMessage(
      {
        id: request.id,
        type: "loadNodePointSamples:success",
        result,
      },
      getPointSampleResultTransferables(result),
    );
  } catch (error) {
    if (canceledRequestIds.delete(request.id)) {
      return;
    }

    workerScope.postMessage({
      id: request.id,
      type: "loadNodePointSamples:error",
      error: serializeError(error),
    });
  }
}

function getPointSampleResultTransferables(
  result: CopcNodePointSampleResult,
): Transferable[] {
  const transferables: Transferable[] = [];
  const { pointData } = result;

  if (!pointData) {
    return transferables;
  }

  addTransferableBuffer(transferables, pointData.x.buffer);
  addTransferableBuffer(transferables, pointData.y.buffer);
  addTransferableBuffer(transferables, pointData.z.buffer);

  if (pointData.red) {
    addTransferableBuffer(transferables, pointData.red.buffer);
  }

  if (pointData.green) {
    addTransferableBuffer(transferables, pointData.green.buffer);
  }

  if (pointData.blue) {
    addTransferableBuffer(transferables, pointData.blue.buffer);
  }

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
  request: Exclude<CopcPointSampleWorkerRequest, { readonly type: "cancel" }>,
): CopcSourceDescriptor {
  if (request.source) {
    return request.source;
  }

  if (request.url) {
    return createCopcSourceDescriptor(request.url);
  }

  throw new Error("COPC point sample worker requests require a source or url.");
}

async function loadWorkerPointDataView(
  source: WorkerCopcSource,
  request: Exclude<CopcPointSampleWorkerRequest, { readonly type: "cancel" }>,
): Promise<CopcPointDataView> {
  const cached = source.decodedNodeViews.get(request.nodeKey);

  if (cached) {
    touchDecodedNodeView(source, request.nodeKey, cached);
    return cached.view;
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
  return view;
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
  request: Exclude<CopcPointSampleWorkerRequest, { readonly type: "cancel" }>,
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
