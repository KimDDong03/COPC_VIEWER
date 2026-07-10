import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CopcPointSampleWorkerLoadRequest,
  CopcPointSampleWorkerRequest,
  CopcPointSampleWorkerResponse,
} from "./CopcPointSampleWorkerProtocol";

const mocks = vi.hoisted(() => ({
  createHttpRangeGetter: vi.fn(() => async () => new Uint8Array()),
  createCopc: vi.fn(async () => ({
    header: {
      pointDataRecordLength: 16,
    },
  })),
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
    readonly sampleFormat?: string;
  }) => {
    const sampledPointCount = Math.min(
      options.view.pointCount,
      options.maxPointCount,
    );

    return {
      nodeKey: options.nodeKey,
      nodePointCount: options.view.pointCount,
      sampledPointCount,
      points: Array.from({ length: sampledPointCount }, (_value, index) => ({
        x: index,
        y: index,
        z: index,
      })),
    };
  }),
}));

vi.mock("copc", () => ({
  Copc: {
    create: mocks.createCopc,
  },
}));

vi.mock("./createHttpRangeGetter", () => ({
  createHttpRangeGetter: mocks.createHttpRangeGetter,
}));

vi.mock("./loadCopcNodePointSamples", () => ({
  loadCopcNodePointDataView: mocks.loadCopcNodePointDataView,
  sampleCopcPointDataView: mocks.sampleCopcPointDataView,
}));

describe("CopcPointSampleWorker decoded view cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("reuses a decoded node view for repeated sample requests", async () => {
    const worker = await importWorker();

    worker.dispatch(createLoadRequest(1, "1-0-0-0", 100));
    await worker.waitForMessageCount(1);
    worker.dispatch(createLoadRequest(2, "1-0-0-0", 500));
    await worker.waitForMessageCount(2);

    expect(mocks.loadCopcNodePointDataView).toHaveBeenCalledTimes(1);
    expect(mocks.sampleCopcPointDataView).toHaveBeenCalledTimes(2);
    expect(
      mocks.sampleCopcPointDataView.mock.calls.map(
        ([options]) => options.maxPointCount,
      ),
    ).toEqual([100, 500]);
    expect(worker.messages.map((message) => message.type)).toEqual([
      "loadNodePointSamples:success",
      "loadNodePointSamples:success",
    ]);
  });

  it("passes the requested sample format to the decoded view sampler", async () => {
    const worker = await importWorker();

    worker.dispatch({
      ...createLoadRequest(1, "1-0-0-0", 100),
      sampleFormat: "typed",
    });
    await worker.waitForMessageCount(1);

    expect(mocks.sampleCopcPointDataView).toHaveBeenCalledWith(
      expect.objectContaining({
        sampleFormat: "typed",
      }),
    );
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
      "loadNodePointSamples:success",
      "loadNodePointSamples:success",
      "loadNodePointSamples:success",
    ]);
  });
});

async function importWorker(): Promise<{
  readonly messages: CopcPointSampleWorkerResponse[];
  dispatch(request: CopcPointSampleWorkerRequest): void;
  waitForMessageCount(count: number): Promise<void>;
}> {
  let listener:
    | ((event: { readonly data: CopcPointSampleWorkerRequest }) => void)
    | undefined;
  const messages: CopcPointSampleWorkerResponse[] = [];

  vi.resetModules();
  vi.stubGlobal(
    "addEventListener",
    (
      type: string,
      nextListener: (
        event: { readonly data: CopcPointSampleWorkerRequest },
      ) => void,
    ) => {
      if (type === "message") {
        listener = nextListener;
      }
    },
  );
  vi.stubGlobal("postMessage", (message: CopcPointSampleWorkerResponse) => {
    messages.push(message);
  });

  await import("./CopcPointSampleWorker");

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
): CopcPointSampleWorkerLoadRequest {
  return {
    id,
    type: "loadNodePointSamples",
    url: "https://example.com/sample.copc.laz",
    nodeKey,
    node: {
      pointCount: 1_000,
      pointDataOffset: 100,
      pointDataLength: 2_000,
    },
    maxPointCount,
  };
}
