import type { CopcNodePointSampleResult } from "./CopcPointDataSample";
import { CopcSource, type CopcSourceInput } from "./CopcSource";
import type { LoadNodePointSamplesOptions } from "./CopcSource";

export async function loadNodePointSamples(
  input: CopcSourceInput,
  options: LoadNodePointSamplesOptions = {},
): Promise<CopcNodePointSampleResult> {
  return new CopcSource(input).loadNodePointSamples(options);
}
