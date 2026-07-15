import { describe, expect, it } from "vitest";
import type { CopcInspection } from "../core/copc/CopcInspection";
import { createPointSamplesFromCopc } from "./createPointSamplesFromCopc";

describe("createPointSamplesFromCopc", () => {
  it("applies RGB, classification, intensity, and cyan in priority order", () => {
    const rgb = { red: 10, green: 20, blue: 30 };
    const points = createPointSamplesFromCopc(
      [
        {
          x: 1,
          y: 2,
          z: 3,
          color: rgb,
          classification: 2,
          intensity: 65_535,
        },
        { x: 4, y: 5, z: 6, classification: 6, intensity: 0 },
        { x: 7, y: 8, z: 9, intensity: 0 },
        { x: 10, y: 11, z: 12 },
      ],
      {} as CopcInspection,
      (x, y, z) => ({
        longitudeDegrees: x,
        latitudeDegrees: y,
        heightMeters: z,
      }),
    );

    expect(points.map((point) => point.color)).toEqual([
      rgb,
      { red: 210, green: 188, blue: 172 },
      { red: 48, green: 48, blue: 48 },
      { red: 0, green: 255, blue: 255 },
    ]);
  });
});
