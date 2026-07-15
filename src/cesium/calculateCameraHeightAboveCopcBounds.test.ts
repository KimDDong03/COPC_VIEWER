import { describe, expect, it } from "vitest";
import type { CopcBounds } from "../core/copc/CopcInspection";
import { calculateCameraHeightAboveCopcBoundsMeters } from "./calculateCameraHeightAboveCopcBounds";

describe("calculateCameraHeightAboveCopcBoundsMeters", () => {
  it("uses the highest transformed top corner for a sea-level cloud", () => {
    const bounds = createBounds({ maxZ: 100 });

    expect(
      calculateCameraHeightAboveCopcBoundsMeters(
        680,
        bounds,
        (x, y, z) => ({
          longitudeDegrees: x,
          latitudeDegrees: y,
          heightMeters: z + x * 10 + y * 20,
        }),
      ),
    ).toBe(550);
  });

  it("measures altitude above a high-elevation cloud and clamps below it", () => {
    const bounds = createBounds({ minZ: 2_700, maxZ: 2_804 });
    const transform = (x: number, y: number, z: number) => ({
      longitudeDegrees: x,
      latitudeDegrees: y,
      heightMeters: z,
    });

    expect(
      calculateCameraHeightAboveCopcBoundsMeters(3_354, bounds, transform),
    ).toBe(550);
    expect(
      calculateCameraHeightAboveCopcBoundsMeters(2_700, bounds, transform),
    ).toBe(0);
  });

  it("uses transformed vertical units instead of raw COPC z values", () => {
    const bounds = createBounds({ minZ: 8_000, maxZ: 10_000 });

    expect(
      calculateCameraHeightAboveCopcBoundsMeters(
        3_548,
        bounds,
        (x, y, z) => ({
          longitudeDegrees: x,
          latitudeDegrees: y,
          heightMeters: z * 0.3048,
        }),
      ),
    ).toBeCloseTo(500);
  });
});

function createBounds(
  overrides: Partial<CopcBounds> = {},
): CopcBounds {
  return {
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: 1,
    maxY: 1,
    maxZ: 1,
    ...overrides,
  };
}
