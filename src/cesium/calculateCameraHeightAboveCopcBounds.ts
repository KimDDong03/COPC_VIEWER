import type { CopcBounds } from "../core/copc/CopcInspection";
import type { CopcToCesiumCoordinateTransform } from "./copcCoordinateTransform";

export function calculateCameraHeightAboveCopcBoundsMeters(
  cameraHeightMeters: number,
  bounds: CopcBounds,
  transform: CopcToCesiumCoordinateTransform,
): number {
  const cloudTopHeightMeters = Math.max(
    transform(bounds.minX, bounds.minY, bounds.maxZ).heightMeters,
    transform(bounds.maxX, bounds.minY, bounds.maxZ).heightMeters,
    transform(bounds.minX, bounds.maxY, bounds.maxZ).heightMeters,
    transform(bounds.maxX, bounds.maxY, bounds.maxZ).heightMeters,
  );

  return Math.max(0, cameraHeightMeters - cloudTopHeightMeters);
}
