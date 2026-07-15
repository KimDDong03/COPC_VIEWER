import { describe, expect, it } from "vitest";
import { createBasicViewerDemoHudState } from "./createBasicViewerDemoHudState";

describe("createBasicViewerDemoHudState", () => {
  it("formats the structured Millsite camera-stream evidence", () => {
    expect(
      createBasicViewerDemoHudState({
        datasetLabel: "Millsite Reservoir (USGS 3DEP)",
        stage: "ready",
        totalPointCount: 374_609_447,
        selectedSourcePointCount: 2_024_388,
        renderedSampleCount: 352_441,
        selectedNodeCount: 95,
        selectedDepth: 5,
        selectedCompressedByteLength: 16_864_312,
        coverageRatio: 1,
      }),
    ).toEqual({
      datasetLabel: "Millsite Reservoir (USGS 3DEP)",
      stage: "ready",
      stageLabel: "Ready",
      totalPointCount: "374,609,447",
      selectedSourcePointCount: "2,024,388",
      renderedSampleCount: "352,441",
      selectedNodeCount: "95",
      selectedDepth: "5",
      selectedCompressedByteLength: "16.1 MiB",
      coverage: "100%",
    });
  });

  it("keeps zero values visible and leaves unavailable metrics explicit", () => {
    expect(
      createBasicViewerDemoHudState({
        datasetLabel: "  ",
        stage: "metadata",
        selectedNodeCount: 0,
        selectedDepth: 0,
        coverageRatio: Number.NaN,
      }),
    ).toMatchObject({
      datasetLabel: "No dataset selected",
      stageLabel: "Loading metadata",
      totalPointCount: "—",
      selectedNodeCount: "0",
      selectedDepth: "0",
      coverage: "—",
    });
  });

  it("clamps coverage to 100 percent", () => {
    expect(
      createBasicViewerDemoHudState({
        datasetLabel: "Autzen classified",
        stage: "refining",
        coverageRatio: 1.2,
      }).coverage,
    ).toBe("100%");
  });
});
