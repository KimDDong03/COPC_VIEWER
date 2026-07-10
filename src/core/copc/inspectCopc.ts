import type { CopcInspection } from "./CopcInspection";
import { CopcSource, type CopcSourceInput } from "./CopcSource";

export async function inspectCopc(
  input: CopcSourceInput,
): Promise<CopcInspection> {
  return new CopcSource(input).inspect();
}
