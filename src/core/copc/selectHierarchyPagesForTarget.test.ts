import { describe, expect, it } from "vitest";
import type { CopcHierarchyPageReference } from "./CopcHierarchySummary";
import { selectHierarchyPagesForTarget } from "./selectHierarchyPagesForTarget";

describe("selectHierarchyPagesForTarget", () => {
  it("selects the nearest pending hierarchy pages to a target", () => {
    const selection = selectHierarchyPagesForTarget(createPages(), {
      target: { x: 85, y: 15, z: 100 },
      maxPages: 2,
    });

    expect(selection?.pages.map((page) => page.key)).toEqual([
      "3-6-1-0",
      "3-7-1-0",
    ]);
  });

  it("respects depth limits", () => {
    const selection = selectHierarchyPagesForTarget(createPages(), {
      target: { x: 85, y: 15, z: 100 },
      maxPages: 2,
      maxDepth: 2,
    });

    expect(selection?.pages.map((page) => page.key)).toEqual(["2-0-0-0"]);
  });

  it("rejects invalid page limits", () => {
    expect(() =>
      selectHierarchyPagesForTarget(createPages(), {
        target: { x: 0, y: 0, z: 0 },
        maxPages: 0,
      }),
    ).toThrow("maxPages must be a positive integer.");
  });
});

function createPages(): CopcHierarchyPageReference[] {
  return [
    createPage("2-0-0-0", 0, 0, 50),
    createPage("3-6-1-0", 75, 12.5, 12.5),
    createPage("3-7-1-0", 87.5, 12.5, 12.5),
  ];
}

function createPage(
  key: string,
  minX: number,
  minY: number,
  size: number,
): CopcHierarchyPageReference {
  const [depth, x, y, z] = key.split("-").map(Number);

  return {
    key,
    depth: depth ?? 0,
    x: x ?? 0,
    y: y ?? 0,
    z: z ?? 0,
    bounds: {
      minX,
      minY,
      minZ: 0,
      maxX: minX + size,
      maxY: minY + size,
      maxZ: size,
    },
    pageOffset: minX,
    pageLength: size,
  };
}
