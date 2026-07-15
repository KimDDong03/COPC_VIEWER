import type { CopcHierarchySummary } from "./CopcHierarchySummary";
import {
  CopcSource,
  type CopcSourceInput,
  type LoadHierarchyOptions,
} from "./CopcSource";

export async function loadHierarchySummary(
  input: CopcSourceInput,
  options: LoadHierarchyOptions = {},
): Promise<CopcHierarchySummary> {
  return new CopcSource(input).loadHierarchySummary(options);
}
