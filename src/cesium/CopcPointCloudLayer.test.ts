import type { Scene } from "cesium";
import { describe, expect, it } from "vitest";
import type {
  CopcHierarchySummary,
  CopcInspection,
  PointSample,
} from "../core";
import { CopcPointCloudLayer } from "./CopcPointCloudLayer";
import type {
  CopcCoordinateTransformStatus,
  CopcToCesiumCoordinateTransform,
} from "./copcCoordinateTransform";

describe("CopcPointCloudLayer coordinate transforms", () => {
  it("reports the default geographic transform status from load", async () => {
    const layer = new CopcPointCloudLayer(createSceneStub(), {
      url: "https://example.com/sample.copc.laz",
    });

    patchLayerSource(layer);

    const result = await layer.load();

    expect(result.coordinateTransform).toEqual({
      kind: "geographic",
      label: "Geographic coordinates",
      supportsCameraSelection: true,
    } satisfies CopcCoordinateTransformStatus);
    expect(layer.coordinateTransform).toEqual(result.coordinateTransform);
  });

  it("reports a custom transform status when no explicit status is provided", async () => {
    const layer = new CopcPointCloudLayer(createSceneStub(), {
      url: "https://example.com/sample.copc.laz",
      coordinateTransforms: () => ({
        toCesium: (x, y, z) => ({
          longitudeDegrees: x,
          latitudeDegrees: y,
          heightMeters: z,
        }),
      }),
    });

    patchLayerSource(layer);

    const result = await layer.load();

    expect(result.coordinateTransform).toEqual({
      kind: "custom",
      label: "Custom coordinate transform",
      supportsCameraSelection: false,
    } satisfies CopcCoordinateTransformStatus);
  });

  it("applies the configured transform before sending points and bounds to renderers", async () => {
    const layer = new CopcPointCloudLayer(createSceneStub(), {
      url: "https://example.com/sample.copc.laz",
      coordinateTransforms: () => ({
        toCesium: (x, y, z) => ({
          longitudeDegrees: x + 100,
          latitudeDegrees: y + 200,
          heightMeters: z + 300,
        }),
      }),
    });
    const rendered = captureLayerRendering(layer);

    patchLayerSource(layer);

    const result = await layer.renderNode("0-0-0-0");

    expect(result.points).toEqual([
      {
        longitudeDegrees: 101,
        latitudeDegrees: 202,
        heightMeters: 303,
        color: {
          red: 10,
          green: 20,
          blue: 30,
        },
      },
    ]);
    expect(rendered.points).toEqual(result.points);
    expect(rendered.boundsCoordinate).toEqual({
      longitudeDegrees: 100,
      latitudeDegrees: 200,
      heightMeters: 300,
    });
  });
});

describe("CopcPointCloudLayer hierarchy loading", () => {
  it("keeps load results in sync after loading another hierarchy page", async () => {
    const layer = new CopcPointCloudLayer(createSceneStub(), {
      url: "https://example.com/sample.copc.laz",
    });
    const expandedHierarchy = createHierarchy([
      createHierarchyNode("0-0-0-0"),
      createHierarchyNode("1-0-0-0"),
    ]);

    layer.source.inspect = async () => createInspection();
    layer.source.loadHierarchySummary = async () =>
      createHierarchy([createHierarchyNode("0-0-0-0")]);
    layer.source.loadNextHierarchyPage = async () => expandedHierarchy;

    await layer.load();
    const hierarchy = await layer.loadNextHierarchyPage();
    const loadResult = await layer.load();

    expect(hierarchy).toBe(expandedHierarchy);
    expect(layer.hierarchy).toBe(expandedHierarchy);
    expect(loadResult.hierarchy).toBe(expandedHierarchy);
  });
});

function patchLayerSource(layer: CopcPointCloudLayer): void {
  layer.source.inspect = async () => createInspection();
  layer.source.loadHierarchySummary = async () => createHierarchy();
  layer.source.loadNodePointSamples = async () => ({
    nodeKey: "0-0-0-0",
    nodePointCount: 1,
    sampledPointCount: 1,
    points: [
      {
        x: 1,
        y: 2,
        z: 3,
        color: {
          red: 10,
          green: 20,
          blue: 30,
        },
      },
    ],
  });
}

function captureLayerRendering(layer: CopcPointCloudLayer): {
  boundsCoordinate: unknown;
  points: readonly PointSample[];
} {
  const captured: {
    boundsCoordinate: unknown;
    points: readonly PointSample[];
  } = {
    boundsCoordinate: undefined,
    points: [],
  };
  const mutableLayer = layer as unknown as {
    boundsRenderer: {
      setBounds: (
        bounds: { minX: number; minY: number; minZ: number },
        inspection: CopcInspection,
        transform: CopcToCesiumCoordinateTransform,
      ) => void;
      clear: () => void;
      destroy: () => void;
    };
    pointRenderer: {
      setPoints: (points: readonly PointSample[]) => void;
      clear: () => void;
      destroy: () => void;
    };
  };

  mutableLayer.pointRenderer = {
    setPoints: (points) => {
      captured.points = points;
    },
    clear: () => undefined,
    destroy: () => undefined,
  };
  mutableLayer.boundsRenderer = {
    setBounds: (bounds, _inspection, transform) => {
      captured.boundsCoordinate = transform(bounds.minX, bounds.minY, bounds.minZ);
    },
    clear: () => undefined,
    destroy: () => undefined,
  };

  return captured;
}

function createSceneStub(): Scene {
  return {
    primitives: {
      add: <T>(primitive: T): T => primitive,
      remove: () => true,
    },
  } as unknown as Scene;
}

function createInspection(): CopcInspection {
  return {
    sourceUrl: "https://example.com/sample.copc.laz",
    pointCount: 1,
    lasVersion: "1.4",
    pointDataRecordFormat: 7,
    pointDataRecordLength: 36,
    bounds: createBounds(),
    cube: createBounds(),
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

function createHierarchy(
  nodes: readonly CopcHierarchySummary["nodes"][number][] = [
    createHierarchyNode("0-0-0-0"),
  ],
): CopcHierarchySummary {
  return {
    pageCount: 1,
    loadedPageCount: 1,
    pendingPageCount: 1,
    pendingPages: [
      {
        key: "1-0-0-0",
        pageOffset: 10,
        pageLength: 20,
      },
    ],
    nodes,
  };
}

function createHierarchyNode(key: string): CopcHierarchySummary["nodes"][number] {
  const [depth, x, y, z] = key.split("-").map(Number);

  return {
    key,
    depth: depth ?? 0,
    x: x ?? 0,
    y: y ?? 0,
    z: z ?? 0,
    bounds: createBounds(),
    pointCount: 1,
    pointDensity: 1,
    pointDataOffset: 0,
    pointDataLength: 10,
  };
}

function createBounds(): CopcInspection["bounds"] {
  return {
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: 1,
    maxY: 1,
    maxZ: 1,
  };
}
