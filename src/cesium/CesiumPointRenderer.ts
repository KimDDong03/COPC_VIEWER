import {
  Cartesian3,
  Color,
  PointPrimitiveCollection,
  Scene,
} from "cesium";
import type { PointColor, PointSample } from "../core/PointSample";

const DEFAULT_POINT_COLOR = Color.CYAN;
const DEFAULT_PIXEL_SIZE = 12;

export class CesiumPointRenderer {
  private readonly collection: PointPrimitiveCollection;

  constructor(scene: Scene) {
    this.collection = scene.primitives.add(new PointPrimitiveCollection());
  }

  setPoints(points: readonly PointSample[]): void {
    this.collection.removeAll();

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
        pixelSize: DEFAULT_PIXEL_SIZE,
        outlineColor: Color.BLACK,
        outlineWidth: 1,
      });
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
