import { Copc } from "copc";
import { createHttpRangeGetter } from "./createHttpRangeGetter";
import type {
  CopcHierarchyNodeSummary,
  CopcHierarchySummary,
} from "./CopcHierarchySummary";

export async function loadHierarchySummary(
  url: string,
): Promise<CopcHierarchySummary> {
  const getter = createHttpRangeGetter(url);
  const copc = await Copc.create(getter);
  const hierarchy = await Copc.loadHierarchyPage(getter, copc.info.rootHierarchyPage);

  return {
    nodes: Object.entries(hierarchy.nodes)
      .flatMap(([key, node]) => {
        if (!node) {
          return [];
        }

        return [
          {
            ...parseNodeKey(key),
            key,
            pointCount: node.pointCount,
            pointDataOffset: node.pointDataOffset,
            pointDataLength: node.pointDataLength,
          },
        ];
      })
      .sort(compareNodes),
    pageCount: Object.values(hierarchy.pages).filter(Boolean).length,
  };
}

function parseNodeKey(
  key: string,
): Pick<CopcHierarchyNodeSummary, "depth" | "x" | "y" | "z"> {
  const parts = key.split("-").map(Number);

  if (parts.length !== 4 || parts.some((part) => !Number.isSafeInteger(part))) {
    throw new Error(`Invalid COPC hierarchy node key: ${key}`);
  }

  const [depth, x, y, z] = parts;

  return {
    depth,
    x,
    y,
    z,
  };
}

function compareNodes(
  left: CopcHierarchyNodeSummary,
  right: CopcHierarchyNodeSummary,
): number {
  return (
    left.depth - right.depth ||
    left.z - right.z ||
    left.y - right.y ||
    left.x - right.x
  );
}
