import proj4 from "proj4";
import type { CopcInspection } from "../core/copc/CopcInspection";
import type { CopcPointDataSample } from "../core/copc/CopcPointDataSample";
import type { PointSample } from "../core/PointSample";

const EPSG_2992 = "EPSG:2992";
const WGS84 = "EPSG:4326";
const US_SURVEY_FOOT_TO_METER = 0.304800609601219;

let projectionsConfigured = false;

export function createPointSamplesFromCopc(
  points: readonly CopcPointDataSample[],
  inspection: CopcInspection,
): PointSample[] {
  const transform = createTransform(inspection);

  return points.map((point) => {
    const [longitudeDegrees, latitudeDegrees] = transform(point.x, point.y);

    return {
      longitudeDegrees,
      latitudeDegrees,
      heightMeters: heightToMeters(point.z, inspection),
      color: point.color,
    };
  });
}

function createTransform(
  inspection: CopcInspection,
): (x: number, y: number) => [number, number] {
  if (isLikelyGeographic(inspection)) {
    return (x, y) => [x, y];
  }

  if (inspection.wkt?.includes('AUTHORITY["EPSG","2992"]')) {
    configureKnownProjections();
    return (x, y) => proj4(EPSG_2992, WGS84, [x, y]) as [number, number];
  }

  throw new Error(
    "This prototype can only render geographic coordinates or the sample EPSG:2992 COPC CRS.",
  );
}

function configureKnownProjections(): void {
  if (projectionsConfigured) {
    return;
  }

  proj4.defs(
    EPSG_2992,
    "+proj=lcc +lat_0=41.75 +lon_0=-120.5 +lat_1=43 +lat_2=45.5 +x_0=400000 +y_0=0 +datum=NAD83 +units=ft +no_defs +type=crs",
  );
  projectionsConfigured = true;
}

function isLikelyGeographic(inspection: CopcInspection): boolean {
  const { bounds } = inspection;

  return (
    bounds.minX >= -180 &&
    bounds.maxX <= 180 &&
    bounds.minY >= -90 &&
    bounds.maxY <= 90
  );
}

function heightToMeters(z: number, inspection: CopcInspection): number {
  if (inspection.wkt?.includes('VERT_CS["NAVD88 height (ftUS)"')) {
    return z * US_SURVEY_FOOT_TO_METER;
  }

  return z;
}
