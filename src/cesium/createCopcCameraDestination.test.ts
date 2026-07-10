import { Cartographic, Math as CesiumMath } from "cesium";
import { describe, expect, it } from "vitest";
import type { CopcInspection } from "../core";
import {
  createDefaultCopcCoordinateTransforms,
  createProj4CoordinateTransforms,
} from "./copcCoordinateTransform";
import { createCopcCameraDestination } from "./createCopcCameraDestination";

describe("createCopcCameraDestination", () => {
  it("targets the geographic bounds center above the point cloud", () => {
    const inspection = createGeographicInspection();
    const coordinateTransforms = createDefaultCopcCoordinateTransforms(inspection);
    const destination = createCopcCameraDestination(
      inspection,
      coordinateTransforms.toCesium,
      {
        minHeightAboveCloudMeters: 100,
        extentHeightMultiplier: 1,
      },
    );
    const cartographic = Cartographic.fromCartesian(destination);

    expect(CesiumMath.toDegrees(cartographic.longitude)).toBeCloseTo(127, 6);
    expect(CesiumMath.toDegrees(cartographic.latitude)).toBeCloseTo(37, 6);
    expect(cartographic.height).toBeGreaterThan(inspection.bounds.maxZ);
  });

  it("supports custom projected coordinate transforms", () => {
    const inspection = createProjectedInspection();
    const coordinateTransforms = createProj4CoordinateTransforms({
      sourceCrs: "EPSG:32611",
      sourceDefinition:
        "+proj=utm +zone=11 +datum=WGS84 +units=m +no_defs +type=crs",
    })(inspection);
    const destination = createCopcCameraDestination(
      inspection,
      coordinateTransforms.toCesium,
    );
    const cartographic = Cartographic.fromCartesian(destination);
    const longitudeDegrees = CesiumMath.toDegrees(cartographic.longitude);
    const latitudeDegrees = CesiumMath.toDegrees(cartographic.latitude);

    expect(longitudeDegrees).toBeGreaterThan(-119);
    expect(longitudeDegrees).toBeLessThan(-117);
    expect(latitudeDegrees).toBeGreaterThan(33);
    expect(latitudeDegrees).toBeLessThan(35);
  });
});

function createGeographicInspection(): CopcInspection {
  return createInspection({
    minX: 126,
    minY: 36,
    minZ: 10,
    maxX: 128,
    maxY: 38,
    maxZ: 40,
  });
}

function createProjectedInspection(): CopcInspection {
  return createInspection({
    minX: 380_000,
    minY: 3_760_000,
    minZ: 0,
    maxX: 382_000,
    maxY: 3_762_000,
    maxZ: 120,
  });
}

function createInspection(bounds: CopcInspection["bounds"]): CopcInspection {
  return {
    sourceUrl: "https://example.com/sample.copc.laz",
    pointCount: 1,
    lasVersion: "1.4",
    pointDataRecordFormat: 7,
    pointDataRecordLength: 36,
    bounds,
    cube: bounds,
    scale: [1, 1, 1],
    offset: [0, 0, 0],
    spacing: 1,
    gpsTimeRange: [0, 0],
    rootHierarchyPage: {
      pageOffset: 0,
      pageLength: 0,
    },
    vlrs: [],
    wkt: null,
  };
}
