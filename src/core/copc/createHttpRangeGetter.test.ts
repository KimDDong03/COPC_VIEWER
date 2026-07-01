import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpRangeGetter } from "./createHttpRangeGetter";

describe("createHttpRangeGetter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves browser-relative COPC URLs against the current page location", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2]), {
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
      },
    );
  });
});
