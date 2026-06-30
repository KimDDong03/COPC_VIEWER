import type {
  CopcHierarchyPageReference,
} from "./CopcHierarchySummary";
import type { CopcTargetPoint } from "./suggestHierarchyNode";

export interface SelectHierarchyPagesForTargetOptions {
  readonly target: CopcTargetPoint;
  readonly maxPages?: number;
  readonly minDepth?: number;
  readonly maxDepth?: number;
}

export interface CopcHierarchyPageTargetSelection {
  readonly pages: readonly CopcHierarchyPageReference[];
  readonly reason: string;
}

const DEFAULT_MAX_PAGES = 2;

export function selectHierarchyPagesForTarget(
  pages: readonly CopcHierarchyPageReference[],
  options: SelectHierarchyPagesForTargetOptions,
): CopcHierarchyPageTargetSelection | undefined {
  if (pages.length === 0) {
    return undefined;
  }

  assertFiniteTarget(options.target);

  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const minDepth = options.minDepth ?? 0;
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;

  if (!Number.isSafeInteger(maxPages) || maxPages <= 0) {
    throw new Error("maxPages must be a positive integer.");
  }

  if (!Number.isSafeInteger(minDepth) || minDepth < 0) {
    throw new Error("minDepth must be a non-negative integer.");
  }

  if (maxDepth !== Number.POSITIVE_INFINITY) {
    if (!Number.isSafeInteger(maxDepth) || maxDepth < minDepth) {
      throw new Error(
        "maxDepth must be an integer greater than or equal to minDepth.",
      );
    }
  }

  const selectedPages = pages
    .filter((page) => page.depth >= minDepth && page.depth <= maxDepth)
    .map((page) => ({
      page,
      distanceToBounds: distanceToBounds2d(options.target, page),
    }))
    .sort(
      (left, right) =>
        left.distanceToBounds - right.distanceToBounds ||
        left.page.depth - right.page.depth ||
        left.page.key.localeCompare(right.page.key),
    )
    .slice(0, maxPages)
    .map(({ page }) => page);

  if (selectedPages.length === 0) {
    return undefined;
  }

  return {
    pages: selectedPages,
    reason: `Selected ${selectedPages.length} nearest pending hierarchy pages.`,
  };
}

function assertFiniteTarget(target: CopcTargetPoint): void {
  if (
    !Number.isFinite(target.x) ||
    !Number.isFinite(target.y) ||
    !Number.isFinite(target.z)
  ) {
    throw new Error("target must contain finite x, y, and z values.");
  }
}

function distanceToBounds2d(
  target: Pick<CopcTargetPoint, "x" | "y">,
  page: CopcHierarchyPageReference,
): number {
  return Math.hypot(
    distanceToRange(target.x, page.bounds.minX, page.bounds.maxX),
    distanceToRange(target.y, page.bounds.minY, page.bounds.maxY),
  );
}

function distanceToRange(value: number, min: number, max: number): number {
  if (value < min) {
    return min - value;
  }

  if (value > max) {
    return value - max;
  }

  return 0;
}
