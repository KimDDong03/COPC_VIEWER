import { Copc } from "copc";
import { createHttpRangeGetter } from "./createHttpRangeGetter";
import { getSharedLazPerf } from "./createLazPerf";
import type {
  CopcPointColor,
  CopcPointDataSample,
  CopcRootPointSampleResult,
} from "./CopcPointDataSample";

export interface LoadRootPointSamplesOptions {
  readonly maxPointCount?: number;
}

const DEFAULT_MAX_POINT_COUNT = 5_000;

export async function loadRootPointSamples(
  url: string,
  options: LoadRootPointSamplesOptions = {},
): Promise<CopcRootPointSampleResult> {
  const maxPointCount = options.maxPointCount ?? DEFAULT_MAX_POINT_COUNT;

  if (!Number.isSafeInteger(maxPointCount) || maxPointCount <= 0) {
    throw new Error("maxPointCount must be a positive integer.");
  }

  const getter = createHttpRangeGetter(url);
  const copc = await Copc.create(getter);
  const hierarchy = await Copc.loadHierarchyPage(getter, copc.info.rootHierarchyPage);
  const root = hierarchy.nodes["0-0-0-0"];

  if (!root) {
    throw new Error("COPC root hierarchy node was not found.");
  }

  const view = await Copc.loadPointDataView(getter, copc, root, {
    lazPerf: await getSharedLazPerf(),
    include: ["X", "Y", "Z", "Red", "Green", "Blue"],
  });

  const getX = view.getter("X");
  const getY = view.getter("Y");
  const getZ = view.getter("Z");
  const colorGetters = getColorGetters(view);
  const sampledPointCount = Math.min(view.pointCount, maxPointCount);
  const step = view.pointCount / sampledPointCount;
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
    rootPointCount: view.pointCount,
    sampledPointCount,
    points,
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
  index: number,
): CopcPointColor {
  return {
    red: toByteColor(getters.red(index)),
    green: toByteColor(getters.green(index)),
    blue: toByteColor(getters.blue(index)),
  };
}

function toByteColor(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value / 257)));
}
