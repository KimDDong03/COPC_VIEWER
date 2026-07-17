import { describe, expect, it } from "vitest";
import { createCachedRangeGetter } from "./createCachedRangeGetter";

describe("createCachedRangeGetter", () => {
  it("coalesces concurrent exact range reads", async () => {
    let readCount = 0;
    let resolveRead: ((bytes: Uint8Array) => void) | undefined;
    const getter = createCachedRangeGetter(async () => {
      readCount += 1;
      return await new Promise<Uint8Array>((resolve) => {
        resolveRead = resolve;
      });
    });

    const first = getter(10, 12);
    const second = getter(10, 12);

    expect(readCount).toBe(1);
    resolveRead?.(new Uint8Array([1, 2]));

    await expect(first).resolves.toEqual(new Uint8Array([1, 2]));
    await expect(second).resolves.toEqual(new Uint8Array([1, 2]));
    expect(readCount).toBe(1);
  });

  it("returns copied cached bytes so callers cannot mutate the cache", async () => {
    let readCount = 0;
    const getter = createCachedRangeGetter(async () => {
      readCount += 1;
      return new Uint8Array([3, 4]);
    });

    const first = await getter(20, 22);
    first[0] = 99;
    const second = await getter(20, 22);

    expect([...second]).toEqual([3, 4]);
    expect(readCount).toBe(1);
  });

  it("serves cached subranges from larger cached ranges", async () => {
    let readCount = 0;
    const getter = createCachedRangeGetter(async () => {
      readCount += 1;
      return new Uint8Array([10, 11, 12, 13]);
    });

    await expect(getter(100, 104)).resolves.toEqual(
      new Uint8Array([10, 11, 12, 13]),
    );

    const subrange = await getter(101, 103);
    subrange[0] = 99;

    await expect(getter(101, 103)).resolves.toEqual(new Uint8Array([11, 12]));
    expect(readCount).toBe(1);
  });

  it("coalesces in-flight subrange reads from larger ranges", async () => {
    let readCount = 0;
    let resolveRead: ((bytes: Uint8Array) => void) | undefined;
    const getter = createCachedRangeGetter(async () => {
      readCount += 1;
      return await new Promise<Uint8Array>((resolve) => {
        resolveRead = resolve;
      });
    });

    const fullRange = getter(200, 204);
    const subrange = getter(201, 203);

    expect(readCount).toBe(1);
    resolveRead?.(new Uint8Array([20, 21, 22, 23]));

    await expect(fullRange).resolves.toEqual(new Uint8Array([20, 21, 22, 23]));
    await expect(subrange).resolves.toEqual(new Uint8Array([21, 22]));
    expect(readCount).toBe(1);
  });

  it("evicts least-recent exact ranges by byte budget", async () => {
    let readCount = 0;
    const getter = createCachedRangeGetter(
      async (begin) => {
        readCount += 1;
        return new Uint8Array([begin]);
      },
      {
        maxCachedRangeBytes: 2,
        maxCachedRangeCount: 8,
      },
    );

    await getter(1, 2);
    await getter(2, 3);
    await getter(3, 4);
    await getter(1, 2);

    expect(readCount).toBe(4);
  });

  it("does not cache failed reads", async () => {
    let readCount = 0;
    const getter = createCachedRangeGetter(async () => {
      readCount += 1;

      if (readCount === 1) {
        throw new Error("range failed");
      }

      return new Uint8Array([5]);
    });

    await expect(getter(30, 31)).rejects.toThrow("range failed");
    await expect(getter(30, 31)).resolves.toEqual(new Uint8Array([5]));
    expect(readCount).toBe(2);
  });
});
