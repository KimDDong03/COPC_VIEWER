import { describe, expect, it } from "vitest";
import type { CopcPointDataSampleArrays } from "../core/copc/CopcPointDataSample";
import {
  colorizeCopcPoint,
  colorizeCopcPointSample,
} from "./copcPointColorizer";

describe("colorizeCopcPoint", () => {
  it("preserves RGB ahead of classification and intensity fallbacks", () => {
    const pointData = createPointData({
      red: new Uint8Array([10]),
      green: new Uint8Array([20]),
      blue: new Uint8Array([30]),
      classification: new Uint8Array([2]),
      intensity: new Uint16Array([65_535]),
    });

    expect(colorizeCopcPoint(pointData, 0)).toBe(0x0a141e);
  });

  it("uses fixed ASPRS colors for ground, vegetation, building, and water", () => {
    const pointData = createPointData({
      classification: new Uint8Array([2, 3, 4, 5, 6, 9]),
    });

    expect(
      Array.from(pointData.classification!, (_value, index) =>
        colorizeCopcPoint(pointData, index),
      ),
    ).toEqual([
      0xa67c52,
      0x78b85c,
      0x489441,
      0x226932,
      0xd2bcac,
      0x347ab7,
    ]);
  });

  it("uses intensity for unclassified or unknown points", () => {
    const pointData = createPointData({
      classification: new Uint8Array([0, 255]),
      intensity: new Uint16Array([0, 65_535]),
    });

    expect(colorizeCopcPoint(pointData, 0)).toBe(0x303030);
    expect(colorizeCopcPoint(pointData, 1)).toBe(0xffffff);
  });

  it("uses a neutral fallback for an unclassified point without intensity", () => {
    const pointData = createPointData({
      classification: new Uint8Array([0]),
    });

    expect(colorizeCopcPoint(pointData, 0)).toBe(0x9ea3a8);
  });

  it("maps intensity to a readable gamma-adjusted grayscale", () => {
    const pointData = createPointData({
      intensity: new Uint16Array([0, 16_384, 65_535]),
    });

    expect(colorizeCopcPoint(pointData, 0)).toBe(0x303030);
    expect(colorizeCopcPoint(pointData, 1)).toBe(0x989898);
    expect(colorizeCopcPoint(pointData, 2)).toBe(0xffffff);
  });

  it("keeps the existing cyan fallback when no color dimensions exist", () => {
    expect(colorizeCopcPoint(createPointData({}), 0)).toBe(0x00ffff);
  });

  it("colorizes object samples with the same fallback order", () => {
    const rgb = { red: 1, green: 2, blue: 3 };

    expect(
      colorizeCopcPointSample({
        x: 0,
        y: 0,
        z: 0,
        color: rgb,
        classification: 2,
        intensity: 65_535,
      }),
    ).toBe(rgb);
    expect(
      colorizeCopcPointSample({ x: 0, y: 0, z: 0, classification: 9 }),
    ).toEqual({ red: 52, green: 122, blue: 183 });
    expect(
      colorizeCopcPointSample({ x: 0, y: 0, z: 0, intensity: 0 }),
    ).toEqual({ red: 48, green: 48, blue: 48 });
    expect(
      colorizeCopcPointSample({
        x: 0,
        y: 0,
        z: 0,
        classification: 1,
        intensity: 65_535,
      }),
    ).toEqual({ red: 255, green: 255, blue: 255 });
    expect(colorizeCopcPointSample({ x: 0, y: 0, z: 0 })).toEqual({
      red: 0,
      green: 255,
      blue: 255,
    });
  });
});

function createPointData(
  attributes: Partial<CopcPointDataSampleArrays>,
): CopcPointDataSampleArrays {
  return {
    x: new Float64Array([0, 0, 0, 0, 0, 0]),
    y: new Float64Array([0, 0, 0, 0, 0, 0]),
    z: new Float64Array([0, 0, 0, 0, 0, 0]),
    ...attributes,
  };
}
