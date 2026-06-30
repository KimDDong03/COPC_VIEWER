import { describe, expect, it } from "vitest";
import { CopcSource } from "./CopcSource";
import type { CopcNodePointSampleResult } from "./CopcPointDataSample";

describe("CopcSource point sample cache", () => {
  it("reports cache hits and misses for sampled hierarchy nodes", async () => {
    const source = new CopcSource("https://example.com/sample.copc.laz");
    const mutableSource = source as unknown as {
      loadNodePointSamplesWithoutCache: (
        nodeKey: string,
        maxPointCount: number,
      ) => Promise<CopcNodePointSampleResult>;
    };
    let loadCount = 0;

    mutableSource.loadNodePointSamplesWithoutCache = async (
      nodeKey,
      maxPointCount,
    ) => {
      loadCount += 1;

      return {
        nodeKey,
        nodePointCount: 10,
        sampledPointCount: maxPointCount,
        points: [],
      };
    };

    await source.loadNodePointSamples({
      nodeKey: "0-0-0-0",
      maxPointCount: 5,
    });
    await source.loadNodePointSamples({
      nodeKey: "0-0-0-0",
      maxPointCount: 5,
    });
    await source.loadNodePointSamples({
      nodeKey: "0-0-0-0",
      maxPointCount: 6,
    });

    expect(loadCount).toBe(2);
    expect(source.getPointSampleCacheStats()).toEqual({
      cachedSampleSetCount: 2,
      cacheHitCount: 1,
      cacheMissCount: 2,
    });
  });
});
