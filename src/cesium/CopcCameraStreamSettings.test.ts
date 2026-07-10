import { describe, expect, it } from "vitest";
import {
  createCopcCameraStreamDetailCompletionSettings,
  createCopcCameraStreamLodSettings,
  createCopcCameraStreamPrefetchNodeCount,
  createCopcCameraStreamPrefetchSettings,
  createCopcCameraStreamPreviewPointCountPerNode,
  createCopcCameraStreamRuntimeSettings,
  type CopcCameraStreamLodQualitySettings,
} from "./CopcCameraStreamSettings";

const balancedQuality: CopcCameraStreamLodQualitySettings = {
  cameraStreamMaxRenderedPointCount: 360_000,
  cameraStreamMaxSourcePointCount: 900_000,
  cameraStreamMaxNodePointCount: 80_000,
  cameraStreamMaxPointDataLength: 16 * 1024 * 1024,
  cameraStreamMaxNodePointDataLength: 2 * 1024 * 1024,
  cameraStreamMaxNodes: 96,
  cameraStreamMaxDepth: 5,
  cameraStreamTargetNodeScreenPixels: 80,
  cameraStreamTargetPointSpacingScreenPixels: 4,
};

describe("createCopcCameraStreamLodSettings", () => {
  it("uses the overview profile when the camera is far away", () => {
    expect(
      createCopcCameraStreamLodSettings({
        cameraHeightMeters: 3_500,
        qualitySettings: balancedQuality,
      }),
    ).toEqual({
      label: "overview",
      cameraHeightMeters: 3_500,
      maxNodes: 96,
      maxDepth: 5,
      targetNodeScreenPixels: 80,
      targetPointSpacingScreenPixels: 4,
      maxRenderedPointCount: 360_000,
      maxSourcePointCount: 900_000,
      maxNodePointCount: 80_000,
      maxPointDataLength: 16 * 1024 * 1024,
      maxNodePointDataLength: 2 * 1024 * 1024,
      maxHierarchyPages: 3,
      detailMaxPointCountPerNode: 5_000,
      detailMinFinalNodeCount: 4,
      detailTargetPointCountPerNode: 5_000,
    });
  });

  it("raises near-camera total detail while capping oversized source nodes", () => {
    const lod = createCopcCameraStreamLodSettings({
      cameraHeightMeters: 300,
      qualitySettings: balancedQuality,
    });

    expect(lod).toEqual(
      expect.objectContaining({
        label: "near zoom",
        cameraHeightMeters: 300,
        maxNodes: 288,
        maxDepth: 6,
        targetNodeScreenPixels: 48,
        targetPointSpacingScreenPixels: 1.5,
        maxRenderedPointCount: 720_000,
        maxSourcePointCount: 1_800_000,
        maxNodePointCount: 28_000,
        maxPointDataLength: 32 * 1024 * 1024,
        maxNodePointDataLength: 734_003,
        maxHierarchyPages: 5,
        detailMaxPointCountPerNode: 3_000,
        detailMinFinalNodeCount: 16,
        detailTargetPointCountPerNode: 1_500,
      }),
    );
  });

  it("keeps close zoom at depth 5 while avoiding oversized tail nodes", () => {
    const lod = createCopcCameraStreamLodSettings({
      cameraHeightMeters: 650,
      qualitySettings: balancedQuality,
    });

    expect(lod).toEqual(
      expect.objectContaining({
        label: "close zoom",
        cameraHeightMeters: 650,
        maxNodes: 192,
        maxDepth: 5,
        targetNodeScreenPixels: 64,
        targetPointSpacingScreenPixels: 2.25,
        maxRenderedPointCount: 540_000,
        maxSourcePointCount: 1_350_000,
        maxNodePointCount: 44_000,
        maxPointDataLength: 24 * 1024 * 1024,
        maxNodePointDataLength: 1_153_433,
        maxHierarchyPages: 4,
        detailMaxPointCountPerNode: 6_500,
        detailMinFinalNodeCount: 12,
        detailTargetPointCountPerNode: 2_000,
      }),
    );
  });

  it("treats invalid camera heights as overview instead of overfetching", () => {
    const lod = createCopcCameraStreamLodSettings({
      cameraHeightMeters: Number.NaN,
      qualitySettings: balancedQuality,
    });

    expect(lod.label).toBe("overview");
    expect(lod.cameraHeightMeters).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("createCopcCameraStreamPrefetchSettings", () => {
  it("keeps overview prefetch at the base density", () => {
    expect(
      createCopcCameraStreamPrefetchSettings({
        nodeCount: 24,
        basePointCountPerNode: 2_000,
        baseMaxRenderedPointCount: 96_000,
        lodSettings: {
          maxNodePointCount: 80_000,
          maxRenderedPointCount: 360_000,
          targetPointSpacingScreenPixels: 4,
        },
      }),
    ).toEqual({
      maxPointCountPerNode: 2_000,
      maxRenderedPointCount: 48_000,
    });
  });

  it("raises prefetch density for closer LOD targets", () => {
    expect(
      createCopcCameraStreamPrefetchSettings({
        nodeCount: 24,
        basePointCountPerNode: 2_000,
        baseMaxRenderedPointCount: 96_000,
        lodSettings: {
          maxNodePointCount: 80_000,
          maxRenderedPointCount: 720_000,
          targetPointSpacingScreenPixels: 1.5,
        },
      }),
    ).toEqual({
      maxPointCountPerNode: 6_000,
      maxRenderedPointCount: 144_000,
    });
  });

  it("caps per-node density by the LOD node budget", () => {
    expect(
      createCopcCameraStreamPrefetchSettings({
        nodeCount: 24,
        basePointCountPerNode: 2_000,
        baseMaxRenderedPointCount: 96_000,
        lodSettings: {
          maxNodePointCount: 3_000,
          maxRenderedPointCount: 720_000,
          targetPointSpacingScreenPixels: 1.5,
        },
      }).maxPointCountPerNode,
    ).toBe(3_000);
  });

  it("caps total prefetch by the configured LOD render budget ratio", () => {
    expect(
      createCopcCameraStreamPrefetchSettings({
        nodeCount: 96,
        basePointCountPerNode: 8_000,
        baseMaxRenderedPointCount: 1_000_000,
        maxRenderedPointBudgetRatio: 0.1,
        lodSettings: {
          maxNodePointCount: 80_000,
          maxRenderedPointCount: 120_000,
          targetPointSpacingScreenPixels: 1,
        },
      }).maxRenderedPointCount,
    ).toBe(12_000);
  });

  it("can raise prefetch density to the last rendered per-node detail target", () => {
    expect(
      createCopcCameraStreamPrefetchSettings({
        nodeCount: 53,
        basePointCountPerNode: 2_000,
        baseMaxRenderedPointCount: 96_000,
        minPointCountPerNode: 2_265,
        minRenderedPointCount: 53 * 2_265,
        lodSettings: {
          maxNodePointCount: 80_000,
          maxRenderedPointCount: 360_000,
          targetPointSpacingScreenPixels: 4,
        },
      }),
    ).toEqual({
      maxPointCountPerNode: 2_265,
      maxRenderedPointCount: 120_045,
    });
  });

  it("returns zero budgets when there are no nodes to prefetch", () => {
    expect(
      createCopcCameraStreamPrefetchSettings({
        nodeCount: 0,
        basePointCountPerNode: 2_000,
        baseMaxRenderedPointCount: 96_000,
        lodSettings: {
          maxNodePointCount: 80_000,
          maxRenderedPointCount: 360_000,
          targetPointSpacingScreenPixels: 4,
        },
      }),
    ).toEqual({
      maxPointCountPerNode: 0,
      maxRenderedPointCount: 0,
    });
  });
});

describe("createCopcCameraStreamPrefetchNodeCount", () => {
  it("keeps overview prefetch conservative", () => {
    expect(
      createCopcCameraStreamPrefetchNodeCount({
        lodSettings: {
          maxNodes: 96,
          targetPointSpacingScreenPixels: 4,
        },
        runtimeSettings: {
          prefetchMaxNodeCount: 8,
        },
      }),
    ).toBe(8);
  });

  it("prefetches more current-view nodes for denser zoom levels", () => {
    expect(
      createCopcCameraStreamPrefetchNodeCount({
        lodSettings: {
          maxNodes: 96,
          targetPointSpacingScreenPixels: 3.5,
        },
        runtimeSettings: {
          prefetchMaxNodeCount: 8,
        },
      }),
    ).toBe(16);

    expect(
      createCopcCameraStreamPrefetchNodeCount({
        lodSettings: {
          maxNodes: 288,
          targetPointSpacingScreenPixels: 1.5,
        },
        runtimeSettings: {
          prefetchMaxNodeCount: 8,
        },
      }),
    ).toBe(24);
  });

  it("does not prefetch more nodes than the active LOD allows", () => {
    expect(
      createCopcCameraStreamPrefetchNodeCount({
        lodSettings: {
          maxNodes: 12,
          targetPointSpacingScreenPixels: 1.5,
        },
        runtimeSettings: {
          prefetchMaxNodeCount: 8,
        },
      }),
    ).toBe(12);
  });
});

describe("createCopcCameraStreamDetailCompletionSettings", () => {
  it("keeps overview cold-detail completion responsive", () => {
    expect(
      createCopcCameraStreamDetailCompletionSettings({
        lodSettings: {
          targetPointSpacingScreenPixels: 5,
        },
        runtimeSettings: {
          coldDetailCompletionBudgetFillRatio: 0.65,
          coldDetailCompletionNodeCoverageRatio: 0.85,
        },
      }),
    ).toEqual({
      minBudgetFillRatio: 0.65,
      minBudgetCompletionNodeCoverageRatio: 0.85,
      minNodeCoverageRatio: 0.85,
    });
  });

  it("requires denser current-view node coverage for close zoom detail", () => {
    expect(
      createCopcCameraStreamDetailCompletionSettings({
        lodSettings: {
          targetPointSpacingScreenPixels: 2.25,
        },
        runtimeSettings: {
          coldDetailCompletionBudgetFillRatio: 0.65,
          coldDetailCompletionNodeCoverageRatio: 0.85,
        },
      }),
    ).toEqual({
      minBudgetFillRatio: 0.65,
      minBudgetCompletionNodeCoverageRatio: 0.9,
      minNodeCoverageRatio: 0.9,
    });
  });

  it("uses the strictest node coverage for near zoom detail", () => {
    expect(
      createCopcCameraStreamDetailCompletionSettings({
        lodSettings: {
          targetPointSpacingScreenPixels: 1.5,
        },
        runtimeSettings: {
          coldDetailCompletionBudgetFillRatio: 0.65,
          coldDetailCompletionNodeCoverageRatio: 0.85,
        },
      }).minNodeCoverageRatio,
    ).toBe(0.95);
  });

  it("keeps a stricter runtime node coverage override", () => {
    expect(
      createCopcCameraStreamDetailCompletionSettings({
        lodSettings: {
          targetPointSpacingScreenPixels: 2.25,
        },
        runtimeSettings: {
          coldDetailCompletionBudgetFillRatio: 0.65,
          coldDetailCompletionNodeCoverageRatio: 1,
        },
      }).minNodeCoverageRatio,
    ).toBe(1);
  });
});

describe("createCopcCameraStreamRuntimeSettings", () => {
  it("returns reusable camera-stream defaults for Cesium integrations", () => {
    expect(createCopcCameraStreamRuntimeSettings()).toEqual({
      backgroundPrefetchDelayMilliseconds: 80,
      backgroundPrefetchMaxConcurrentRequests: 4,
      backgroundPrefetchRequestPriority: -1_000,
      coldDetailCompletionBudgetFillRatio: 0.65,
      coldDetailCompletionNodeCoverageRatio: 0.85,
      coldDetailMaxInitialCoverageRatio: 0.2,
      detailMaxFinalNodeCount: 48,
      detailMaxActiveNodeRequests: 6,
      detailMinFinalNodeCount: 8,
      detailProgressBatchDivisor: 16,
      detailProgressMaxBatchNodeCount: 8,
      detailProgressMinBatchNodeCount: 2,
      detailTargetPointCountPerNode: 2_500,
      detailWarmupMaxNodeCount: 64,
      detailWarmupMinInitialCoverageRatio: 0.35,
      detailWarmupPointCountPerNode: 2_000,
      fastRendererProgressBatchNodeCount: 1,
      maxReusedBackgroundStreams: 1,
      reusedBackgroundStreamGraceMilliseconds: 350,
      reuseMinExactNodeOverlapRatio: 0.25,
      moveDebounceMilliseconds: 30,
      pointPrimitiveProgressBatchNodeCount: 4,
      prefetchMaxNodeCount: 24,
      prefetchMaxRenderedPointCount: 120_000,
      prefetchPointCountPerNode: 2_500,
      previewCompletionNodeCount: 4,
      previewCompletionPointCount: 5_500,
      previewMinFinalNodeCount: 5,
      previewMaxNodeCount: 32,
      previewMaxPointDataLength: 256_000,
      previewMaxRenderedPointCount: 64_000,
      previewPointCountPerNode: 8_000,
      retainedNodeSampleLimit: 1_024,
      reuseMinNodeFamilyOverlapRatio: 0.35,
    });
  });

  it("normalizes invalid runtime overrides back to safe defaults", () => {
    expect(
      createCopcCameraStreamRuntimeSettings({
        backgroundPrefetchDelayMilliseconds: -1,
        backgroundPrefetchMaxConcurrentRequests: 0,
        backgroundPrefetchRequestPriority: Number.NaN,
        coldDetailCompletionBudgetFillRatio: -1,
        coldDetailCompletionNodeCoverageRatio: Number.NaN,
        coldDetailMaxInitialCoverageRatio: Number.POSITIVE_INFINITY,
        detailMaxFinalNodeCount: 0,
        detailMaxActiveNodeRequests: 0,
        detailMinFinalNodeCount: Number.NaN,
        detailProgressBatchDivisor: 0,
        detailProgressMaxBatchNodeCount: -1,
        detailProgressMinBatchNodeCount: Number.NaN,
        detailTargetPointCountPerNode: -1,
        detailWarmupMaxNodeCount: 0,
        detailWarmupMinInitialCoverageRatio: -0.5,
        detailWarmupPointCountPerNode: Number.NaN,
        fastRendererProgressBatchNodeCount: 0,
        maxReusedBackgroundStreams: -1,
        reusedBackgroundStreamGraceMilliseconds: -1,
        reuseMinExactNodeOverlapRatio: Number.NaN,
        moveDebounceMilliseconds: -1,
        pointPrimitiveProgressBatchNodeCount: -4,
        prefetchMaxNodeCount: 0,
        prefetchMaxRenderedPointCount: -1,
        prefetchPointCountPerNode: Number.POSITIVE_INFINITY,
        previewCompletionNodeCount: Number.POSITIVE_INFINITY,
        previewCompletionPointCount: 0,
        previewMinFinalNodeCount: 0,
        previewMaxNodeCount: 0,
        previewMaxPointDataLength: -1,
        previewMaxRenderedPointCount: 0.5,
        previewPointCountPerNode: -10,
        retainedNodeSampleLimit: 0,
        reuseMinNodeFamilyOverlapRatio: Number.NaN,
      }),
    ).toEqual(createCopcCameraStreamRuntimeSettings());
  });

  it("accepts bounded runtime overrides", () => {
    expect(
      createCopcCameraStreamRuntimeSettings({
        backgroundPrefetchDelayMilliseconds: 100,
        backgroundPrefetchMaxConcurrentRequests: 2,
        backgroundPrefetchRequestPriority: -500,
        coldDetailCompletionBudgetFillRatio: 2,
        coldDetailMaxInitialCoverageRatio: 2,
        detailMaxFinalNodeCount: 48,
        detailMaxActiveNodeRequests: 7,
        detailMinFinalNodeCount: 12,
        detailProgressBatchDivisor: 32,
        detailProgressMaxBatchNodeCount: 3,
        detailProgressMinBatchNodeCount: 2,
        detailTargetPointCountPerNode: 700,
        detailWarmupMaxNodeCount: 48,
        maxReusedBackgroundStreams: 0,
        reusedBackgroundStreamGraceMilliseconds: 125,
        reuseMinExactNodeOverlapRatio: 2,
        moveDebounceMilliseconds: 0,
        prefetchMaxNodeCount: 128,
        prefetchMaxRenderedPointCount: 192_000,
        prefetchPointCountPerNode: 4_000,
        previewMaxNodeCount: 16,
        previewMinFinalNodeCount: 6,
        previewPointCountPerNode: 8_000,
        retainedNodeSampleLimit: 1_024,
        reuseMinNodeFamilyOverlapRatio: 2,
      }),
    ).toEqual(
      expect.objectContaining({
        backgroundPrefetchDelayMilliseconds: 100,
        backgroundPrefetchMaxConcurrentRequests: 2,
        backgroundPrefetchRequestPriority: -500,
        coldDetailCompletionBudgetFillRatio: 1,
        coldDetailMaxInitialCoverageRatio: 1,
        detailMaxFinalNodeCount: 48,
        detailMaxActiveNodeRequests: 7,
        detailMinFinalNodeCount: 12,
        detailProgressBatchDivisor: 32,
        detailProgressMaxBatchNodeCount: 3,
        detailProgressMinBatchNodeCount: 2,
        detailTargetPointCountPerNode: 700,
        detailWarmupMaxNodeCount: 48,
        maxReusedBackgroundStreams: 0,
        reusedBackgroundStreamGraceMilliseconds: 125,
        reuseMinExactNodeOverlapRatio: 1,
        moveDebounceMilliseconds: 0,
        prefetchMaxNodeCount: 128,
        prefetchMaxRenderedPointCount: 192_000,
        prefetchPointCountPerNode: 4_000,
        previewMaxNodeCount: 16,
        previewMinFinalNodeCount: 6,
        previewPointCountPerNode: 8_000,
        retainedNodeSampleLimit: 1_024,
        reuseMinNodeFamilyOverlapRatio: 1,
      }),
    );
  });
});

describe("createCopcCameraStreamPreviewPointCountPerNode", () => {
  it("spreads the preview completion target across the selected preview nodes", () => {
    const runtimeSettings = createCopcCameraStreamRuntimeSettings({
      previewCompletionNodeCount: 4,
      previewCompletionPointCount: 5_500,
      previewPointCountPerNode: 8_000,
    });

    expect(
      createCopcCameraStreamPreviewPointCountPerNode({
        previewNodeCount: 8,
        runtimeSettings,
      }),
    ).toBe(1_375);
    expect(
      createCopcCameraStreamPreviewPointCountPerNode({
        previewNodeCount: 2,
        runtimeSettings,
      }),
    ).toBe(2_750);
    expect(
      createCopcCameraStreamPreviewPointCountPerNode({
        previewNodeCount: 1,
        runtimeSettings,
      }),
    ).toBe(5_500);
  });

  it("never exceeds the runtime per-node preview cap", () => {
    expect(
      createCopcCameraStreamPreviewPointCountPerNode({
        previewNodeCount: 1,
        runtimeSettings: createCopcCameraStreamRuntimeSettings({
          previewCompletionPointCount: 8_000,
          previewPointCountPerNode: 2_000,
        }),
      }),
    ).toBe(2_000);
  });
});
