import { describe, expect, it } from "vitest";
import {
  constrainCopcCameraStreamBudgetForRenderedPoints,
  createCopcCameraStreamEffectiveBudget,
  formatCopcCameraStreamBudgetSummary,
  updateCopcCameraStreamAdaptiveBudget,
  type CopcCameraStreamBudgetLimits,
} from "./CopcCameraStreamBudget";

const formatBytes = (byteCount: number) => `${byteCount.toLocaleString()} B`;
const limits: CopcCameraStreamBudgetLimits = {
  maxRenderedPointCount: 240_000,
  maxSourcePointCount: 900_000,
  maxNodePointCount: 80_000,
  maxPointDataLength: 16 * 1024 * 1024,
  maxNodePointDataLength: 2 * 1024 * 1024,
};

describe("formatCopcCameraStreamBudgetSummary", () => {
  it("reports the configured camera-stream point cap as the render budget", () => {
    expect(
      formatCopcCameraStreamBudgetSummary({
        configuredRenderedPointBudget: 20_000,
        effectiveRenderedPointBudget: 20_000,
        effectiveSourcePointBudget: 900_000,
        maxSourcePointBudget: 900_000,
        effectiveNodePointBudget: 80_000,
        maxNodePointBudget: 80_000,
        effectivePointDataLengthBudget: 16_384,
        maxPointDataLengthBudget: 16_384,
        effectiveNodePointDataLengthBudget: 2_048,
        maxNodePointDataLengthBudget: 2_048,
        lastRenderedPointBudget: 19_892,
        formatBytes,
      }),
    ).toBe(
      "20,000 render pts cap, 900,000 source pts, 80,000 per-node source pts, 16,384 B compressed, 2,048 B per-node, last 19,892 points",
    );
  });

  it("marks adaptive render budgets without implying the LOD profile is the hard cap", () => {
    expect(
      formatCopcCameraStreamBudgetSummary({
        configuredRenderedPointBudget: 20_000,
        effectiveRenderedPointBudget: 15_000,
        effectiveSourcePointBudget: 600_000,
        maxSourcePointBudget: 900_000,
        effectiveNodePointBudget: 80_000,
        maxNodePointBudget: 80_000,
        effectivePointDataLengthBudget: 8_192,
        maxPointDataLengthBudget: 16_384,
        effectiveNodePointDataLengthBudget: 2_048,
        maxNodePointDataLengthBudget: 2_048,
        formatBytes,
      }),
    ).toBe(
      "15,000 / 20,000 render pts cap adaptive, 600,000 / 900,000 source pts adaptive, 80,000 per-node source pts, 8,192 B / 16,384 B compressed adaptive, 2,048 B per-node",
    );
  });

  it("reports a lower zoom-band ceiling relative to the configured hard cap", () => {
    expect(
      formatCopcCameraStreamBudgetSummary({
        configuredRenderedPointBudget: 720_000,
        effectiveRenderedPointBudget: 360_000,
        maxRenderedPointBudget: 360_000,
        effectiveSourcePointBudget: 900_000,
        maxSourcePointBudget: 900_000,
        effectiveNodePointBudget: 80_000,
        maxNodePointBudget: 80_000,
        effectivePointDataLengthBudget: 32_768,
        maxPointDataLengthBudget: 32_768,
        effectiveNodePointDataLengthBudget: 2_048,
        maxNodePointDataLengthBudget: 2_048,
        formatBytes,
      }),
    ).toBe(
      "360,000 render pts cap (720,000 configured max), 900,000 source pts, 80,000 per-node source pts, 32,768 B compressed, 2,048 B per-node",
    );
  });
});

describe("createCopcCameraStreamEffectiveBudget", () => {
  it("applies adaptive state without exceeding configured limits", () => {
    expect(
      createCopcCameraStreamEffectiveBudget({
        limits,
        state: {
          renderedPointBudget: 120_000,
          sourcePointBudget: 1_000_000,
          nodePointBudget: 40_000,
          pointDataLengthBudget: 8 * 1024 * 1024,
        },
      }),
    ).toEqual({
      renderedPointCount: 120_000,
      sourcePointCount: 900_000,
      nodePointCount: 40_000,
      pointDataLength: 8 * 1024 * 1024,
      nodePointDataLength: 2 * 1024 * 1024,
    });
  });
});

describe("constrainCopcCameraStreamBudgetForRenderedPoints", () => {
  it("keeps large render budgets on the configured source limits", () => {
    expect(
      constrainCopcCameraStreamBudgetForRenderedPoints({
        budget: createCopcCameraStreamEffectiveBudget({
          limits,
        }),
      }),
    ).toEqual({
      renderedPointCount: 240_000,
      sourcePointCount: 900_000,
      nodePointCount: 80_000,
      pointDataLength: 16 * 1024 * 1024,
      nodePointDataLength: 2 * 1024 * 1024,
    });
  });

  it("scales source and compressed budgets down for low render budgets", () => {
    expect(
      constrainCopcCameraStreamBudgetForRenderedPoints({
        budget: {
          renderedPointCount: 10_000,
          sourcePointCount: 900_000,
          nodePointCount: 80_000,
          pointDataLength: 16 * 1024 * 1024,
          nodePointDataLength: 2 * 1024 * 1024,
        },
        minSourcePointCount: 120_000,
        minNodePointCount: 30_000,
        minPointDataLength: 1_200_000,
        minNodePointDataLength: 512 * 1024,
      }),
    ).toEqual({
      renderedPointCount: 10_000,
      sourcePointCount: 180_000,
      nodePointCount: 40_000,
      pointDataLength: 1_920_000,
      nodePointDataLength: 960_000,
    });
  });
});

describe("updateCopcCameraStreamAdaptiveBudget", () => {
  it("reduces only the rendered point budget when Cesium rendering is slow", () => {
    const update = updateCopcCameraStreamAdaptiveBudget({
      limits,
      timings: {
        totalMilliseconds: 1_000,
        renderMilliseconds: 3_000,
      },
    });

    expect(update.action).toBe("reduced");
    expect(update.isRenderSlow).toBe(true);
    expect(update.isSourceSlow).toBe(false);
    expect(update.state).toEqual({
      fastRunCount: 0,
      renderedPointBudget: 180_000,
    });
  });

  it("reduces source budgets when range-read, decode, or worker work is slow", () => {
    const update = updateCopcCameraStreamAdaptiveBudget({
      limits,
      timings: {
        totalMilliseconds: 50_000,
        renderMilliseconds: 1,
        decodeMilliseconds: 1,
        workerMilliseconds: 1,
        roundTripMilliseconds: 1,
      },
    });

    expect(update.action).toBe("reduced");
    expect(update.isRenderSlow).toBe(false);
    expect(update.isSourceSlow).toBe(true);
    expect(update.state).toEqual({
      fastRunCount: 0,
      sourcePointBudget: 405_000,
      nodePointBudget: 36_000,
      pointDataLengthBudget: 7_549_747,
      nodePointDataLengthBudget: 943_718,
    });
  });

  it("keeps the default source-point floor high enough after repeated slow source work", () => {
    const firstUpdate = updateCopcCameraStreamAdaptiveBudget({
      limits,
      timings: {
        totalMilliseconds: 50_000,
        renderMilliseconds: 1,
      },
    });
    const secondUpdate = updateCopcCameraStreamAdaptiveBudget({
      limits,
      state: firstUpdate.state,
      timings: {
        totalMilliseconds: 50_000,
        renderMilliseconds: 1,
      },
    });

    expect(secondUpdate.state.sourcePointBudget).toBe(360_000);
  });

  it("recovers adaptive limits only after a stable streak", () => {
    const state = {
      renderedPointBudget: 120_000,
      sourcePointBudget: 450_000,
      nodePointBudget: 40_000,
      pointDataLengthBudget: 8 * 1024 * 1024,
      nodePointDataLengthBudget: 1 * 1024 * 1024,
      fastRunCount: 2,
    };
    const update = updateCopcCameraStreamAdaptiveBudget({
      limits,
      state,
      timings: {
        totalMilliseconds: 1_000,
        renderMilliseconds: 200,
        decodeMilliseconds: 100,
        workerMilliseconds: 100,
        roundTripMilliseconds: 100,
      },
    });

    expect(update.action).toBe("recovered");
    expect(update.isStableForRecovery).toBe(true);
    expect(update.state).toEqual({
      fastRunCount: 0,
      renderedPointBudget: 150_000,
      sourcePointBudget: 562_500,
      nodePointBudget: 50_000,
      pointDataLengthBudget: 10_485_760,
      nodePointDataLengthBudget: 1_310_720,
    });
  });

  it("clears adaptive state once recovered to configured limits", () => {
    const update = updateCopcCameraStreamAdaptiveBudget({
      limits,
      state: {
        renderedPointBudget: 230_000,
        sourcePointBudget: 890_000,
        nodePointBudget: 79_000,
        pointDataLengthBudget: 16 * 1024 * 1024 - 1,
        nodePointDataLengthBudget: 2 * 1024 * 1024 - 1,
        fastRunCount: 2,
      },
      timings: {
        totalMilliseconds: 1_000,
        renderMilliseconds: 200,
      },
    });

    expect(update.action).toBe("recovered");
    expect(update.state).toEqual({
      fastRunCount: 0,
    });
  });
});
