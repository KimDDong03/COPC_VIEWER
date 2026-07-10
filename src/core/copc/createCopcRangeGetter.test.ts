import { describe, expect, it } from "vitest";
import {
  createCopcRangeGetter,
  createCopcSourceDescriptor,
  createCopcSourceLabel,
} from "./createCopcRangeGetter";

describe("createCopcRangeGetter", () => {
  it("reads byte ranges directly from a Blob source", async () => {
    const blob = new Blob([new Uint8Array([0, 1, 2, 3, 4, 5])]);
    const getter = createCopcRangeGetter(blob);

    await expect(getter(2, 5)).resolves.toEqual(new Uint8Array([2, 3, 4]));
    await expect(getter(3, 3)).resolves.toEqual(new Uint8Array());
  });

  it("caches repeated exact Blob byte range reads", async () => {
    class CountingBlob extends Blob {
      sliceCount = 0;

      override slice(start?: number, end?: number, contentType?: string): Blob {
        this.sliceCount += 1;
        return super.slice(start, end, contentType);
      }
    }

    const blob = new CountingBlob([new Uint8Array([0, 1, 2, 3, 4, 5])]);
    const getter = createCopcRangeGetter(blob);
    const first = await getter(2, 5);
    first[0] = 99;
    const second = await getter(2, 5);

    expect([...second]).toEqual([2, 3, 4]);
    expect(blob.sliceCount).toBe(1);
  });

  it("creates stable URL keys and unique Blob keys", () => {
    const firstUrl = createCopcSourceDescriptor("https://example.com/a.copc.laz");
    const secondUrl = createCopcSourceDescriptor("https://example.com/a.copc.laz");
    const firstBlob = createCopcSourceDescriptor(new Blob([]));
    const secondBlob = createCopcSourceDescriptor(new Blob([]));

    expect(firstUrl.key).toBe(secondUrl.key);
    expect(firstBlob.key).not.toBe(secondBlob.key);
  });

  it("uses File-like Blob names as display labels", () => {
    const blob = new Blob([]) as Blob & { name: string };
    Object.defineProperty(blob, "name", {
      value: "sample.copc.laz",
    });

    expect(createCopcSourceLabel(blob)).toBe("sample.copc.laz");
  });
});
