import { describe, expect, it } from "vitest";
import type {
  CopcHierarchyNodeCameraSelection,
  CopcHierarchyNodeSummary,
} from "../core";
import {
  formatCopcCameraStreamDiagnostics,
  formatCopcCameraStreamDetailProgress,
  formatCopcCameraStreamFinalNodeMix,
  formatCopcCameraStreamLodSummary,
  formatCopcHierarchyNodeCameraSelection,
  formatCopcLoadedHierarchyPages,
  summarizeCopcCameraStreamSourceNodes,
} from "./CopcCameraStreamTelemetry";

const node = (
  key: string,
  pointCount: number,
  pointDataLength: number,
): CopcHierarchyNodeSummary => ({
  key,
  depth: 5,
  x: 0,
  y: 0,
  z: 0,
  bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
  pointCount,
  pointDensity: pointCount,
  pointDataOffset: 0,
  pointDataLength,
});

describe("camera stream telemetry", () => {
  it("summarizes source node point and byte totals", () => {
    expect(
      summarizeCopcCameraStreamSourceNodes([
        node("5-0-0-0", 10, 128),
        node("5-1-0-0", 15, 256),
      ]),
    ).toEqual({
      selectedSourcePointCount: 25,
      selectedPointDataLength: 384,
    });
  });

  it("formats camera stream diagnostics with pluggable byte and timing formatters", () => {
    expect(
      formatCopcCameraStreamDiagnostics(
        {
          expandHierarchyMilliseconds: 0.75,
          applyHierarchyMilliseconds: 0,
          selectNodesMilliseconds: 17.12,
          renderNodesMilliseconds: 8.74,
          totalMilliseconds: 28.39,
          loadedHierarchyPageCount: 2,
          selectedNodeCount: 37,
          selectedDepth: 5,
          selectedSourcePointCount: 706_485,
          selectedPointDataLength: 7_126_572,
        },
        {
          formatBytes: (byteCount) => `${byteCount.toLocaleString()} B`,
          formatMilliseconds: (milliseconds) => milliseconds.toFixed(1),
        },
      ),
    ).toBe(
      "expand 0.8 ms, apply 0.0 ms, select 17.1 ms, render 8.7 ms, total 28.4 ms, 2 pages, 37 nodes, depth 5, source 706,485 pts / 7,126,572 B",
    );
  });

  it("formats current-view detail progress coverage", () => {
    expect(formatCopcCameraStreamDetailProgress(undefined)).toBe(
      "Not streamed yet",
    );
    expect(
      formatCopcCameraStreamDetailProgress({
        finalNodeCount: 48,
        renderedFinalNodeCount: 43,
        renderedFinalNodeCoverageRatio: 43 / 48,
        renderedFinalNodeWeightCoverageRatio: 0.96,
        reachedRenderBudget: true,
        isComplete: true,
      }),
    ).toBe(
      "43 / 48 current-view nodes (89.6% coverage, 96% weighted, render budget reached)",
    );
  });

  it("formats camera stream LOD summaries with adaptive budgets", () => {
    expect(
      formatCopcCameraStreamLodSummary({
        lodSettings: {
          label: "near zoom",
          cameraHeightMeters: 300,
          maxNodes: 288,
          maxDepth: 6,
          targetNodeScreenPixels: 48,
          targetPointSpacingScreenPixels: 1.5,
          maxRenderedPointCount: 720_000,
          maxSourcePointCount: 1_800_000,
          maxNodePointCount: 80_000,
          maxPointDataLength: 32 * 1024 * 1024,
          maxNodePointDataLength: 2 * 1024 * 1024,
          maxHierarchyPages: 5,
          detailMaxPointCountPerNode: 6_500,
          detailMinFinalNodeCount: 16,
          detailTargetPointCountPerNode: 1_500,
        },
        effectiveSourcePointBudget: 900_000,
        effectiveNodePointBudget: 80_000,
        effectivePointDataLengthBudget: 16 * 1024 * 1024,
        effectiveNodePointDataLengthBudget: 2 * 1024 * 1024,
        formatBytes: (byteCount) => `${byteCount / 1024} KB`,
        formatMeters: (meters) => `${meters} m`,
      }),
    ).toBe(
      "near zoom, camera 300 m, depth <= 6, tile target 48 px, point spacing 1.5 px, source budget 900,000 / 1,800,000 source pts adaptive / 80,000 per-node source pts / 16384 KB / 32768 KB compressed adaptive / 2048 KB per-node, up to 288 nodes",
    );
  });

  it("returns a stable empty LOD summary before streaming", () => {
    expect(
      formatCopcCameraStreamLodSummary({
        lodSettings: undefined,
        effectiveSourcePointBudget: 0,
        effectiveNodePointBudget: 0,
        effectivePointDataLengthBudget: 0,
        effectiveNodePointDataLengthBudget: 0,
      }),
    ).toBe("Not streamed yet");
  });

  it("formats camera selection coverage details", () => {
    const selection: CopcHierarchyNodeCameraSelection = {
      nodes: [node("5-0-0-0", 10, 128), node("5-1-0-0", 15, 256)],
      targetDepth: 6,
      selectedDepth: 5,
      selectionMode: "coverage",
      coverageMode: "progressive",
      estimatedRootScreenPixels: 720,
      estimatedSelectedDepthScreenPixels: 83,
      targetNodeScreenPixels: 80,
      estimatedSelectedDepthPointSpacingScreenPixels: 0.6,
      targetPointSpacingScreenPixels: 4,
      maxViewAngleDegrees: 80,
      spacing: 0.5,
      depthEstimates: [],
      skippedByFrustumCount: 1,
      skippedByViewCount: 2,
      skippedByBudgetCount: 3,
      reason: "ok",
    };

    expect(formatCopcHierarchyNodeCameraSelection(selection)).toBe(
      "2 progressive coverage nodes at depth 5 (target depth 6, selected depth 83 px / 80 px target, root 720 px, spacing 0.6 px / 4 px target, 1 outside frustum, 2 outside view, 3 skipped by budget)",
    );
  });

  it("formats hierarchy page and final node summaries", () => {
    expect(formatCopcLoadedHierarchyPages([])).toBe("");
    expect(formatCopcLoadedHierarchyPages(["root", "child"])).toBe(
      " after loading 2 hierarchy pages",
    );
    expect(formatCopcCameraStreamFinalNodeMix(8, 12)).toBe(
      "8 selected detail nodes for the current view",
    );
    expect(formatCopcCameraStreamFinalNodeMix(0, 12)).toBe(
      "12 coverage nodes for this zoom level",
    );
  });
});
