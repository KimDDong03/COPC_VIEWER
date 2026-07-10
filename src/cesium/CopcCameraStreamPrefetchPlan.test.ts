import { describe, expect, it } from "vitest";
import {
  createCopcCameraStreamPrefetchNodeKeys,
  createCopcCameraStreamPrefetchPlan,
  createCopcCameraStreamPrefetchSelectionPlan,
} from "./CopcCameraStreamPrefetchPlan";

describe("camera stream prefetch planning", () => {
  it("prefetches selected detail nodes before coverage fallback", () => {
    expect(
      createCopcCameraStreamPrefetchNodeKeys({
        selectedNodeKeys: ["5-8-0-0", "5-9-0-0"],
        coverageNodeKeys: ["0-0-0-0", "1-0-0-0"],
        hasUsableNodeSample: () => false,
        maxNodeCount: 8,
      }),
    ).toEqual(["5-8-0-0", "5-9-0-0"]);
  });

  it("prefetches current-view priority nodes before deeper future detail", () => {
    expect(
      createCopcCameraStreamPrefetchNodeKeys({
        priorityNodeKeys: ["5-8-0-0", "5-9-0-0"],
        selectedNodeKeys: ["6-16-0-0", "6-17-0-0", "6-18-0-0"],
        coverageNodeKeys: ["0-0-0-0", "1-0-0-0"],
        hasUsableNodeSample: () => false,
        maxNodeCount: 3,
      }),
    ).toEqual(["5-8-0-0", "5-9-0-0", "6-16-0-0"]);
  });

  it("prioritizes source-point-heavy prefetch nodes within progressive coverage", () => {
    expect(
      createCopcCameraStreamPrefetchNodeKeys({
        selectedNodeKeys: ["6-16-0-0", "6-17-0-0"],
        coverageNodeKeys: [],
        priorityNodeKeys: ["5-8-0-0", "5-9-0-0", "5-10-0-0"],
        nodeWeights: [
          { nodeKey: "5-8-0-0", weight: 10 },
          { nodeKey: "5-9-0-0", weight: 90 },
          { nodeKey: "5-10-0-0", weight: 40 },
        ],
        hasUsableNodeSample: () => false,
        maxNodeCount: 3,
      }),
    ).toEqual(["5-9-0-0", "5-10-0-0", "5-8-0-0"]);
  });

  it("uses coverage nodes when no selected detail node exists", () => {
    expect(
      createCopcCameraStreamPrefetchNodeKeys({
        selectedNodeKeys: [],
        coverageNodeKeys: ["0-0-0-0", "1-0-0-0"],
        hasUsableNodeSample: () => false,
        maxNodeCount: 8,
      }),
    ).toEqual(["1-0-0-0"]);
  });

  it("skips nodes that already have usable samples", () => {
    expect(
      createCopcCameraStreamPrefetchNodeKeys({
        selectedNodeKeys: ["5-8-0-0", "5-9-0-0", "5-10-0-0"],
        coverageNodeKeys: [],
        hasUsableNodeSample: (nodeKey) => nodeKey === "5-9-0-0",
        maxNodeCount: 8,
      }),
    ).toEqual(["5-8-0-0", "5-10-0-0"]);
  });

  it("limits nodes while distributing across spatial buckets", () => {
    expect(
      createCopcCameraStreamPrefetchNodeKeys({
        selectedNodeKeys: [
          "4-0-0-0",
          "4-1-0-0",
          "4-4-0-0",
          "4-5-0-0",
        ],
        coverageNodeKeys: [],
        hasUsableNodeSample: () => false,
        maxNodeCount: 2,
      }),
    ).toEqual(["4-0-0-0", "4-5-0-0"]);
  });

  it("returns no nodes for invalid limits or fully cached candidates", () => {
    expect(
      createCopcCameraStreamPrefetchNodeKeys({
        selectedNodeKeys: ["5-8-0-0"],
        coverageNodeKeys: [],
        hasUsableNodeSample: () => false,
        maxNodeCount: 0,
      }),
    ).toEqual([]);

    expect(
      createCopcCameraStreamPrefetchNodeKeys({
        selectedNodeKeys: ["5-8-0-0"],
        coverageNodeKeys: [],
        hasUsableNodeSample: () => true,
        maxNodeCount: 8,
      }),
    ).toEqual([]);
  });

  it("builds denser camera selection options for background prefetch", () => {
    expect(
      createCopcCameraStreamPrefetchSelectionPlan({
        lodSettings: {
          maxDepth: 5,
          maxNodes: 48,
          targetNodeScreenPixels: 80,
          targetPointSpacingScreenPixels: 4,
        },
        maxNodeCount: 96,
        maxNodePointCount: 120_000,
        maxNodePointDataLength: 2 * 1024 * 1024,
        maxTotalPointCount: 480_000,
        maxTotalPointDataLength: 16 * 1024 * 1024,
      }),
    ).toEqual({
      selectionMode: "coverage",
      coverageMode: "progressive",
      maxNodes: 96,
      maxDepth: 6,
      maxNodePointCount: 120_000,
      maxNodePointDataLength: 2 * 1024 * 1024,
      maxTotalPointCount: 480_000,
      maxTotalPointDataLength: 16 * 1024 * 1024,
      targetNodeScreenPixels: 48,
      targetPointSpacingScreenPixels: 2.4,
    });
  });

  it("keeps prefetch target floors when the foreground LOD is already dense", () => {
    const plan = createCopcCameraStreamPrefetchSelectionPlan({
      lodSettings: {
        maxDepth: 6,
        maxNodes: 128,
        targetNodeScreenPixels: 32,
        targetPointSpacingScreenPixels: 1.5,
      },
      maxNodeCount: 96,
      maxNodePointCount: 120_000,
      maxNodePointDataLength: 2 * 1024 * 1024,
      maxTotalPointCount: 480_000,
      maxTotalPointDataLength: 16 * 1024 * 1024,
    });

    expect(plan.maxNodes).toBe(128);
    expect(plan.maxDepth).toBe(7);
    expect(plan.targetNodeScreenPixels).toBe(24);
    expect(plan.targetPointSpacingScreenPixels).toBe(1);
  });

  it("can build a same-LOD prefetch plan for current-view cache warming", () => {
    expect(
      createCopcCameraStreamPrefetchSelectionPlan({
        lodSettings: {
          maxDepth: 5,
          maxNodes: 96,
          targetNodeScreenPixels: 80,
          targetPointSpacingScreenPixels: 4,
        },
        maxDepthOffset: 0,
        maxNodeCount: 96,
        maxNodePointCount: 120_000,
        maxNodePointDataLength: 2 * 1024 * 1024,
        maxTotalPointCount: 480_000,
        maxTotalPointDataLength: 16 * 1024 * 1024,
        targetNodeScreenPixelRatio: 1,
        targetPointSpacingScreenPixelRatio: 1,
      }),
    ).toEqual({
      selectionMode: "coverage",
      coverageMode: "progressive",
      maxNodes: 96,
      maxDepth: 5,
      maxNodePointCount: 120_000,
      maxNodePointDataLength: 2 * 1024 * 1024,
      maxTotalPointCount: 480_000,
      maxTotalPointDataLength: 16 * 1024 * 1024,
      targetNodeScreenPixels: 80,
      targetPointSpacingScreenPixels: 4,
    });
  });

  it("builds a reusable prefetch plan with density-aware cache checks", () => {
    const cacheChecks: Array<[string, number]> = [];
    const plan = createCopcCameraStreamPrefetchPlan({
      selectedNodeKeys: ["5-8-0-0", "5-9-0-0"],
      coverageNodeKeys: ["0-0-0-0", "1-0-0-0"],
      maxNodeCount: 4,
      basePointCountPerNode: 1_000,
      baseMaxRenderedPointCount: 8_000,
      lodSettings: {
        maxNodePointCount: 20_000,
        maxRenderedPointCount: 100_000,
        targetPointSpacingScreenPixels: 2,
      },
      hasUsableNodeSample: (nodeKey, maxPointCountPerNode) => {
        cacheChecks.push([nodeKey, maxPointCountPerNode]);
        return nodeKey === "5-9-0-0";
      },
    });

    expect(cacheChecks).toEqual([
      ["5-8-0-0", 2_000],
      ["5-9-0-0", 2_000],
    ]);
    expect(plan).toEqual({
      shouldPrefetch: true,
      prefetchNodeKeys: ["5-8-0-0"],
      maxPointCountPerNode: 2_000,
      maxRenderedPointCount: 2_000,
      progressBatchNodeCount: 1,
    });
  });

  it("can enforce a minimum prefetch density when a caller requests it", () => {
    const cacheChecks: Array<[string, number]> = [];
    const plan = createCopcCameraStreamPrefetchPlan({
      selectedNodeKeys: ["5-8-0-0", "5-9-0-0", "5-10-0-0"],
      coverageNodeKeys: [],
      maxNodeCount: 4,
      basePointCountPerNode: 1_000,
      baseMaxRenderedPointCount: 2_000,
      minPointCountPerNode: 2_500,
      lodSettings: {
        maxNodePointCount: 20_000,
        maxRenderedPointCount: 9_000,
        targetPointSpacingScreenPixels: 4,
      },
      hasUsableNodeSample: (_nodeKey, maxPointCountPerNode) => {
        cacheChecks.push([_nodeKey, maxPointCountPerNode]);
        return false;
      },
    });

    expect(cacheChecks).toEqual([
      ["5-8-0-0", 2_500],
      ["5-9-0-0", 2_500],
      ["5-10-0-0", 2_500],
    ]);
    expect(plan).toEqual({
      shouldPrefetch: true,
      prefetchNodeKeys: ["5-8-0-0", "5-9-0-0", "5-10-0-0"],
      maxPointCountPerNode: 2_500,
      maxRenderedPointCount: 7_500,
      progressBatchNodeCount: 1,
    });
  });

  it("passes current-view priority nodes through the reusable prefetch plan", () => {
    const plan = createCopcCameraStreamPrefetchPlan({
      priorityNodeKeys: ["5-8-0-0", "5-9-0-0"],
      selectedNodeKeys: ["6-16-0-0", "6-17-0-0"],
      coverageNodeKeys: [],
      maxNodeCount: 3,
      basePointCountPerNode: 1_000,
      baseMaxRenderedPointCount: 4_000,
      lodSettings: {
        maxNodePointCount: 20_000,
        maxRenderedPointCount: 40_000,
        targetPointSpacingScreenPixels: 2,
      },
      hasUsableNodeSample: (nodeKey) => nodeKey === "5-9-0-0",
    });

    expect(plan.prefetchNodeKeys).toEqual(["5-8-0-0", "6-16-0-0", "6-17-0-0"]);
    expect(plan.maxRenderedPointCount).toBe(6_000);
  });

  it("passes source-point weights through the reusable prefetch plan", () => {
    const plan = createCopcCameraStreamPrefetchPlan({
      selectedNodeKeys: ["5-8-0-0", "5-9-0-0", "5-10-0-0"],
      coverageNodeKeys: [],
      nodeWeights: [
        { nodeKey: "5-8-0-0", weight: 10 },
        { nodeKey: "5-9-0-0", weight: 90 },
        { nodeKey: "5-10-0-0", weight: 40 },
      ],
      maxNodeCount: 2,
      basePointCountPerNode: 1_000,
      baseMaxRenderedPointCount: 4_000,
      lodSettings: {
        maxNodePointCount: 20_000,
        maxRenderedPointCount: 40_000,
        targetPointSpacingScreenPixels: 2,
      },
      hasUsableNodeSample: () => false,
    });

    expect(plan.prefetchNodeKeys).toEqual(["5-9-0-0", "5-10-0-0"]);
  });

  it("returns an empty prefetch plan when every candidate already has usable samples", () => {
    expect(
      createCopcCameraStreamPrefetchPlan({
        selectedNodeKeys: ["5-8-0-0"],
        coverageNodeKeys: [],
        maxNodeCount: 4,
        basePointCountPerNode: 1_000,
        baseMaxRenderedPointCount: 8_000,
        lodSettings: {
          maxNodePointCount: 20_000,
          maxRenderedPointCount: 100_000,
          targetPointSpacingScreenPixels: 2,
        },
        hasUsableNodeSample: () => true,
      }),
    ).toEqual({
      shouldPrefetch: false,
      prefetchNodeKeys: [],
      maxPointCountPerNode: 0,
      maxRenderedPointCount: 0,
      progressBatchNodeCount: 0,
    });
  });
});
