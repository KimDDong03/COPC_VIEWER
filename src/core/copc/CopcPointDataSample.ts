export interface CopcPointColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

export interface CopcPointDataSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color?: CopcPointColor;
}

export interface CopcRootPointSampleResult {
  readonly rootPointCount: number;
  readonly sampledPointCount: number;
  readonly points: readonly CopcPointDataSample[];
}
