import {
  Appearance,
  BoundingSphere,
  Cartesian3,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  Primitive,
  PrimitiveType,
  type Scene,
} from "cesium";
import type { PointColor, PointSample } from "../core/PointSample";
import type {
  CopcPointCloudGeometryBatchRenderer,
  PointGeometryBatch,
  PointSampleBatch,
} from "./CopcPointCloudRenderer";

const DEFAULT_POINT_COLOR: PointColor = {
  red: 0,
  green: 255,
  blue: 255,
  alpha: 255,
};
const DEFAULT_POINT_SIZE = 2;
const DEFAULT_MAX_BATCHES_PER_PRIMITIVE = 8;
const DEFAULT_MAX_GEOMETRY_BATCHES_PER_PRIMITIVE = 1;
const DEFAULT_MAX_POINTS_PER_PRIMITIVE = 240_000;

export interface CesiumPrimitivePointRendererOptions {
  readonly pointSize?: number;
  readonly maxBatchesPerPrimitive?: number;
  readonly maxGeometryBatchesPerPrimitive?: number;
  readonly maxPointsPerPrimitive?: number;
}

interface PointBatchPrimitiveChunk {
  readonly key: string;
  readonly batches: readonly PointSampleBatch[];
  readonly pointCount: number;
}

interface PointGeometryBatchPrimitiveChunk {
  readonly key: string;
  readonly batches: readonly PointGeometryBatch[];
  readonly pointCount: number;
}

/**
 * Cesium Primitive renderer backed by one typed-array Geometry per submitted point set.
 *
 * This path avoids creating one Cesium point object per COPC point. It still performs
 * coordinate conversion on the main thread, but submits positions/colors as compact
 * vertex attributes so the WebGL draw path is closer to the final library target.
 */
export class CesiumPrimitivePointRenderer
  implements CopcPointCloudGeometryBatchRenderer
{
  private readonly scene: Scene;
  private readonly pointSize: number;
  private readonly maxBatchesPerPrimitive: number;
  private readonly maxGeometryBatchesPerPrimitive: number;
  private readonly maxPointsPerPrimitive: number;
  private readonly positionScratch = new Cartesian3();
  private primitive: Primitive | undefined;
  private readonly batchPrimitives = new Map<string, Primitive>();
  private destroyed = false;

  constructor(scene: Scene, options: CesiumPrimitivePointRendererOptions = {}) {
    this.scene = scene;
    this.pointSize = readPositiveNumber(
      options.pointSize,
      DEFAULT_POINT_SIZE,
      "pointSize",
    );
    this.maxBatchesPerPrimitive = readPositiveInteger(
      options.maxBatchesPerPrimitive,
      DEFAULT_MAX_BATCHES_PER_PRIMITIVE,
      "maxBatchesPerPrimitive",
    );
    this.maxGeometryBatchesPerPrimitive = readPositiveInteger(
      options.maxGeometryBatchesPerPrimitive ??
        options.maxBatchesPerPrimitive,
      DEFAULT_MAX_GEOMETRY_BATCHES_PER_PRIMITIVE,
      "maxGeometryBatchesPerPrimitive",
    );
    this.maxPointsPerPrimitive = readPositiveInteger(
      options.maxPointsPerPrimitive,
      DEFAULT_MAX_POINTS_PER_PRIMITIVE,
      "maxPointsPerPrimitive",
    );
  }

  setPoints(points: readonly PointSample[]): void {
    this.assertNotDestroyed();
    this.removePrimitive();
    this.removeBatchPrimitives();

    if (points.length === 0) {
      return;
    }

    this.primitive = this.addPrimitive(points);
  }

  setPointBatches(batches: readonly PointSampleBatch[]): void {
    this.assertNotDestroyed();
    this.removePrimitive();

    const chunks = createPointBatchPrimitiveChunks(batches, {
      maxBatchesPerPrimitive: this.maxBatchesPerPrimitive,
      maxPointsPerPrimitive: this.maxPointsPerPrimitive,
    });
    const nextKeys = new Set(chunks.map((chunk) => chunk.key));
    for (const [key, primitive] of this.batchPrimitives) {
      if (!nextKeys.has(key)) {
        this.scene.primitives.remove(primitive);
        this.batchPrimitives.delete(key);
      }
    }

    for (const chunk of chunks) {
      if (this.batchPrimitives.has(chunk.key)) {
        continue;
      }

      this.batchPrimitives.set(
        chunk.key,
        this.addPrimitive(flattenPointBatchPrimitiveChunk(chunk)),
      );
    }
  }

  setPointGeometryBatches(batches: readonly PointGeometryBatch[]): void {
    this.assertNotDestroyed();
    this.removePrimitive();

    const chunks = createPointGeometryBatchPrimitiveChunks(batches, {
      maxBatchesPerPrimitive: this.maxGeometryBatchesPerPrimitive,
      maxPointsPerPrimitive: this.maxPointsPerPrimitive,
    });
    const nextKeys = new Set(chunks.map((chunk) => chunk.key));
    for (const [key, primitive] of this.batchPrimitives) {
      if (!nextKeys.has(key)) {
        this.scene.primitives.remove(primitive);
        this.batchPrimitives.delete(key);
      }
    }

    for (const chunk of chunks) {
      if (this.batchPrimitives.has(chunk.key)) {
        continue;
      }

      const { colors, positions } =
        flattenPointGeometryBatchPrimitiveChunk(chunk);
      this.batchPrimitives.set(
        chunk.key,
        this.addPrimitiveFromGeometryAttributes(positions, colors),
      );
    }
  }

  clear(): void {
    if (this.destroyed) {
      return;
    }

    this.removePrimitive();
    this.removeBatchPrimitives();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.clear();
    this.destroyed = true;
  }

  private removePrimitive(): void {
    if (!this.primitive) {
      return;
    }

    this.scene.primitives.remove(this.primitive);
    this.primitive = undefined;
  }

  private removeBatchPrimitives(): void {
    for (const primitive of this.batchPrimitives.values()) {
      this.scene.primitives.remove(primitive);
    }

    this.batchPrimitives.clear();
  }

  private addPrimitive(points: readonly PointSample[]): Primitive {
    const { colors, positions } = createGeometryAttributes(
      points,
      this.positionScratch,
    );

    return this.addPrimitiveFromGeometryAttributes(positions, colors);
  }

  private addPrimitiveFromGeometryAttributes(
    positions: Float64Array,
    colors: Uint8Array,
  ): Primitive {
    const attributes = new GeometryAttributes();
    attributes.position = new GeometryAttribute({
      componentDatatype: ComponentDatatype.DOUBLE,
      componentsPerAttribute: 3,
      values: positions,
    });
    attributes.color = new GeometryAttribute({
      componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
      componentsPerAttribute: 4,
      normalize: true,
      values: colors,
    });
    const geometry = new Geometry({
      attributes,
      primitiveType: PrimitiveType.POINTS,
      boundingSphere: BoundingSphere.fromVertices(positions),
    });

    return this.scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({ geometry }),
        appearance: createPointAppearance(this.pointSize),
        asynchronous: false,
        allowPicking: false,
        compressVertices: false,
        releaseGeometryInstances: true,
      }),
    );
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error("CesiumPrimitivePointRenderer has been destroyed.");
    }
  }
}

function createPointBatchPrimitiveChunks(
  batches: readonly PointSampleBatch[],
  options: {
    readonly maxBatchesPerPrimitive: number;
    readonly maxPointsPerPrimitive: number;
  },
): PointBatchPrimitiveChunk[] {
  const chunks: PointBatchPrimitiveChunk[] = [];
  let currentBatches: PointSampleBatch[] = [];
  let currentPointCount = 0;

  const pushCurrentChunk = (): void => {
    if (currentBatches.length === 0 || currentPointCount === 0) {
      return;
    }

    chunks.push({
      key: createPointBatchPrimitiveChunkKey(currentBatches),
      batches: currentBatches,
      pointCount: currentPointCount,
    });
    currentBatches = [];
    currentPointCount = 0;
  };

  for (const batch of batches) {
    if (batch.points.length === 0) {
      continue;
    }

    const exceedsBatchLimit =
      currentBatches.length >= options.maxBatchesPerPrimitive;
    const exceedsPointLimit =
      currentPointCount > 0 &&
      currentPointCount + batch.points.length > options.maxPointsPerPrimitive;

    if (exceedsBatchLimit || exceedsPointLimit) {
      pushCurrentChunk();
    }

    currentBatches.push(batch);
    currentPointCount += batch.points.length;
  }

  pushCurrentChunk();

  return chunks;
}

function createPointBatchPrimitiveChunkKey(
  batches: readonly PointSampleBatch[],
): string {
  return `points:${batches
    .map((batch) => `${batch.key}:${batch.points.length}`)
    .join("|")}`;
}

function flattenPointBatchPrimitiveChunk(
  chunk: PointBatchPrimitiveChunk,
): readonly PointSample[] {
  if (chunk.batches.length === 1) {
    return chunk.batches[0].points;
  }

  const points = new Array<PointSample>(chunk.pointCount);
  let offset = 0;

  for (const batch of chunk.batches) {
    for (let index = 0; index < batch.points.length; index += 1) {
      points[offset] = batch.points[index];
      offset += 1;
    }
  }

  return points;
}

function createPointGeometryBatchPrimitiveChunks(
  batches: readonly PointGeometryBatch[],
  options: {
    readonly maxBatchesPerPrimitive: number;
    readonly maxPointsPerPrimitive: number;
  },
): PointGeometryBatchPrimitiveChunk[] {
  const chunks: PointGeometryBatchPrimitiveChunk[] = [];
  let currentBatches: PointGeometryBatch[] = [];
  let currentPointCount = 0;

  const pushCurrentChunk = (): void => {
    if (currentBatches.length === 0 || currentPointCount === 0) {
      return;
    }

    chunks.push({
      key: createPointGeometryBatchPrimitiveChunkKey(currentBatches),
      batches: currentBatches,
      pointCount: currentPointCount,
    });
    currentBatches = [];
    currentPointCount = 0;
  };

  for (const batch of batches) {
    if (batch.pointCount === 0) {
      continue;
    }

    const exceedsBatchLimit =
      currentBatches.length >= options.maxBatchesPerPrimitive;
    const exceedsPointLimit =
      currentPointCount > 0 &&
      currentPointCount + batch.pointCount > options.maxPointsPerPrimitive;

    if (exceedsBatchLimit || exceedsPointLimit) {
      pushCurrentChunk();
    }

    currentBatches.push(batch);
    currentPointCount += batch.pointCount;
  }

  pushCurrentChunk();

  return chunks;
}

function createPointGeometryBatchPrimitiveChunkKey(
  batches: readonly PointGeometryBatch[],
): string {
  return `geometry:${batches
    .map((batch) => `${batch.key}:${batch.pointCount}`)
    .join("|")}`;
}

function flattenPointGeometryBatchPrimitiveChunk(
  chunk: PointGeometryBatchPrimitiveChunk,
): {
  readonly positions: Float64Array;
  readonly colors: Uint8Array;
} {
  if (chunk.batches.length === 1) {
    const batch = chunk.batches[0];

    return {
      positions: batch.positions,
      colors: batch.colors,
    };
  }

  const positions = new Float64Array(chunk.pointCount * 3);
  const colors = new Uint8Array(chunk.pointCount * 4);
  let pointOffset = 0;

  for (const batch of chunk.batches) {
    positions.set(batch.positions, pointOffset * 3);
    colors.set(batch.colors, pointOffset * 4);
    pointOffset += batch.pointCount;
  }

  return { positions, colors };
}

function createGeometryAttributes(
  points: readonly PointSample[],
  positionScratch: Cartesian3,
): {
  readonly positions: Float64Array;
  readonly colors: Uint8Array;
} {
  const positions = new Float64Array(points.length * 3);
  const colors = new Uint8Array(points.length * 4);

  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    const point = points[pointIndex];
    const position = Cartesian3.fromDegrees(
      point.longitudeDegrees,
      point.latitudeDegrees,
      point.heightMeters,
      undefined,
      positionScratch,
    );
    const positionOffset = pointIndex * 3;
    const colorOffset = pointIndex * 4;
    const color = point.color ?? DEFAULT_POINT_COLOR;

    positions[positionOffset] = position.x;
    positions[positionOffset + 1] = position.y;
    positions[positionOffset + 2] = position.z;
    colors[colorOffset] = color.red;
    colors[colorOffset + 1] = color.green;
    colors[colorOffset + 2] = color.blue;
    colors[colorOffset + 3] = color.alpha ?? 255;
  }

  return { positions, colors };
}

function createPointAppearance(pointSize: number): Appearance {
  const pointSizeLiteral = pointSize.toFixed(3);

  return new Appearance({
    translucent: true,
    vertexShaderSource: `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec4 color;
in float batchId;

out vec4 v_color;

void main()
{
    vec4 p = czm_computePosition();

    v_color = color;
    gl_Position = czm_modelViewProjectionRelativeToEye * p;
    gl_PointSize = ${pointSizeLiteral} * czm_pixelRatio;
}
`,
    fragmentShaderSource: `
in vec4 v_color;

void main()
{
    vec2 pointCenterOffset = gl_PointCoord - vec2(0.5);
    if (dot(pointCenterOffset, pointCenterOffset) > 0.25)
    {
        discard;
    }

    out_FragColor = czm_gammaCorrect(v_color);
}
`,
    renderState: {
      depthTest: {
        enabled: true,
      },
      depthMask: false,
    },
  });
}

function readPositiveNumber(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return value;
}

function readPositiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}
