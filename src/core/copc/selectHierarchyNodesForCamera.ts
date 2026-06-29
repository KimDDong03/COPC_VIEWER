import type { CopcBounds } from "./CopcInspection";
import type { CopcHierarchyNodeSummary } from "./CopcHierarchySummary";
import type { CopcTargetPoint } from "./suggestHierarchyNode";

export interface SelectHierarchyNodesForCameraOptions {
  readonly target: CopcTargetPoint;
  readonly viewportHeightPixels: number;
  readonly maxNodes?: number;
  readonly minDepth?: number;
  readonly maxDepth?: number;
  readonly targetNodeScreenPixels?: number;
}

export interface CopcHierarchyNodeCameraSelection {
  readonly nodes: readonly CopcHierarchyNodeSummary[];
  readonly targetDepth: number;
  readonly selectedDepth: number;
  readonly estimatedRootScreenPixels: number;
  readonly reason: string;
}

const DEFAULT_MAX_NODES = 4;
const DEFAULT_TARGET_NODE_SCREEN_PIXELS = 220;

export function selectHierarchyNodesForCamera(
  nodes: readonly CopcHierarchyNodeSummary[],
  options: SelectHierarchyNodesForCameraOptions,
): CopcHierarchyNodeCameraSelection | undefined {
  if (nodes.length === 0) {
    return undefined;
  }

  assertFiniteTarget(options.target);

  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const viewportHeightPixels = options.viewportHeightPixels;
  const targetNodeScreenPixels =
    options.targetNodeScreenPixels ?? DEFAULT_TARGET_NODE_SCREEN_PIXELS;

  if (!Number.isSafeInteger(maxNodes) || maxNodes <= 0) {
    throw new Error("maxNodes must be a positive integer.");
  }

  if (!Number.isFinite(viewportHeightPixels) || viewportHeightPixels <= 0) {
    throw new Error("viewportHeightPixels must be a positive finite number.");
  }

  if (!Number.isFinite(targetNodeScreenPixels) || targetNodeScreenPixels <= 0) {
    throw new Error("targetNodeScreenPixels must be a positive finite number.");
  }

  const hierarchyMaxDepth = maxNodeDepth(nodes);
  const minDepth = options.minDepth ?? 0;
  const maxDepth = options.maxDepth ?? hierarchyMaxDepth;

  if (!Number.isSafeInteger(minDepth) || minDepth < 0) {
    throw new Error("minDepth must be a non-negative integer.");
  }

  if (!Number.isSafeInteger(maxDepth) || maxDepth < minDepth) {
    throw new Error("maxDepth must be an integer greater than or equal to minDepth.");
  }

  const boundedMinDepth = Math.min(minDepth, hierarchyMaxDepth);
  const boundedMaxDepth = Math.min(maxDepth, hierarchyMaxDepth);
  const availableDepths = sortedAvailableDepths(
    nodes,
    boundedMinDepth,
    boundedMaxDepth,
  );

  if (availableDepths.length === 0) {
    return undefined;
  }

  const rootBounds = boundsForHierarchy(nodes);
  const rootSpan = Math.max(horizontalSpan(rootBounds), Number.EPSILON);
  const distance = Math.max(
    distanceToBounds3d(options.target, rootBounds),
    rootSpan / viewportHeightPixels,
  );
  const estimatedRootScreenPixels = (rootSpan / distance) * viewportHeightPixels;
  const targetDepth = clampInteger(
    Math.floor(Math.log2(estimatedRootScreenPixels / targetNodeScreenPixels)),
    boundedMinDepth,
    boundedMaxDepth,
  );
  const selectedDepth = nearestAvailableDepth(availableDepths, targetDepth);
  const selectedNodes = nodes
    .filter((node) => node.depth === selectedDepth)
    .map((node) => ({
      node,
      distanceToBounds: distanceToBounds3d(options.target, node.bounds),
    }))
    .sort(
      (left, right) =>
        left.distanceToBounds - right.distanceToBounds ||
        right.node.pointCount - left.node.pointCount ||
        left.node.key.localeCompare(right.node.key),
    )
    .slice(0, maxNodes)
    .map(({ node }) => node);

  return {
    nodes: selectedNodes,
    targetDepth,
    selectedDepth,
    estimatedRootScreenPixels,
    reason: `Selected ${selectedNodes.length} nearest depth ${selectedDepth} nodes for the current camera.`,
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

function maxNodeDepth(nodes: readonly CopcHierarchyNodeSummary[]): number {
  return nodes.reduce((depth, node) => Math.max(depth, node.depth), 0);
}

function sortedAvailableDepths(
  nodes: readonly CopcHierarchyNodeSummary[],
  minDepth: number,
  maxDepth: number,
): number[] {
  return [...new Set(nodes.map((node) => node.depth))]
    .filter((depth) => depth >= minDepth && depth <= maxDepth)
    .sort((left, right) => left - right);
}

function nearestAvailableDepth(
  availableDepths: readonly number[],
  targetDepth: number,
): number {
  return availableDepths.reduce((nearestDepth, depth) =>
    Math.abs(depth - targetDepth) < Math.abs(nearestDepth - targetDepth)
      ? depth
      : nearestDepth,
  );
}

function boundsForHierarchy(
  nodes: readonly CopcHierarchyNodeSummary[],
): CopcBounds {
  const rootNode = nodes.find((node) => node.depth === 0);

  if (rootNode) {
    return rootNode.bounds;
  }

  return nodes.reduce<CopcBounds>(
    (bounds, node) => ({
      minX: Math.min(bounds.minX, node.bounds.minX),
      minY: Math.min(bounds.minY, node.bounds.minY),
      minZ: Math.min(bounds.minZ, node.bounds.minZ),
      maxX: Math.max(bounds.maxX, node.bounds.maxX),
      maxY: Math.max(bounds.maxY, node.bounds.maxY),
      maxZ: Math.max(bounds.maxZ, node.bounds.maxZ),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  );
}

function horizontalSpan(bounds: CopcBounds): number {
  return Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
}

function distanceToBounds3d(target: CopcTargetPoint, bounds: CopcBounds): number {
  return Math.hypot(
    distanceToRange(target.x, bounds.minX, bounds.maxX),
    distanceToRange(target.y, bounds.minY, bounds.maxY),
    distanceToRange(target.z, bounds.minZ, bounds.maxZ),
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

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
