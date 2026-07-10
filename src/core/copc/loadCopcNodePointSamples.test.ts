import { describe, expect, it } from "vitest";
import {
  sampleCopcPointDataView,
  type CopcPointDataView,
} from "./loadCopcNodePointSamples";

describe("sampleCopcPointDataView", () => {
  it("samples positions and normalizes 16-bit colors from a decoded point view", () => {
    const view = createPointDataView({
      X: [10, 20, 30, 40],
      Y: [1, 2, 3, 4],
      Z: [100, 200, 300, 400],
      Red: [0, 65_535, 32_768, 257],
      Green: [257, 32_768, 65_535, 0],
      Blue: [65_535, 257, 0, 32_768],
    });

    const result = sampleCopcPointDataView({
      nodeKey: "1-0-0-0",
      view,
      maxPointCount: 2,
    });

    expect(result).toEqual({
      nodeKey: "1-0-0-0",
      nodePointCount: 4,
      sampledPointCount: 2,
      points: [
        {
          x: 10,
          y: 1,
          z: 100,
          color: {
            red: 0,
            green: 1,
            blue: 255,
          },
        },
        {
          x: 30,
          y: 3,
          z: 300,
          color: {
            red: 128,
            green: 255,
            blue: 0,
          },
        },
      ],
    });
  });

  it("can sample positions and colors into typed arrays", () => {
    const view = createPointDataView({
      X: [10, 20, 30, 40],
      Y: [1, 2, 3, 4],
      Z: [100, 200, 300, 400],
      Red: [0, 65_535, 32_768, 257],
      Green: [257, 32_768, 65_535, 0],
      Blue: [65_535, 257, 0, 32_768],
    });

    const result = sampleCopcPointDataView({
      nodeKey: "1-0-0-0",
      view,
      maxPointCount: 2,
      sampleFormat: "typed",
    });

    expect(result.points).toEqual([]);
    expect(result.pointData?.x).toEqual(new Float64Array([10, 30]));
    expect(result.pointData?.y).toEqual(new Float64Array([1, 3]));
    expect(result.pointData?.z).toEqual(new Float64Array([100, 300]));
    expect(result.pointData?.red).toEqual(new Uint8Array([0, 128]));
    expect(result.pointData?.green).toEqual(new Uint8Array([1, 255]));
    expect(result.pointData?.blue).toEqual(new Uint8Array([255, 0]));
  });
});

function createPointDataView(
  dimensions: Record<string, readonly number[]>,
): CopcPointDataView {
  const pointCount = Object.values(dimensions)[0]?.length ?? 0;

  return {
    pointCount,
    dimensions,
    getter: (name) => {
      const values = dimensions[name];

      if (!values) {
        throw new Error(`No test dimension: ${name}`);
      }

      return (index) => {
        const value = values[index];

        if (value === undefined) {
          throw new Error(`No test value at ${index} for ${name}`);
        }

        return value;
      };
    },
  };
}
