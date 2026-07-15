import {
  createDefaultCopcCoordinateTransforms,
  createProj4CoordinateTransforms,
  type CopcCoordinateTransformFactory,
  type CopcSourceInput,
} from "copc-cesium";
import { LIVE_COPC_SAMPLE_URLS } from "../../../config/live-copc-sources.mjs";

export interface CopcSourceConfig {
  readonly label: string;
  readonly url: string;
  readonly source?: CopcSourceInput;
  readonly description: string;
  readonly coordinateTransforms: CopcCoordinateTransformFactory;
}

export interface SampleCopcSource extends CopcSourceConfig {
  readonly id: string;
}

export interface CustomCopcProjectionOptions {
  readonly sourceCrs?: string;
  readonly sourceDefinition?: string;
}

export const SAMPLE_COPC_SOURCES = [
  {
    id: "autzen-classified",
    label: "Autzen classified",
    url: LIVE_COPC_SAMPLE_URLS.autzenClassified,
    description:
      "CC BY 4.0 Autzen COPC: Aaron Reyna/Watershed Sciences (2010 source), Max Sampson/Hobu (2021 classification), PDAL/data; license: https://github.com/PDAL/data/blob/main/LICENSE. Uses EPSG:2992 coordinates.",
    coordinateTransforms: createDefaultCopcCoordinateTransforms,
  },
  {
    id: "millsite-reservoir",
    label: "Millsite Reservoir (USGS 3DEP)",
    url: LIVE_COPC_SAMPLE_URLS.millsiteReservoir,
    description:
      "Hobu-hosted COPC matching the public-domain USGS 3DEP Millsite collection, using NAD83(2011) / UTM zone 12N coordinates detected from its WKT metadata.",
    coordinateTransforms: createDefaultCopcCoordinateTransforms,
  },
] as const satisfies readonly SampleCopcSource[];

export const DEFAULT_SAMPLE_COPC_SOURCE = SAMPLE_COPC_SOURCES[0];

export function createCustomCopcSource(
  url: string,
  projection: CustomCopcProjectionOptions = {},
): CopcSourceConfig {
  const sourceCrs = projection.sourceCrs?.trim();
  const sourceDefinition = projection.sourceDefinition?.trim();

  if (sourceDefinition && !sourceCrs) {
    throw new Error("Source CRS is required when a proj4 definition is set.");
  }

  if (sourceCrs) {
    return {
      label: "Custom URL",
      url,
      description: `User-provided COPC URL using ${sourceCrs} coordinates.`,
      coordinateTransforms: createProj4CoordinateTransforms({
        sourceCrs,
        sourceDefinition: sourceDefinition || undefined,
      }),
    };
  }

  return {
    label: "Custom URL",
    url,
    description: "User-provided COPC URL using the default transform factory.",
    coordinateTransforms: createDefaultCopcCoordinateTransforms,
  };
}

export function createLocalFileCopcSource(
  file: File,
  projection: CustomCopcProjectionOptions = {},
): CopcSourceConfig {
  const sourceCrs = projection.sourceCrs?.trim();
  const sourceDefinition = projection.sourceDefinition?.trim();

  if (sourceDefinition && !sourceCrs) {
    throw new Error("Source CRS is required when a proj4 definition is set.");
  }

  if (sourceCrs) {
    return {
      label: "Local file",
      url: file.name,
      source: file,
      description: `Browser-selected COPC file using ${sourceCrs} coordinates.`,
      coordinateTransforms: createProj4CoordinateTransforms({
        sourceCrs,
        sourceDefinition: sourceDefinition || undefined,
      }),
    };
  }

  return {
    label: "Local file",
    url: file.name,
    source: file,
    description:
      "Browser-selected COPC file using the default transform factory.",
    coordinateTransforms: createDefaultCopcCoordinateTransforms,
  };
}
