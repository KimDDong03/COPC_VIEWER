import {
  Cartesian3,
  Color,
  PointPrimitiveCollection,
  type Scene,
} from "cesium";
import type { PointColor, PointSample } from "../core/PointSample";
import type { CopcPointCloudRenderer } from "./CopcPointCloudRenderer";

const DEFAULT_POINT_COLOR = Color.CYAN;
const DEFAULT_PIXEL_SIZE = 3;
const DEFAULT_OUTLINE_WIDTH = 0;

export interface CesiumPointPrimitiveRendererOptions {
  readonly pixelSize?: number;
  readonly outlineColor?: Color;
  readonly outlineWidth?: number;
}

export class CesiumPointPrimitiveRenderer implements CopcPointCloudRenderer {
  private readonly scene: Scene;
  private readonly collection: PointPrimitiveCollection;
  private readonly pixelSize: number;
  private readonly outlineColor: Color;
  private readonly outlineWidth: number;
  private destroyed = false;

  constructor(scene: Scene, options: CesiumPointPrimitiveRendererOptions = {}) {
    this.scene = scene;
    this.pixelSize = readPositiveNumber(
      options.pixelSize,
      DEFAULT_PIXEL_SIZE,
      "pixelSize",
    );
    this.outlineColor = options.outlineColor ?? Color.BLACK;
    this.outlineWidth = readNonNegativeNumber(
      options.outlineWidth,
      DEFAULT_OUTLINE_WIDTH,
      "outlineWidth",
    );
    this.collection = scene.primitives.add(new PointPrimitiveCollection());
  }

  setPoints(points: readonly PointSample[]): void {
    this.assertNotDestroyed();
    this.clear();

    for (const point of points) {
      this.collection.add({
        position: Cartesian3.fromDegrees(
          point.longitudeDegrees,
          point.latitudeDegrees,
          point.heightMeters,
        ),
        color: point.color
          ? toCesiumColor(point.color)
          : DEFAULT_POINT_COLOR,
        pixelSize: this.pixelSize,
        outlineColor: this.outlineColor,
        outlineWidth: this.outlineWidth,
      });
    }
  }

  clear(): void {
    if (this.destroyed) {
      return;
    }

    this.collection.removeAll();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.clear();
    this.scene.primitives.remove(this.collection);
    this.destroyed = true;
  }

  protected get rendererName(): string {
    return "CesiumPointPrimitiveRenderer";
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error(`${this.rendererName} has been destroyed.`);
    }
  }
}

function toCesiumColor(color: PointColor): Color {
  return Color.fromBytes(
    color.red,
    color.green,
    color.blue,
    color.alpha ?? 255,
  );
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

function readNonNegativeNumber(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }

  return value;
}
