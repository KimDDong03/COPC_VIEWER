export interface PointColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha?: number;
}

export interface PointSample {
  readonly longitudeDegrees: number;
  readonly latitudeDegrees: number;
  readonly heightMeters: number;
  readonly color?: PointColor;
}
