import { Cartesian3, Math as CesiumMath } from "cesium";
import type { CopcInspection } from "../core/copc/CopcInspection";
import type { CopcCoordinateTransformSet } from "./copcCoordinateTransform";

const METERS_PER_LATITUDE_DEGREE = 110_540;
const METERS_PER_LONGITUDE_DEGREE_AT_EQUATOR = 111_320;
const DEFAULT_MIN_CAMERA_HEIGHT_METERS = 1_200;
const DEFAULT_EXTENT_HEIGHT_MULTIPLIER = 2.5;
const DEFAULT_VERTICAL_HEIGHT_MULTIPLIER = 4;

export interface CopcCameraDestinationOptions {
  readonly minHeightAboveCloudMeters?: number;
  readonly extentHeightMultiplier?: number;
  readonly verticalHeightMultiplier?: number;
}

interface CesiumBoundsCoordinate {
  readonly longitudeDegrees: number;
  readonly latitudeDegrees: number;
  readonly heightMeters: number;
}

export function createCopcCameraDestination(
  inspection: CopcInspection,
  coordinateTransform: CopcCoordinateTransformSet["toCesium"],
  options: CopcCameraDestinationOptions = {},
): Cartesian3 {
  const boundsCoordinates = createBoundsCoordinates(
    inspection,
    coordinateTransform,
  );
  const longitudeRange = createRange(
    boundsCoordinates.map((coordinate) => coordinate.longitudeDegrees),
  );
  const latitudeRange = createRange(
    boundsCoordinates.map((coordinate) => coordinate.latitudeDegrees),
  );
  const heightRange = createRange(
    boundsCoordinates.map((coordinate) => coordinate.heightMeters),
  );
  const centerLongitudeDegrees = midpoint(longitudeRange);
  const centerLatitudeDegrees = midpoint(latitudeRange);
  const heightAboveCloudMeters = estimateCameraHeightAboveCloud(
    longitudeRange,
    latitudeRange,
    heightRange,
    centerLatitudeDegrees,
    options,
  );

  return Cartesian3.fromDegrees(
    centerLongitudeDegrees,
    centerLatitudeDegrees,
    heightRange.max + heightAboveCloudMeters,
  );
}

function createBoundsCoordinates(
  inspection: CopcInspection,
  coordinateTransform: CopcCoordinateTransformSet["toCesium"],
): readonly CesiumBoundsCoordinate[] {
  const { bounds } = inspection;
  const xs = [bounds.minX, bounds.maxX];
  const ys = [bounds.minY, bounds.maxY];
  const zs = [bounds.minZ, bounds.maxZ];
  const coordinates: CesiumBoundsCoordinate[] = [];

  xs.forEach((x) => {
    ys.forEach((y) => {
      zs.forEach((z) => {
        coordinates.push(coordinateTransform(x, y, z));
      });
    });
  });

  return coordinates;
}

function estimateCameraHeightAboveCloud(
  longitudeRange: Range,
  latitudeRange: Range,
  heightRange: Range,
  centerLatitudeDegrees: number,
  options: CopcCameraDestinationOptions,
): number {
  const longitudeExtentMeters =
    (longitudeRange.max - longitudeRange.min) *
    METERS_PER_LONGITUDE_DEGREE_AT_EQUATOR *
    Math.max(0.1, Math.cos(CesiumMath.toRadians(centerLatitudeDegrees)));
  const latitudeExtentMeters =
    (latitudeRange.max - latitudeRange.min) * METERS_PER_LATITUDE_DEGREE;
  const horizontalExtentMeters = Math.max(
    Math.abs(longitudeExtentMeters),
    Math.abs(latitudeExtentMeters),
  );
  const verticalExtentMeters = Math.max(0, heightRange.max - heightRange.min);
  const minHeightAboveCloudMeters =
    options.minHeightAboveCloudMeters ?? DEFAULT_MIN_CAMERA_HEIGHT_METERS;
  const extentHeightMultiplier =
    options.extentHeightMultiplier ?? DEFAULT_EXTENT_HEIGHT_MULTIPLIER;
  const verticalHeightMultiplier =
    options.verticalHeightMultiplier ?? DEFAULT_VERTICAL_HEIGHT_MULTIPLIER;

  return Math.max(
    minHeightAboveCloudMeters,
    horizontalExtentMeters * extentHeightMultiplier,
    verticalExtentMeters * verticalHeightMultiplier,
  );
}

interface Range {
  readonly min: number;
  readonly max: number;
}

function createRange(values: readonly number[]): Range {
  return values.reduce(
    (range, value) => ({
      min: Math.min(range.min, value),
      max: Math.max(range.max, value),
    }),
    {
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
    },
  );
}

function midpoint(range: Range): number {
  return (range.min + range.max) / 2;
}
