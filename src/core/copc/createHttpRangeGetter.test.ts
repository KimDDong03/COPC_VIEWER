import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpRangeGetter } from "./createHttpRangeGetter";

describe("createHttpRangeGetter", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resolves browser-relative COPC URLs against the current page location", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2]), {
      headers: {
        "Content-Range": "bytes 10-11/100",
      },
      status: 206,
    }));
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter("/copc-samples/sample.copc.laz");
    const bytes = await getter(10, 12);

    expect([...bytes]).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/copc-samples/sample.copc.laz",
      {
        headers: {
          Range: "bytes=10-11",
        },
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("returns an empty buffer for valid zero-length range reads", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter("/copc-samples/sample.copc.laz");
    const bytes = await getter(0, 0);

    expect([...bytes]).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects ranges above the configured byte-length limit before fetching", async () => {
    const fetchMock = vi.fn(async () => new Response(
      new Uint8Array([1, 2, 3]),
      { status: 206 },
    ));
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter(
      "/copc-samples/sample.copc.laz",
      { maxRangeByteLength: 2 },
    );

    await expect(getter(10, 13)).rejects.toThrow(
      "COPC byte range length 3 exceeds the configured maximum of 2 bytes.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces the default 256 MiB range limit before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter("/copc-samples/sample.copc.laz");

    await expect(getter(0, 256 * 1024 * 1024 + 1)).rejects.toThrow(
      "COPC byte range length 268435457 exceeds the configured maximum of 268435456 bytes.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts a stalled HTTP range request at the configured deadline", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        requestSignal = init.signal as AbortSignal;
        requestSignal.addEventListener(
          "abort",
          () => reject(requestSignal?.reason),
          { once: true },
        );
      });
    });
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter(
      "/copc-samples/sample.copc.laz",
      { requestTimeoutMilliseconds: 25 },
    );
    const pending = getter(10, 12);
    const rejection = expect(pending).rejects.toThrow(
      "COPC range request timed out after 25 milliseconds.",
    );

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(requestSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the request deadline active while the response body is streaming", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(async (_: string, init: RequestInit) => {
      requestSignal = init.signal as AbortSignal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          requestSignal?.addEventListener(
            "abort",
            () => controller.error(requestSignal?.reason),
            { once: true },
          );
        },
      });

      return new Response(body, { status: 206 });
    });
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter(
      "/copc-samples/sample.copc.laz",
      { requestTimeoutMilliseconds: 25 },
    );
    const pending = getter(10, 12);
    const rejection = expect(pending).rejects.toThrow(
      "COPC range request timed out after 25 milliseconds.",
    );

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(requestSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("combines a caller signal without passing or mutating it as the timeout controller", async () => {
    const callerController = new AbortController();
    const callerError = new Error("caller canceled the source");
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        requestSignal = init.signal as AbortSignal;
        requestSignal.addEventListener(
          "abort",
          () => reject(requestSignal?.reason),
          { once: true },
        );
      });
    });
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter(
      "/copc-samples/sample.copc.laz",
      {
        requestTimeoutMilliseconds: 1_000,
        signal: callerController.signal,
      },
    );
    const pending = getter(10, 12);

    expect(requestSignal).not.toBe(callerController.signal);
    callerController.abort(callerError);
    await expect(pending).rejects.toBe(callerError);
    expect(requestSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves the timeout reason when the caller aborts after the deadline", async () => {
    vi.useFakeTimers();
    const callerController = new AbortController();
    const fetchMock = vi.fn((_: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const requestSignal = init.signal as AbortSignal;
        requestSignal.addEventListener(
          "abort",
          () => reject(requestSignal.reason),
          { once: true },
        );
      });
    });
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter(
      "/copc-samples/sample.copc.laz",
      {
        requestTimeoutMilliseconds: 25,
        signal: callerController.signal,
      },
    );
    const pending = getter(10, 12);
    const rejection = expect(pending).rejects.toThrow(
      "COPC range request timed out after 25 milliseconds.",
    );

    vi.advanceTimersByTime(25);
    callerController.abort(new Error("late caller cancellation"));
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid resource-limit options at construction", () => {
    expect(() => createHttpRangeGetter(
      "https://example.com/sample.copc.laz",
      { maxRangeByteLength: 0 },
    )).toThrow(
      "maxRangeByteLength must be a positive integer no greater than 9007199254740991.",
    );
    expect(() => createHttpRangeGetter(
      "https://example.com/sample.copc.laz",
      { requestTimeoutMilliseconds: 2_147_483_648 },
    )).toThrow(
      "requestTimeoutMilliseconds must be a positive integer no greater than 2147483647.",
    );
  });

  it("caches repeated exact HTTP byte range reads", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([7, 8]), {
      status: 206,
    }));
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter("/copc-samples/sample.copc.laz");
    const first = await getter(50, 52);
    first[0] = 99;
    const second = await getter(50, 52);

    expect([...second]).toEqual([7, 8]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries transient browser range fetch failures", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([3, 4]), {
          status: 206,
        }),
      );
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter("/copc-samples/sample.copc.laz");
    const bytes = await getter(20, 22);

    expect([...bytes]).toEqual([3, 4]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries retriable HTTP range failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([5, 6]), {
          status: 206,
        }),
      );
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter("/copc-samples/sample.copc.laz");
    const bytes = await getter(30, 32);

    expect([...bytes]).toEqual([5, 6]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retriable HTTP range failures", async () => {
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 404 }),
    );
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter("/copc-samples/missing.copc.laz");

    await expect(getter(40, 42)).rejects.toThrow(
      "COPC range request failed with HTTP 404.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects successful responses that do not use partial content", async () => {
    const fetchMock = vi.fn(
      async () => new Response(new Uint8Array([1, 2]), { status: 200 }),
    );
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter("/copc-samples/sample.copc.laz");

    await expect(getter(10, 12)).rejects.toThrow(
      "COPC source must support HTTP range requests.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed Content-Range headers", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2]), {
      headers: {
        "Content-Range": "bytes invalid",
      },
      status: 206,
    }));
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter("/copc-samples/sample.copc.laz");

    await expect(getter(10, 12)).rejects.toThrow(
      "COPC range response has malformed Content-Range: bytes invalid.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects Content-Range headers that do not match the requested range", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2]), {
      headers: {
        "Content-Range": "bytes 11-12/100",
      },
      status: 206,
    }));
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter("/copc-samples/sample.copc.laz");

    await expect(getter(10, 12)).rejects.toThrow(
      "COPC range response Content-Range mismatch: expected bytes 10-11, received bytes 11-12.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects truncated range response bodies", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1]), {
      headers: {
        "Content-Range": "bytes 10-11/100",
      },
      status: 206,
    }));
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter("/copc-samples/sample.copc.laz");

    await expect(getter(10, 12)).rejects.toThrow(
      "COPC range response body length mismatch: expected 2 bytes, received 1.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized range response bodies without accepting extra bytes", async () => {
    const fetchMock = vi.fn(async () => new Response(
      new Uint8Array([1, 2, 3]),
      { status: 206 },
    ));
    vi.stubGlobal("location", { href: "http://localhost:3000/viewer/" });
    vi.stubGlobal("fetch", fetchMock);

    const getter = createHttpRangeGetter("/copc-samples/sample.copc.laz");

    await expect(getter(10, 12)).rejects.toThrow(
      "COPC range response body length mismatch: expected 2 bytes, received 3.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
