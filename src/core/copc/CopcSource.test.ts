import { describe, expect, it } from "vitest";
import type { Copc as CopcData, Hierarchy } from "copc";
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

  it("loads and merges additional hierarchy pages on demand", async () => {
    const source = new CopcSource("https://example.com/sample.copc.laz");
    const loadedPageOffsets: number[] = [];
    const mutableSource = source as unknown as {
      copcPromise: Promise<CopcData>;
      loadHierarchyPageData: (
        page: Hierarchy.Page,
      ) => Promise<Hierarchy.Subtree>;
    };

    mutableSource.copcPromise = Promise.resolve({
      info: {
        cube: [0, 0, 0, 8, 8, 8],
        rootHierarchyPage: { pageOffset: 10, pageLength: 20 },
      },
    } as CopcData);
    mutableSource.loadHierarchyPageData = async (page) => {
      loadedPageOffsets.push(page.pageOffset);

      if (page.pageOffset === 10) {
        return {
          nodes: {
            "0-0-0-0": createNode(100),
          },
          pages: {
            "1-0-0-0": { pageOffset: 30, pageLength: 40 },
          },
        };
      }

      return {
        nodes: {
          "1-0-0-0": createNode(50),
          "2-0-0-0": createNode(25),
        },
        pages: {
          "2-1-0-0": { pageOffset: 70, pageLength: 80 },
        },
      };
    };

    const rootHierarchy = await source.loadHierarchySummary();

    expect(rootHierarchy.nodes.map((node) => node.key)).toEqual(["0-0-0-0"]);
    expect(rootHierarchy.loadedPageCount).toBe(1);
    expect(rootHierarchy.pendingPageCount).toBe(1);
    expect(rootHierarchy.pageCount).toBe(1);
    expect(rootHierarchy.pendingPages).toEqual([
      expect.objectContaining({
        key: "1-0-0-0",
        depth: 1,
        x: 0,
        y: 0,
        z: 0,
        bounds: {
          minX: 0,
          minY: 0,
          minZ: 0,
          maxX: 4,
          maxY: 4,
          maxZ: 4,
        },
        pageOffset: 30,
        pageLength: 40,
      }),
    ]);

    const expandedHierarchy = await source.loadHierarchyPage("1-0-0-0");

    expect(loadedPageOffsets).toEqual([10, 30]);
    expect(expandedHierarchy.nodes.map((node) => node.key)).toEqual([
      "0-0-0-0",
      "1-0-0-0",
      "2-0-0-0",
    ]);
    expect(expandedHierarchy.loadedPageCount).toBe(2);
    expect(expandedHierarchy.pendingPageCount).toBe(1);
    expect(expandedHierarchy.pendingPages).toEqual([
      expect.objectContaining({
        key: "2-1-0-0",
        depth: 2,
        x: 1,
        y: 0,
        z: 0,
        bounds: {
          minX: 2,
          minY: 0,
          minZ: 0,
          maxX: 4,
          maxY: 2,
          maxZ: 2,
        },
        pageOffset: 70,
        pageLength: 80,
      }),
    ]);
  });
});

function createNode(pointCount: number): Hierarchy.Node {
  return {
    pointCount,
    pointDataOffset: pointCount,
    pointDataLength: pointCount * 10,
  };
}
