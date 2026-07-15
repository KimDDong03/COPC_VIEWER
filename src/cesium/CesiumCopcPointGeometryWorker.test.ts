import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CesiumCopcPointGeometryWorkerLoadRequest,
  CesiumCopcPointGeometryWorkerRequest,
  CesiumCopcPointGeometryWorkerResponse,
} from "./CesiumCopcPointGeometryWorkerProtocol";

const mocks = vi.hoisted(() => ({
  createHttpRangeGetter: vi.fn(() => async () => new Uint8Array()),
  createCopc: vi.fn(async () => ({
    header: {
      pointDataRecordLength: 16,
    },
  })),
  getSharedLazPerf: vi.fn(async () => undefined),
  loadCopcNodePointDataView: vi.fn(async (options: {
    readonly node: { readonly pointCount: number };
  }) => ({
    pointCount: options.node.pointCount,
    dimensions: {
      X: {},
      Y: {},
      Z: {},
    },
    getter: () => (index: number) => index,
  })),
  sampleCopcPointDataView: vi.fn((options: {
    readonly nodeKey: string;
    readonly view: { readonly pointCount: number };
    readonly maxPointCount: number;
  }) => {
    const sampledPointCount = Math.min(
      options.view.pointCount,
      options.maxPointCount,
    );

    return {
      nodeKey: options.nodeKey,
      nodePointCount: options.view.pointCount,
      sampledPointCount,
      points: [],
      pointData: {
        x: new Float64Array(sampledPointCount),
        y: new Float64Array(sampledPointCount),
        z: new Float64Array(sampledPointCount),
        red: new Uint8Array(sampledPointCount),
        green: new Uint8Array(sampledPointCount),
        blue: new Uint8Array(sampledPointCount),
      },
    };
  }),
  createNodePointSampleBatchKey: vi.fn((sample: { readonly nodeKey: string }) =>
    sample.nodeKey
  ),
  createPointGeometryBatchFromSerializableTransform: vi.fn((options: {
    readonly key: string;
    readonly pointData: { readonly x: Float64Array };
  }) => ({
    key: options.key,
    pointCount: options.pointData.x.length,
    positions: new Float64Array(options.pointData.x.length * 3),
    colors: new Uint8Array(options.pointData.x.length * 4),
  })),
}));

vi.mock("copc", () => ({
  Copc: {
    create: mocks.createCopc,
  },
}));

vi.mock("../core/copc/createHttpRangeGetter", () => ({
  createHttpRangeGetter: mocks.createHttpRangeGetter,
}));

vi.mock("../core/copc/createLazPerf", () => ({
  getSharedLazPerf: mocks.getSharedLazPerf,
}));

vi.mock("../core/copc/loadCopcNodePointSamples", () => ({
  loadCopcNodePointDataView: mocks.loadCopcNodePointDataView,
  sampleCopcPointDataView: mocks.sampleCopcPointDataView,
}));

vi.mock("./pointGeometryBatch", () => ({
  createNodePointSampleBatchKey: mocks.createNodePointSampleBatchKey,
  createPointGeometryBatchFromSerializableTransform:
    mocks.createPointGeometryBatchFromSerializableTransform,
}));

describe("CesiumCopcPointGeometryWorker decoded point data cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("opens the COPC source during source-aware warmup", async () => {
    const worker = await importWorker();

    worker.dispatch({
      id: 1,
      type: "warmup",
      url: "https://example.com/sample.copc.laz",
    });
    await worker.waitForMessageCount(1);
    worker.dispatch(createLoadRequest(2, "1-0-0-0", 100));
    await worker.waitForMessageCount(2);

    expect(mocks.getSharedLazPerf).toHaveBeenCalled();
    expect(mocks.createCopc).toHaveBeenCalledTimes(1);
    expect(worker.messages.map((message) => message.type)).toEqual([
      "warmup:success",
      "loadNodePointGeometry:success",
    ]);
  });

  it("evicts decoded node views using the per-request cache limits", async () => {
    const worker = await importWorker();

    worker.dispatch({
      ...createLoadRequest(1, "1-0-0-0", 100),
      maxDecodedPointDataViews: 1,
    });
    await worker.waitForMessageCount(1);
    worker.dispatch({
      ...createLoadRequest(2, "1-1-0-0", 100),
      maxDecodedPointDataViews: 1,
    });
    await worker.waitForMessageCount(2);
    worker.dispatch({
      ...createLoadRequest(3, "1-0-0-0", 100),
      maxDecodedPointDataViews: 1,
    });
    await worker.waitForMessageCount(3);

    expect(mocks.loadCopcNodePointDataView).toHaveBeenCalledTimes(3);
    expect(worker.messages.map((message) => message.type)).toEqual([
      "loadNodePointGeometry:success",
      "loadNodePointGeometry:success",
      "loadNodePointGeometry:success",
    ]);
  });

  it("enforces one decoded-view LRU across COPC sources", async () => {
    const worker = await importWorker();

    worker.dispatch({
      ...createLoadRequest(1, "1-0-0-0", 100),
      url: "https://example.com/first.copc.laz",
      maxDecodedPointDataViews: 1,
    });
    await worker.waitForMessageCount(1);
    worker.dispatch({
      ...createLoadRequest(2, "1-0-0-0", 100),
      url: "https://example.com/second.copc.laz",
      maxDecodedPointDataViews: 1,
    });
    await worker.waitForMessageCount(2);
    worker.dispatch({
      ...createLoadRequest(3, "1-0-0-0", 100),
      url: "https://example.com/first.copc.laz",
      maxDecodedPointDataViews: 1,
    });
    await worker.waitForMessageCount(3);

    expect(mocks.loadCopcNodePointDataView).toHaveBeenCalledTimes(3);
    expect(worker.messages[1]).toMatchObject({
      cache: {
        retainedViewCount: 1,
        retainedBytes: 16_000,
        cacheEvictionCount: 1,
        evictedNodeKeys: [
          {
            sourceKey: "url:https://example.com/first.copc.laz",
            nodeKey: "1-0-0-0",
          },
        ],
      },
    });
  });

  it("serves oversized decoded views without retaining them", async () => {
    const worker = await importWorker();

    worker.dispatch({
      ...createLoadRequest(1, "1-0-0-0", 100),
      maxDecodedPointDataViewBytes: 15_999,
    });
    await worker.waitForMessageCount(1);
    worker.dispatch({
      ...createLoadRequest(2, "1-0-0-0", 100),
      maxDecodedPointDataViewBytes: 15_999,
    });
    await worker.waitForMessageCount(2);

    expect(mocks.loadCopcNodePointDataView).toHaveBeenCalledTimes(2);
    expect(worker.messages[1]).toMatchObject({
      type: "loadNodePointGeometry:success",
      cache: {
        retainedViewCount: 0,
        retainedBytes: 0,
        cacheMissCount: 2,
        oversizedEntrySkipCount: 2,
        requestedNodeRetained: false,
      },
    });
  });

  it("prefetches decoded node views without sampling or geometry payloads", async () => {
    const worker = await importWorker();

    worker.dispatch(createPrefetchRequest(1, "1-0-0-0"));
    await worker.waitForMessageCount(1);
    worker.dispatch(createLoadRequest(2, "1-0-0-0", 100));
    await worker.waitForMessageCount(2);

    expect(mocks.loadCopcNodePointDataView).toHaveBeenCalledTimes(1);
    expect(mocks.sampleCopcPointDataView).toHaveBeenCalledTimes(1);
    expect(
      mocks.createPointGeometryBatchFromSerializableTransform,
    ).toHaveBeenCalledTimes(1);
    expect(worker.messages[0]).toMatchObject({
      type: "prefetchNodePointData:success",
      result: {
        nodeKey: "1-0-0-0",
      },
      cache: {
        retainedViewCount: 1,
        cacheMissCount: 1,
        requestedNodeRetained: true,
      },
    });
    expect(worker.messages.map((message) => message.type)).toEqual([
      "prefetchNodePointData:success",
      "loadNodePointGeometry:success",
    ]);
  });

  it("reports evictions and rollback state when a decoded view fails", async () => {
    const worker = await importWorker();

    worker.dispatch({
      ...createLoadRequest(1, "1-0-0-0", 100),
      maxDecodedPointDataViews: 1,
    });
    await worker.waitForMessageCount(1);
    mocks.loadCopcNodePointDataView.mockRejectedValueOnce(
      new Error("decoded view failed"),
    );
    worker.dispatch({
      ...createLoadRequest(2, "1-1-0-0", 100),
      maxDecodedPointDataViews: 1,
    });
    await worker.waitForMessageCount(2);

    expect(worker.messages[1]).toMatchObject({
      type: "loadNodePointGeometry:error",
      cache: {
        retainedViewCount: 0,
        retainedBytes: 0,
        cacheMissCount: 2,
        cacheEvictionCount: 1,
        requestedNodeRetained: false,
        evictedNodeKeys: [
          {
            sourceKey: "url:https://example.com/sample.copc.laz",
            nodeKey: "1-0-0-0",
          },
        ],
      },
      error: {
        message: "decoded view failed",
      },
    });
  });

  it("reports retained cache state after an in-flight request is canceled", async () => {
    const worker = await importWorker();
    let resolveDecodedView!: (
      view: ReturnType<typeof createDecodedPointDataView>,
    ) => void;
    const pendingDecodedView = new Promise<
      ReturnType<typeof createDecodedPointDataView>
    >((resolve) => {
      resolveDecodedView = resolve;
    });

    worker.dispatch({
      ...createLoadRequest(1, "1-0-0-0", 100),
      maxDecodedPointDataViews: 1,
    });
    await worker.waitForMessageCount(1);
    mocks.loadCopcNodePointDataView.mockReturnValueOnce(pendingDecodedView);
    worker.dispatch({
      ...createLoadRequest(2, "1-1-0-0", 100),
      maxDecodedPointDataViews: 1,
    });
    worker.dispatch({ id: 2, type: "cancel" });
    resolveDecodedView(createDecodedPointDataView(1_000));
    await worker.waitForMessageCount(2);

    expect(worker.messages[1]).toMatchObject({
      type: "loadNodePointGeometry:canceled",
      cache: {
        retainedViewCount: 1,
        retainedBytes: 16_000,
        cacheEvictionCount: 1,
        requestedNodeRetained: true,
        evictedNodeKeys: [
          {
            sourceKey: "url:https://example.com/sample.copc.laz",
            nodeKey: "1-0-0-0",
          },
        ],
      },
    });
  });
});

function createDecodedPointDataView(pointCount: number) {
  return {
    pointCount,
    dimensions: {
      X: {},
      Y: {},
      Z: {},
    },
    getter: () => (index: number) => index,
  };
}

async function importWorker(): Promise<{
  readonly messages: CesiumCopcPointGeometryWorkerResponse[];
  dispatch(request: CesiumCopcPointGeometryWorkerRequest): void;
  waitForMessageCount(count: number): Promise<void>;
}> {
  let listener:
    | ((event: { readonly data: CesiumCopcPointGeometryWorkerRequest }) => void)
    | undefined;
  const messages: CesiumCopcPointGeometryWorkerResponse[] = [];

  vi.resetModules();
  vi.stubGlobal(
    "addEventListener",
    (
      type: string,
      nextListener: (
        event: { readonly data: CesiumCopcPointGeometryWorkerRequest },
      ) => void,
    ) => {
      if (type === "message") {
        listener = nextListener;
      }
    },
  );
  vi.stubGlobal("postMessage", (message: CesiumCopcPointGeometryWorkerResponse) => {
    messages.push(message);
  });

  await import("./CesiumCopcPointGeometryWorker");

  if (!listener) {
    throw new Error("Expected the worker message listener to be registered.");
  }

  return {
    messages,
    dispatch: (request) => {
      listener?.({ data: request });
    },
    waitForMessageCount: async (count) => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (messages.length >= count) {
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      throw new Error(`Timed out waiting for ${count} worker messages.`);
    },
  };
}

function createLoadRequest(
  id: number,
  nodeKey: string,
  maxPointCount: number,
): CesiumCopcPointGeometryWorkerLoadRequest {
  return {
    id,
    type: "loadNodePointGeometry",
    url: "https://example.com/sample.copc.laz",
    nodeKey,
    node: {
      pointCount: 1_000,
      pointDataOffset: 100,
      pointDataLength: 2_000,
    },
    maxPointCount,
    transform: {
      kind: "geographic",
      heightScaleToMeters: 1,
    },
  };
}

function createPrefetchRequest(
  id: number,
  nodeKey: string,
): CesiumCopcPointGeometryWorkerRequest {
  return {
    id,
    type: "prefetchNodePointData",
    url: "https://example.com/sample.copc.laz",
    nodeKey,
    node: {
      pointCount: 1_000,
      pointDataOffset: 100,
      pointDataLength: 2_000,
    },
  };
}
