import { describe, expect, it } from "vitest";
import {
  createCopcCameraStreamCoverageNodeKeys,
  createCopcCameraStreamFinalNodeKeys,
  createCopcCameraStreamPreviewNodeKeys,
  createCopcCameraStreamRenderNodeKeys,
  createCopcNodeAncestorKeys,
  estimateCopcNodeExactOverlapRatio,
  estimateCopcNodeFamilyOverlapRatio,
  filterAncestorCoveredCopcNodeKeys,
  isCopcNodeKeyAncestorOf,
  maxCopcNodeKeyDepth,
  orderCopcCameraStreamNodeKeysForProgressiveCoverage,
  readCopcNodeKeyDepth,
  selectDistributedCopcCameraStreamNodeKeys,
  shouldReuseCopcCameraStreamNodeKeys,
  type CopcCameraStreamHierarchyLike,
  type CopcCameraStreamNodeSummaryLike,
} from "./CopcCameraStreamNodePlan";

describe("COPC camera stream node key utilities", () => {
  it("creates COPC octree ancestor keys from root to the current node", () => {
    expect(createCopcNodeAncestorKeys("5-17-9-1")).toEqual([
      "0-0-0-0",
      "1-1-0-0",
      "2-2-1-0",
      "3-4-2-0",
      "4-8-4-0",
      "5-17-9-1",
    ]);
  });

  it("ignores malformed node keys instead of treating them as reusable", () => {
    expect(createCopcNodeAncestorKeys("not-a-node")).toEqual([]);
    expect(isCopcNodeKeyAncestorOf("0-0-0-0", "not-a-node")).toBe(false);
  });

  it("counts exact, ancestor, and descendant matches as same-family overlap", () => {
    expect(
      estimateCopcNodeFamilyOverlapRatio(
        ["3-4-2-0", "5-0-0-0"],
        ["5-17-9-1", "3-4-2-0", "0-0-0-0", "5-30-30-0"],
      ),
    ).toBe(0.75);
  });

  it("counts only identical node keys as exact overlap", () => {
    expect(
      estimateCopcNodeExactOverlapRatio(
        ["3-4-2-0", "5-0-0-0"],
        ["5-17-9-1", "3-4-2-0", "0-0-0-0", "5-30-30-0"],
      ),
    ).toBe(0.25);
  });

  it("reuses previous stream work only when enough next-view nodes overlap", () => {
    const previousNodeKeys = ["3-4-2-0", "5-0-0-0"];

    expect(
      shouldReuseCopcCameraStreamNodeKeys(
        previousNodeKeys,
        ["5-17-9-1", "3-4-2-0", "5-30-30-0"],
        0.35,
      ),
    ).toBe(true);
    expect(
      shouldReuseCopcCameraStreamNodeKeys(
        previousNodeKeys,
        ["5-30-30-0", "5-31-31-0", "5-32-32-0"],
        0.35,
      ),
    ).toBe(false);
  });

  it("can require exact node overlap before keeping previous stream work", () => {
    expect(
      shouldReuseCopcCameraStreamNodeKeys(
        ["3-4-2-0", "5-0-0-0"],
        ["5-17-9-1", "3-4-2-0", "0-0-0-0", "5-30-30-0"],
        0.35,
        0.25,
      ),
    ).toBe(true);

    expect(
      shouldReuseCopcCameraStreamNodeKeys(
        ["3-4-2-0", "5-0-0-0"],
        ["5-17-9-1", "0-0-0-0", "5-30-30-0"],
        0.35,
        0.25,
      ),
    ).toBe(false);
  });

  it("selects capped node subsets across the full ordered range", () => {
    const nodeKeys = Array.from(
      { length: 12 },
      (_value, index) => `5-${index}-0-0`,
    );

    expect(selectDistributedCopcCameraStreamNodeKeys(nodeKeys, 4)).toEqual([
      "5-0-0-0",
      "5-4-0-0",
      "5-7-0-0",
      "5-11-0-0",
    ]);
  });

  it("keeps all node keys when the cap covers the list", () => {
    const nodeKeys = ["5-0-0-0", "5-1-0-0"];

    expect(selectDistributedCopcCameraStreamNodeKeys(nodeKeys, 4)).toEqual(
      nodeKeys,
    );
  });
});

describe("COPC camera stream node planning", () => {
  it("adds available ancestors before selected detail nodes", () => {
    const selectedNodes = [node("3-5-2-0")];
    const hierarchy = hierarchyWithNodes([
      "0-0-0-0",
      "1-1-0-0",
      "2-2-1-0",
      "3-5-2-0",
    ]);

    expect(
      createCopcCameraStreamRenderNodeKeys(selectedNodes, hierarchy),
    ).toEqual(["0-0-0-0", "1-1-0-0", "2-2-1-0", "3-5-2-0"]);
  });

  it("selects shallow coverage nodes for deep camera selections", () => {
    expect(
      createCopcCameraStreamCoverageNodeKeys(
        ["0-0-0-0", "1-0-0-0", "2-1-1-0", "3-2-2-0", "5-8-8-0"],
        5,
      ),
    ).toEqual(["0-0-0-0", "1-0-0-0", "2-1-1-0"]);
  });

  it("falls back to render nodes when no shallow coverage node exists", () => {
    const renderNodeKeys = ["4-4-4-0", "5-8-8-0"];

    expect(createCopcCameraStreamCoverageNodeKeys(renderNodeKeys, 5)).toBe(
      renderNodeKeys,
    );
  });

  it("keeps selected detail nodes as final nodes and uses coverage as fallback", () => {
    expect(
      createCopcCameraStreamFinalNodeKeys(["5-8-8-0"], ["0-0-0-0"]),
    ).toEqual(["5-8-8-0"]);
    expect(createCopcCameraStreamFinalNodeKeys([], ["0-0-0-0"])).toEqual([
      "0-0-0-0",
    ]);
  });

  it("removes ancestor keys when descendant coverage keys are present", () => {
    expect(
      filterAncestorCoveredCopcNodeKeys([
        "0-0-0-0",
        "1-0-0-0",
        "2-1-0-0",
        "1-1-0-0",
      ]),
    ).toEqual(["2-1-0-0", "1-1-0-0"]);
  });

  it("spreads progressive coverage order across spatial buckets", () => {
    expect(
      orderCopcCameraStreamNodeKeysForProgressiveCoverage([
        "4-0-0-0",
        "4-1-0-0",
        "4-4-0-0",
        "4-5-0-0",
      ]),
    ).toEqual(["4-0-0-0", "4-4-0-0", "4-1-0-0", "4-5-0-0"]);
  });

  it("limits preview nodes by count and compressed point-data budget", () => {
    const coverageNodeKeys = ["2-0-0-0", "2-1-0-0", "2-2-0-0"];
    const hierarchy = hierarchyWithNodeLengths([
      ["2-0-0-0", 4_000],
      ["2-1-0-0", 4_000],
      ["2-2-0-0", 4_000],
    ]);

    expect(
      createCopcCameraStreamPreviewNodeKeys(coverageNodeKeys, hierarchy, {
        maxNodeCount: 3,
        maxPointDataLength: 8_000,
      }),
    ).toEqual(["2-0-0-0", "2-1-0-0"]);
  });

  it("keeps one preview node when the first node already exceeds the byte budget", () => {
    expect(
      createCopcCameraStreamPreviewNodeKeys(
        ["2-0-0-0", "2-1-0-0"],
        hierarchyWithNodeLengths([
          ["2-0-0-0", 9_000],
          ["2-1-0-0", 1_000],
        ]),
        {
          maxNodeCount: 2,
          maxPointDataLength: 8_000,
        },
      ),
    ).toEqual(["2-0-0-0"]);
  });

  it("uses detail preview nodes when every coverage candidate is too large", () => {
    expect(
      createCopcCameraStreamPreviewNodeKeys(
        ["2-0-0-0", "2-1-0-0"],
        hierarchyWithNodeLengths([
          ["2-0-0-0", 900_000],
          ["2-1-0-0", 800_000],
          ["5-0-0-0", 80_000],
          ["5-1-0-0", 80_000],
          ["5-2-0-0", 80_000],
          ["5-3-0-0", 80_000],
        ]),
        {
          detailNodeKeys: [
            "5-0-0-0",
            "5-1-0-0",
            "5-2-0-0",
            "5-3-0-0",
          ],
          maxNodeCount: 4,
          maxPointDataLength: 256_000,
        },
      ),
    ).toEqual(["5-0-0-0", "5-1-0-0", "5-2-0-0"]);
  });

  it("keeps coverage preview nodes ahead of detail nodes for the first interactive render", () => {
    expect(
      createCopcCameraStreamPreviewNodeKeys(
        ["2-0-0-0", "2-1-0-0"],
        hierarchyWithNodeLengths([
          ["2-0-0-0", 4_000],
          ["2-1-0-0", 4_000],
          ["5-0-0-0", 1_000],
          ["5-1-0-0", 1_000],
          ["5-2-0-0", 1_000],
          ["5-3-0-0", 1_000],
          ["5-4-0-0", 1_000],
          ["5-5-0-0", 1_000],
        ]),
        {
          detailNodeKeys: [
            "5-0-0-0",
            "5-1-0-0",
            "5-2-0-0",
            "5-3-0-0",
            "5-4-0-0",
            "5-5-0-0",
          ],
          maxNodeCount: 6,
          maxPointDataLength: 8_000,
        },
      ),
    ).toEqual(["2-0-0-0", "2-1-0-0"]);
  });

  it("keeps coverage preview nodes when detail preview would cost much more compressed data", () => {
    expect(
      createCopcCameraStreamPreviewNodeKeys(
        ["2-0-0-0", "2-1-0-0"],
        hierarchyWithNodeLengths([
          ["2-0-0-0", 1_000],
          ["2-1-0-0", 1_000],
          ["5-0-0-0", 1_000],
          ["5-1-0-0", 1_000],
          ["5-2-0-0", 1_000],
          ["5-3-0-0", 1_000],
          ["5-4-0-0", 1_000],
          ["5-5-0-0", 1_000],
        ]),
        {
          detailNodeKeys: [
            "5-0-0-0",
            "5-1-0-0",
            "5-2-0-0",
            "5-3-0-0",
            "5-4-0-0",
            "5-5-0-0",
          ],
          maxNodeCount: 6,
          maxPointDataLength: 8_000,
        },
      ),
    ).toEqual(["2-0-0-0", "2-1-0-0"]);
  });

  it("reads node depths and reports max depth defensively", () => {
    expect(readCopcNodeKeyDepth("5-1-2-3")).toBe(5);
    expect(readCopcNodeKeyDepth("bad")).toBe(Number.MAX_SAFE_INTEGER);
    expect(maxCopcNodeKeyDepth(["1-0-0-0", "5-1-2-3"])).toBe(5);
  });
});

function hierarchyWithNodes(
  nodeKeys: readonly string[],
): CopcCameraStreamHierarchyLike {
  return {
    nodes: nodeKeys.map((nodeKey) => node(nodeKey)),
  };
}

function hierarchyWithNodeLengths(
  entries: ReadonlyArray<readonly [string, number]>,
): CopcCameraStreamHierarchyLike {
  return {
    nodes: entries.map(([key, pointDataLength]) =>
      node(key, pointDataLength),
    ),
  };
}

function node(
  key: string,
  pointDataLength = 1_024,
): CopcCameraStreamNodeSummaryLike {
  return {
    key,
    pointDataLength,
  };
}
