import type { CopcHierarchySummary } from "./CopcHierarchySummary";
import { CopcSource, type CopcSourceInput } from "./CopcSource";

export async function loadHierarchySummary(
  input: CopcSourceInput,
): Promise<CopcHierarchySummary> {
  return new CopcSource(input).loadHierarchySummary();
}
