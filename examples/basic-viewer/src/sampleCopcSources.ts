import {
  createDefaultCopcCoordinateTransforms,
  type CopcCoordinateTransformSet,
  type CopcCoordinateTransformFactory,
} from "copc-viewer";
import proj4 from "proj4";

const EPSG_32611 = "EPSG:32611";
const WGS84 = "EPSG:4326";
let projectionsConfigured = false;

export interface CopcSourceConfig {
  readonly label: string;
  readonly url: string;
  readonly description: string;
  readonly coordinateTransforms: CopcCoordinateTransformFactory;
}

export interface SampleCopcSource extends CopcSourceConfig {
  readonly id: string;
}

export const SAMPLE_COPC_SOURCES = [
  {
    id: "autzen-classified",
    label: "Autzen classified",
    url: "https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz",
    description: "Public COPC sample using EPSG:2992 coordinates.",
    coordinateTransforms: createDefaultCopcCoordinateTransforms,
  },
  {
    id: "sofi-stadium",
    label: "SoFi Stadium",
    url: "https://s3.amazonaws.com/hobu-lidar/sofi.copc.laz",
    description: "Public COPC sample using WGS84 / UTM zone 11N coordinates.",
    coordinateTransforms: createSofiCoordinateTransforms,
  },
] as const satisfies readonly SampleCopcSource[];

export const DEFAULT_SAMPLE_COPC_SOURCE = SAMPLE_COPC_SOURCES[0];

export function createCustomCopcSource(url: string): CopcSourceConfig {
  return {
    label: "Custom URL",
    url,
    description: "User-provided COPC URL using the default transform factory.",
    coordinateTransforms: createDefaultCopcCoordinateTransforms,
  };
}

function createSofiCoordinateTransforms(): CopcCoordinateTransformSet {
  configureExampleProjections();

  return {
    toCesium: (x, y, z) => {
      const [longitudeDegrees, latitudeDegrees] = proj4(
        EPSG_32611,
        WGS84,
        [x, y],
      ) as [number, number];

      return {
        longitudeDegrees,
        latitudeDegrees,
        heightMeters: z,
      };
    },
    toCopc: (longitudeDegrees, latitudeDegrees, heightMeters) => {
      const [x, y] = proj4(WGS84, EPSG_32611, [
        longitudeDegrees,
        latitudeDegrees,
      ]) as [number, number];

      return {
        x,
        y,
        z: heightMeters,
      };
    },
    status: {
      kind: "custom",
      label: "EPSG:32611 to WGS84",
    },
  };
}

function configureExampleProjections(): void {
  if (projectionsConfigured) {
    return;
  }

  proj4.defs(
    EPSG_32611,
    "+proj=utm +zone=11 +datum=WGS84 +units=m +no_defs +type=crs",
  );
  projectionsConfigured = true;
}
