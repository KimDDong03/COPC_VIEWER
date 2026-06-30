export interface SampleCopcSource {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly description: string;
}

export const SAMPLE_COPC_SOURCES = [
  {
    id: "autzen-classified",
    label: "Autzen classified",
    url: "https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz",
    description: "Public COPC sample using EPSG:2992 coordinates.",
  },
] as const satisfies readonly SampleCopcSource[];

export const DEFAULT_SAMPLE_COPC_SOURCE = SAMPLE_COPC_SOURCES[0];
