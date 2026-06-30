import { describe, expect, it } from "vitest";
import type { CopcInspection } from "../core";
import { createProj4CoordinateTransforms } from "./copcCoordinateTransform";

describe("createProj4CoordinateTransforms", () => {
  it("creates a reusable proj4-backed COPC/Cesium transform factory", () => {
    const factory = createProj4CoordinateTransforms({
      sourceCrs: "EPSG:32611",
      sourceDefinition:
        "+proj=utm +zone=11 +datum=WGS84 +units=m +no_defs +type=crs",
      label: "EPSG:32611 to WGS84",
    });
    const transforms = factory({} as CopcInspection);

    const cesiumCoordinate = transforms.toCesium(375_764.094, 3_757_204.382, 25);
    const copiedCoordinate = transforms.toCopc?.(
      cesiumCoordinate.longitudeDegrees,
      cesiumCoordinate.latitudeDegrees,
      cesiumCoordinate.heightMeters,
    );

    expect(transforms.status).toEqual({
      kind: "custom",
      label: "EPSG:32611 to WGS84",
    });
    expect(cesiumCoordinate.longitudeDegrees).toBeGreaterThan(-119);
    expect(cesiumCoordinate.longitudeDegrees).toBeLessThan(-118);
    expect(cesiumCoordinate.latitudeDegrees).toBeGreaterThan(33);
    expect(cesiumCoordinate.latitudeDegrees).toBeLessThan(35);
    expect(cesiumCoordinate.heightMeters).toBe(25);
    expect(copiedCoordinate?.x).toBeCloseTo(375_764.094, 3);
    expect(copiedCoordinate?.y).toBeCloseTo(3_757_204.382, 3);
    expect(copiedCoordinate?.z).toBeCloseTo(25, 6);
  });
});
