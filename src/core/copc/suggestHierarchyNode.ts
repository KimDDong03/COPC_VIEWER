import type { CopcBounds } from "./CopcInspection";
import type { CopcHierarchyNodeSummary } from "./CopcHierarchySummary";

export interface CopcTargetPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SuggestHierarchyNodeOptions {
  readonly target: CopcTargetPoint;
  readonly preferredDepth?: number;
}

export interface CopcHierarchyNodeSuggestion {
  readonly node: CopcHierarchyNodeSummary;
  readonly distanceToBounds: number;
  readonly reason: string;
}

export function suggestHierarchyNode(
  nodes: readonly CopcHierarchyNodeSummary[],
  options: SuggestHierarchyNodeOptions,
): CopcHierarchyNodeSuggestion | undefined {
  if (nodes.length === 0) {
    return undefined;
  }

  const preferredDepth = options.preferredDepth ?? maxDepth(nodes);
  const candidates = nodes.filter((node) => node.depth === preferredDepth);
  const searchNodes = candidates.length > 0 ? candidates : nodes;
  const suggestion = searchNodes
    .map((node) => ({
      node,
      distanceToBounds: distanceToBounds2d(options.target, node.bounds),
    }))
    .sort(
      (left, right) =>
        left.distanceToBounds - right.distanceToBounds ||
        right.node.depth - left.node.depth ||
        right.node.pointCount - left.node.pointCount,
    )[0];

  if (!suggestion) {
    return undefined;
  }

  return {
    ...suggestion,
    reason: `Nearest depth ${suggestion.node.depth} node to the current camera position.`,
  };
}

function maxDepth(nodes: readonly CopcHierarchyNodeSummary[]): number {
  return nodes.reduce((depth, node) => Math.max(depth, node.depth), 0);
}

function distanceToBounds2d(
  target: Pick<CopcTargetPoint, "x" | "y">,
  bounds: CopcBounds,
): number {
  const dx = distanceToRange(target.x, bounds.minX, bounds.maxX);
  const dy = distanceToRange(target.y, bounds.minY, bounds.maxY);

  return Math.hypot(dx, dy);
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
