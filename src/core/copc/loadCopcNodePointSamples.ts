import { Copc } from "copc";
import type { Copc as CopcData, Getter, Hierarchy } from "copc";
import { getSharedLazPerf } from "./createLazPerf";
import type {
  CopcNodePointSampleResult,
  CopcPointColor,
  CopcPointDataSampleArrays,
  CopcPointDataSample,
  CopcPointSampleFormat,
} from "./CopcPointDataSample";

export interface LoadCopcNodePointSamplesOptions {
  readonly getter: Getter;
  readonly copc: CopcData;
  readonly nodeKey: string;
  readonly node: Hierarchy.Node;
  readonly maxPointCount: number;
  readonly sampleFormat?: CopcPointSampleFormat;
}

export interface LoadCopcNodePointDataViewOptions {
  readonly getter: Getter;
  readonly copc: CopcData;
  readonly node: Hierarchy.Node;
}

export interface SampleCopcPointDataViewOptions {
  readonly nodeKey: string;
  readonly view: CopcPointDataView;
  readonly maxPointCount: number;
  readonly sampleFormat?: CopcPointSampleFormat;
}

export interface CopcPointDataView {
  readonly pointCount: number;
  readonly dimensions: Record<string, unknown>;
  getter(name: string): (index: number) => number;
}

export async function loadCopcNodePointSamples(
  options: LoadCopcNodePointSamplesOptions,
): Promise<CopcNodePointSampleResult> {
  const view = await loadCopcNodePointDataView(options);

  return sampleCopcPointDataView({
    nodeKey: options.nodeKey,
    view,
    maxPointCount: options.maxPointCount,
    sampleFormat: options.sampleFormat,
  });
}

export async function loadCopcNodePointDataView(
  options: LoadCopcNodePointDataViewOptions,
): Promise<CopcPointDataView> {
  return Copc.loadPointDataView(
    options.getter,
    options.copc,
    options.node,
    {
      lazPerf: await getSharedLazPerf(),
      include: ["X", "Y", "Z", "Red", "Green", "Blue"],
    },
  );
}

export function sampleCopcPointDataView(
  options: SampleCopcPointDataViewOptions,
): CopcNodePointSampleResult {
  const { view } = options;
  const getX = view.getter("X");
  const getY = view.getter("Y");
  const getZ = view.getter("Z");
  const colorGetters = getColorGetters(view);
  const sampledPointCount = Math.min(view.pointCount, options.maxPointCount);
  const step = view.pointCount / sampledPointCount;

  if (options.sampleFormat === "typed") {
    return sampleCopcPointDataViewAsTypedArrays({
      nodeKey: options.nodeKey,
      getX,
      getY,
      getZ,
      colorGetters,
      nodePointCount: view.pointCount,
      sampledPointCount,
      step,
    });
  }

  const points: CopcPointDataSample[] = [];

  for (let sampleIndex = 0; sampleIndex < sampledPointCount; sampleIndex += 1) {
    const pointIndex = Math.min(
      view.pointCount - 1,
      Math.floor(sampleIndex * step),
    );

    points.push({
      x: getX(pointIndex),
      y: getY(pointIndex),
      z: getZ(pointIndex),
      color: colorGetters ? colorAt(colorGetters, pointIndex) : undefined,
    });
  }

  return {
    nodeKey: options.nodeKey,
    nodePointCount: view.pointCount,
    sampledPointCount,
    points,
  };
}

function sampleCopcPointDataViewAsTypedArrays(options: {
  readonly nodeKey: string;
  readonly getX: (index: number) => number;
  readonly getY: (index: number) => number;
  readonly getZ: (index: number) => number;
  readonly colorGetters:
    | {
        readonly red: (index: number) => number;
        readonly green: (index: number) => number;
        readonly blue: (index: number) => number;
      }
    | undefined;
  readonly nodePointCount: number;
  readonly sampledPointCount: number;
  readonly step: number;
}): CopcNodePointSampleResult {
  const pointData = createPointDataSampleArrays(
    options.sampledPointCount,
    options.colorGetters !== undefined,
  );

  for (
    let sampleIndex = 0;
    sampleIndex < options.sampledPointCount;
    sampleIndex += 1
  ) {
    const pointIndex = Math.min(
      options.nodePointCount - 1,
      Math.floor(sampleIndex * options.step),
    );
    pointData.x[sampleIndex] = options.getX(pointIndex);
    pointData.y[sampleIndex] = options.getY(pointIndex);
    pointData.z[sampleIndex] = options.getZ(pointIndex);

    if (
      pointData.red &&
      pointData.green &&
      pointData.blue &&
      options.colorGetters
    ) {
      pointData.red[sampleIndex] = normalizeColor(
        options.colorGetters.red(pointIndex),
      );
      pointData.green[sampleIndex] = normalizeColor(
        options.colorGetters.green(pointIndex),
      );
      pointData.blue[sampleIndex] = normalizeColor(
        options.colorGetters.blue(pointIndex),
      );
    }
  }

  return {
    nodeKey: options.nodeKey,
    nodePointCount: options.nodePointCount,
    sampledPointCount: options.sampledPointCount,
    points: [],
    pointData,
  };
}

function createPointDataSampleArrays(
  pointCount: number,
  includeColor: boolean,
): CopcPointDataSampleArrays {
  return {
    x: new Float64Array(pointCount),
    y: new Float64Array(pointCount),
    z: new Float64Array(pointCount),
    red: includeColor ? new Uint8Array(pointCount) : undefined,
    green: includeColor ? new Uint8Array(pointCount) : undefined,
    blue: includeColor ? new Uint8Array(pointCount) : undefined,
  };
}

function getColorGetters(view: {
  readonly dimensions: Record<string, unknown>;
  getter(name: string): (index: number) => number;
}):
  | {
      readonly red: (index: number) => number;
      readonly green: (index: number) => number;
      readonly blue: (index: number) => number;
    }
  | undefined {
  if (!("Red" in view.dimensions) || !("Green" in view.dimensions) || !("Blue" in view.dimensions)) {
    return undefined;
  }

  return {
    red: view.getter("Red"),
    green: view.getter("Green"),
    blue: view.getter("Blue"),
  };
}

function colorAt(
  getters: {
    readonly red: (index: number) => number;
    readonly green: (index: number) => number;
    readonly blue: (index: number) => number;
  },
  pointIndex: number,
): CopcPointColor {
  return {
    red: normalizeColor(getters.red(pointIndex)),
    green: normalizeColor(getters.green(pointIndex)),
    blue: normalizeColor(getters.blue(pointIndex)),
  };
}

function normalizeColor(value: number): number {
  const byteValue = value > 255 ? Math.round(value / 257) : Math.round(value);
  return Math.max(0, Math.min(255, byteValue));
}
