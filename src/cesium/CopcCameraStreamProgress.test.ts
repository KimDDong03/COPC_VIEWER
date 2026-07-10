import { describe, expect, it } from "vitest";
import {
  createCopcCameraStreamDetailProgressState,
  createCopcCameraStreamRequestPriority,
  selectCopcCameraStreamDetailProgressPolicy,
  selectCopcCameraStreamDetailWarmupPolicy,
  selectCopcCameraStreamRequestPriorityOffsets,
  shouldCompleteCopcCameraStreamDetailProgress,
} from "./CopcCameraStreamProgress";
import { selectDistributedCopcCameraStreamNodeKeys } from "./CopcCameraStreamNodePlan";

describe("selectCopcCameraStreamDetailProgressPolicy", () => {
  it("prioritizes preview, visible detail, then cache warmup", () => {
    const priorityOffsets = selectCopcCameraStreamRequestPriorityOffsets();

    expect(priorityOffsets.preview).toBeGreaterThan(
      priorityOffsets.detail,
    );
    expect(priorityOffsets.detail).toBeGreaterThan(
      priorityOffsets.detailWarmup,
    );
  });

  it("creates stable per-request camera-stream priorities", () => {
    expect(
      createCopcCameraStreamRequestPriority({
        requestId: 12,
        offset: 3,
      }),
    ).toBe(123);
    expect(
      createCopcCameraStreamRequestPriority({
        requestId: 12,
        offset: 3,
        step: 100,
      }),
    ).toBe(1203);
    expect(
      createCopcCameraStreamRequestPriority({
        requestId: 12,
        offset: 3,
        step: Number.NaN,
      }),
    ).toBe(123);
  });

  it("selects capped camera-stream node subsets across the full ordered range", () => {
    const nodeKeys = Array.from(
      { length: 12 },
      (_value, index) => `5-${index}-0-0`,
    );

    expect(selectDistributedCopcCameraStreamNodeKeys(nodeKeys, 4)).toEqual([
      "5-0-0-0",
      "5-4-0-0",
      "5-7-0-0",
      "5-11-0-0",
    ]);
  });

  it("keeps all camera-stream node keys when the cap covers the list", () => {
    const nodeKeys = ["5-0-0-0", "5-1-0-0"];

    expect(selectDistributedCopcCameraStreamNodeKeys(nodeKeys, 4)).toEqual(
      nodeKeys,
    );
  });

  it("uses immediate typed progress when same-node initial coverage is high", () => {
    const policy = selectCopcCameraStreamDetailProgressPolicy({
      finalNodeKeys: ["1-0-0-0", "1-0-0-1", "1-0-1-0", "1-0-1-1"],
      initialNodeResults: [
        { nodeKey: "1-0-0-0" },
        { nodeKey: "1-0-0-1" },
        { nodeKey: "1-0-1-0" },
      ],
      rendererKind: "typed",
      fastRendererProgressBatchNodeCount: 1,
      pointPrimitiveProgressBatchNodeCount: 4,
    });

    expect(policy).toEqual({
      progressBatchNodeCount: 1,
      progressRenderMode: "incremental",
      sameNodeInitialCoverageRatio: 0.75,
    });
  });

  it("uses balanced typed progress when same-node samples are too sparse", () => {
    const finalNodeKeys = Array.from(
      { length: 16 },
      (_value, index) => `4-${index}-0-0`,
    );
    const policy = selectCopcCameraStreamDetailProgressPolicy({
      finalNodeKeys,
      initialNodeResults: finalNodeKeys.map((nodeKey) => ({
        nodeKey,
        nodePointCount: 10_000,
        sampledPointCount: 128,
      })),
      rendererKind: "typed",
      fastRendererProgressBatchNodeCount: 1,
      pointPrimitiveProgressBatchNodeCount: 4,
      minInitialPointCount: 2_000,
    });

    expect(policy.progressBatchNodeCount).toBe(2);
    expect(policy.sameNodeInitialCoverageRatio).toBe(0);
  });

  it("uses balanced typed progress when same-node initial coverage is sparse", () => {
    const finalNodeKeys = Array.from(
      { length: 48 },
      (_value, index) => `5-${index}-0-0`,
    );
    const policy = selectCopcCameraStreamDetailProgressPolicy({
      finalNodeKeys,
      initialNodeResults: [],
      rendererKind: "typed",
      fastRendererProgressBatchNodeCount: 1,
      pointPrimitiveProgressBatchNodeCount: 4,
    });

    expect(policy).toEqual({
      progressBatchNodeCount: 3,
      progressRenderMode: "incremental",
      sameNodeInitialCoverageRatio: 0,
    });
  });

  it("caps large typed batches so progress still updates regularly", () => {
    const finalNodeKeys = Array.from(
      { length: 160 },
      (_value, index) => `7-${index}-0-0`,
    );
    const policy = selectCopcCameraStreamDetailProgressPolicy({
      finalNodeKeys,
      initialNodeResults: [],
      rendererKind: "typed",
      fastRendererProgressBatchNodeCount: 1,
      pointPrimitiveProgressBatchNodeCount: 4,
    });

    expect(policy.progressBatchNodeCount).toBe(8);
  });

  it("accepts latency-first typed progress batches for camera-stream detail", () => {
    const finalNodeKeys = Array.from(
      { length: 48 },
      (_value, index) => `5-${index}-0-0`,
    );
    const policy = selectCopcCameraStreamDetailProgressPolicy({
      finalNodeKeys,
      initialNodeResults: [],
      rendererKind: "typed",
      fastRendererProgressBatchNodeCount: 1,
      pointPrimitiveProgressBatchNodeCount: 4,
      balancedBatchDivisor: 48,
      minBalancedBatchNodeCount: 1,
      maxBalancedBatchNodeCount: 4,
    });

    expect(policy).toEqual({
      progressBatchNodeCount: 1,
      progressRenderMode: "incremental",
      sameNodeInitialCoverageRatio: 0,
    });
  });

  it("keeps the slower point primitive renderer on its conservative batch", () => {
    const policy = selectCopcCameraStreamDetailProgressPolicy({
      finalNodeKeys: Array.from(
        { length: 48 },
        (_value, index) => `5-${index}-0-0`,
      ),
      initialNodeResults: [],
      rendererKind: "primitive",
      fastRendererProgressBatchNodeCount: 1,
      pointPrimitiveProgressBatchNodeCount: 4,
    });

    expect(policy.progressBatchNodeCount).toBe(4);
  });

  it("completes detail progress when the render budget is nearly filled", () => {
    expect(
      shouldCompleteCopcCameraStreamDetailProgress({
        finalNodeCount: 58,
        renderedFinalNodeCount: 53,
        renderedPointBudget: 20_000,
        renderedPointCount: 17_195,
      }),
    ).toBe(true);
  });

  it("can require current-view node coverage before budget fill completes detail progress", () => {
    expect(
      shouldCompleteCopcCameraStreamDetailProgress({
        finalNodeCount: 58,
        renderedFinalNodeCount: 20,
        renderedPointBudget: 20_000,
        renderedPointCount: 20_000,
        minBudgetCompletionNodeCoverageRatio: 0.9,
      }),
    ).toBe(false);
    expect(
      shouldCompleteCopcCameraStreamDetailProgress({
        finalNodeCount: 58,
        renderedFinalNodeCount: 53,
        renderedPointBudget: 20_000,
        renderedPointCount: 20_000,
        minBudgetCompletionNodeCoverageRatio: 0.9,
      }),
    ).toBe(true);
  });

  it("keeps progress state partial when point budget fills before current-view coverage", () => {
    expect(
      createCopcCameraStreamDetailProgressState({
        finalNodeKeys: ["a", "b", "c", "d", "e"],
        renderedNodeKeys: ["a", "b", "c"],
        renderedPointBudget: 100_000,
        renderedPointCount: 92_000,
        minBudgetCompletionNodeCoverageRatio: 0.9,
      }),
    ).toEqual({
      finalNodeCount: 5,
      renderedFinalNodeCount: 3,
      renderedFinalNodeCoverageRatio: 0.6,
      renderedFinalNodeWeightCoverageRatio: 0.6,
      reachedRenderBudget: false,
      isComplete: false,
    });

    expect(
      createCopcCameraStreamDetailProgressState({
        finalNodeKeys: ["a", "b", "c", "d", "e"],
        renderedNodeKeys: ["a", "b", "c", "d", "e"],
        renderedPointBudget: 100_000,
        renderedPointCount: 92_000,
        minBudgetCompletionNodeCoverageRatio: 0.9,
      }).isComplete,
    ).toBe(true);
  });

  it("can complete cold detail once most current-view nodes are rendered", () => {
    expect(
      shouldCompleteCopcCameraStreamDetailProgress({
        finalNodeCount: 24,
        renderedFinalNodeCount: 21,
        renderedPointBudget: 120_000,
        renderedPointCount: 81_675,
        minBudgetFillRatio: 0.65,
        minBudgetCompletionNodeCoverageRatio: 0.85,
        minNodeCoverageRatio: 0.85,
      }),
    ).toBe(true);
  });

  it("keeps close zoom detail partial until dense current-view coverage is rendered", () => {
    expect(
      shouldCompleteCopcCameraStreamDetailProgress({
        finalNodeCount: 46,
        renderedFinalNodeCount: 41,
        renderedPointBudget: 120_000,
        renderedPointCount: 57_297,
        minBudgetFillRatio: 0.65,
        minBudgetCompletionNodeCoverageRatio: 0.9,
        minNodeCoverageRatio: 0.9,
      }),
    ).toBe(false);
    expect(
      shouldCompleteCopcCameraStreamDetailProgress({
        finalNodeCount: 46,
        renderedFinalNodeCount: 42,
        renderedPointBudget: 120_000,
        renderedPointCount: 62_000,
        minBudgetFillRatio: 0.65,
        minBudgetCompletionNodeCoverageRatio: 0.9,
        minNodeCoverageRatio: 0.9,
      }),
    ).toBe(true);
  });

  it("can complete detail when rendered nodes cover almost all weighted source points", () => {
    expect(
      shouldCompleteCopcCameraStreamDetailProgress({
        finalNodeCount: 48,
        renderedFinalNodeCount: 43,
        renderedPointBudget: 360_000,
        renderedPointCount: 170_000,
        minNodeCoverageRatio: 0.9,
        minWeightedCompletionNodeCoverageRatio: 0.88,
        minWeightedNodeCoverageRatio: 0.9,
        weightedFinalNodeCoverageRatio: 0.97,
      }),
    ).toBe(true);
    expect(
      shouldCompleteCopcCameraStreamDetailProgress({
        finalNodeCount: 48,
        renderedFinalNodeCount: 40,
        renderedPointBudget: 360_000,
        renderedPointCount: 170_000,
        minNodeCoverageRatio: 0.9,
        minWeightedCompletionNodeCoverageRatio: 0.88,
        minWeightedNodeCoverageRatio: 0.9,
        weightedFinalNodeCoverageRatio: 0.97,
      }),
    ).toBe(false);
  });

  it("keeps detail partial when node count coverage passes but weighted coverage is low", () => {
    expect(
      shouldCompleteCopcCameraStreamDetailProgress({
        finalNodeCount: 48,
        renderedFinalNodeCount: 45,
        renderedPointBudget: 360_000,
        renderedPointCount: 317_201,
        minBudgetFillRatio: 0.65,
        minBudgetCompletionNodeCoverageRatio: 0.9,
        minNodeCoverageRatio: 0.9,
        minWeightedCompletionNodeCoverageRatio: 0.88,
        minWeightedNodeCoverageRatio: 0.9,
        weightedFinalNodeCoverageRatio: 0.8879,
      }),
    ).toBe(false);
    expect(
      shouldCompleteCopcCameraStreamDetailProgress({
        finalNodeCount: 48,
        renderedFinalNodeCount: 45,
        renderedPointBudget: 360_000,
        renderedPointCount: 317_201,
        minBudgetFillRatio: 0.65,
        minBudgetCompletionNodeCoverageRatio: 0.9,
        minNodeCoverageRatio: 0.9,
        minWeightedCompletionNodeCoverageRatio: 0.88,
        minWeightedNodeCoverageRatio: 0.9,
        weightedFinalNodeCoverageRatio: 0.9001,
      }),
    ).toBe(true);
  });

  it("can require every current-view detail node before completing", () => {
    expect(
      shouldCompleteCopcCameraStreamDetailProgress({
        finalNodeCount: 58,
        renderedFinalNodeCount: 53,
        renderedPointBudget: 20_000,
        renderedPointCount: 20_000,
        requireFullNodeCoverage: true,
      }),
    ).toBe(false);
    expect(
      shouldCompleteCopcCameraStreamDetailProgress({
        finalNodeCount: 58,
        renderedFinalNodeCount: 58,
        renderedPointBudget: 20_000,
        renderedPointCount: 18_000,
        requireFullNodeCoverage: true,
      }),
    ).toBe(true);
  });

  it("keeps detail progress partial when both point and node coverage are sparse", () => {
    expect(
      shouldCompleteCopcCameraStreamDetailProgress({
        finalNodeCount: 58,
        renderedFinalNodeCount: 20,
        renderedPointBudget: 20_000,
        renderedPointCount: 8_000,
      }),
    ).toBe(false);
  });

  it("summarizes current-view detail progress from rendered node keys", () => {
    expect(
      createCopcCameraStreamDetailProgressState({
        finalNodeKeys: ["5-0-0-0", "5-1-0-0", "5-2-0-0", "5-3-0-0"],
        renderedNodeKeys: ["4-0-0-0", "5-0-0-0", "5-1-0-0", "5-1-0-0"],
        renderedPointBudget: 10_000,
        renderedPointCount: 9_000,
        minBudgetCompletionNodeCoverageRatio: 0.75,
      }),
    ).toEqual({
      finalNodeCount: 4,
      renderedFinalNodeCount: 2,
      renderedFinalNodeCoverageRatio: 0.5,
      renderedFinalNodeWeightCoverageRatio: 0.5,
      reachedRenderBudget: false,
      isComplete: false,
    });
  });

  it("summarizes weighted current-view detail coverage from final node weights", () => {
    expect(
      createCopcCameraStreamDetailProgressState({
        finalNodeKeys: ["a", "b", "c", "d"],
        finalNodeWeights: [
          { nodeKey: "a", weight: 100 },
          { nodeKey: "b", weight: 100 },
          { nodeKey: "c", weight: 1 },
          { nodeKey: "d", weight: 1 },
        ],
        renderedNodeKeys: ["a", "b"],
        renderedPointBudget: 10_000,
        renderedPointCount: 5_000,
        minWeightedCompletionNodeCoverageRatio: 0.5,
        minWeightedNodeCoverageRatio: 0.9,
      }),
    ).toEqual({
      finalNodeCount: 4,
      renderedFinalNodeCount: 2,
      renderedFinalNodeCoverageRatio: 0.5,
      renderedFinalNodeWeightCoverageRatio: 200 / 202,
      reachedRenderBudget: false,
      isComplete: true,
    });
  });

  it("warms current-view detail nodes when same-node coverage is sparse", () => {
    const finalNodeKeys = Array.from(
      { length: 48 },
      (_value, index) => `5-${index}-0-0`,
    );
    const policy = selectCopcCameraStreamDetailWarmupPolicy({
      finalNodeKeys,
      initialNodeResults: [],
      detailMaxPointCountPerNode: 6_000,
      warmupPointCountPerNode: 2_000,
    });

    expect(policy.shouldWarmup).toBe(true);
    expect(policy.warmupNodeKeys).toHaveLength(48);
    expect(policy.warmupNodeKeys[0]).toBe("5-0-0-0");
    expect(policy.warmupNodeKeys.at(-1)).toBe("5-47-0-0");
    expect(policy.warmupNodeKeys).toEqual(finalNodeKeys);
    expect(policy.maxPointCountPerNode).toBe(2_000);
    expect(policy.maxRenderedPointCount).toBe(96_000);
    expect(policy.progressBatchNodeCount).toBe(4);
    expect(policy.progressRenderMode).toBe("incremental");
    expect(policy.sameNodeInitialCoverageRatio).toBe(0);
  });

  it("allows callers to raise the current-view detail warmup cap", () => {
    const finalNodeKeys = Array.from(
      { length: 48 },
      (_value, index) => `5-${index}-0-0`,
    );
    const policy = selectCopcCameraStreamDetailWarmupPolicy({
      finalNodeKeys,
      initialNodeResults: [],
      detailMaxPointCountPerNode: 6_000,
      warmupPointCountPerNode: 2_000,
      maxWarmupNodeCount: 32,
    });

    expect(policy.warmupNodeKeys).toHaveLength(32);
    expect(policy.warmupNodeKeys[0]).toBe("5-0-0-0");
    expect(policy.warmupNodeKeys.at(-1)).toBe("5-47-0-0");
    expect(policy.warmupNodeKeys).not.toEqual(finalNodeKeys.slice(0, 32));
    expect(policy.maxRenderedPointCount).toBe(64_000);
    expect(policy.progressBatchNodeCount).toBe(4);
  });

  it("uses the final detail point count for node-granularity warmup so active decodes can coalesce", () => {
    const finalNodeKeys = Array.from(
      { length: 8 },
      (_value, index) => `5-${index}-0-0`,
    );
    const policy = selectCopcCameraStreamDetailWarmupPolicy({
      finalNodeKeys,
      initialNodeResults: [],
      detailMaxPointCountPerNode: 6_000,
      warmupPointCountPerNode: 2_000,
      decodeGranularity: "node",
    });

    expect(policy.shouldWarmup).toBe(true);
    expect(policy.maxPointCountPerNode).toBe(6_000);
    expect(policy.maxRenderedPointCount).toBe(48_000);
  });

  it("skips current-view detail warmup when initial coverage is already useful", () => {
    const finalNodeKeys = ["1-0-0-0", "1-0-0-1", "1-0-1-0", "1-0-1-1"];
    const policy = selectCopcCameraStreamDetailWarmupPolicy({
      finalNodeKeys,
      initialNodeResults: [
        {
          nodeKey: "1-0-0-0",
          nodePointCount: 10_000,
          sampledPointCount: 2_000,
        },
        {
          nodeKey: "1-0-0-1",
          nodePointCount: 10_000,
          sampledPointCount: 2_000,
        },
        {
          nodeKey: "1-0-1-0",
          nodePointCount: 10_000,
          sampledPointCount: 2_000,
        },
      ],
      detailMaxPointCountPerNode: 6_000,
      warmupPointCountPerNode: 2_000,
    });

    expect(policy.shouldWarmup).toBe(false);
    expect(policy.warmupNodeKeys).toEqual([]);
    expect(policy.sameNodeInitialCoverageRatio).toBe(0.75);
  });

  it("lets callers skip detail warmup when current-view initial coverage is too low", () => {
    const finalNodeKeys = Array.from(
      { length: 48 },
      (_value, index) => `5-${index}-0-0`,
    );
    const policy = selectCopcCameraStreamDetailWarmupPolicy({
      finalNodeKeys,
      initialNodeResults: [
        {
          nodeKey: "5-0-0-0",
          nodePointCount: 10_000,
          sampledPointCount: 2_000,
        },
      ],
      detailMaxPointCountPerNode: 6_000,
      warmupPointCountPerNode: 2_000,
      minSameNodeInitialCoverageRatio: 0.35,
    });

    expect(policy.shouldWarmup).toBe(false);
    expect(policy.warmupNodeKeys).toEqual([]);
    expect(policy.sameNodeInitialCoverageRatio).toBeCloseTo(1 / 48);
  });

  it("ignores too-sparse initial samples when deciding detail warmup", () => {
    const finalNodeKeys = ["1-0-0-0", "1-0-0-1", "1-0-1-0", "1-0-1-1"];
    const policy = selectCopcCameraStreamDetailWarmupPolicy({
      finalNodeKeys,
      initialNodeResults: [
        {
          nodeKey: "1-0-0-0",
          nodePointCount: 10_000,
          sampledPointCount: 128,
        },
        {
          nodeKey: "1-0-0-1",
          nodePointCount: 10_000,
          sampledPointCount: 128,
        },
        {
          nodeKey: "1-0-1-0",
          nodePointCount: 10_000,
          sampledPointCount: 128,
        },
      ],
      detailMaxPointCountPerNode: 6_000,
      warmupPointCountPerNode: 2_000,
    });

    expect(policy.shouldWarmup).toBe(true);
    expect(policy.sameNodeInitialCoverageRatio).toBe(0);
  });

  it("skips current-view detail warmup when requested detail is already low density", () => {
    const policy = selectCopcCameraStreamDetailWarmupPolicy({
      finalNodeKeys: ["1-0-0-0", "1-0-0-1", "1-0-1-0", "1-0-1-1"],
      initialNodeResults: [],
      detailMaxPointCountPerNode: 2_000,
      warmupPointCountPerNode: 2_000,
    });

    expect(policy.shouldWarmup).toBe(false);
    expect(policy.maxPointCountPerNode).toBe(2_000);
  });
});
