export interface CopcCameraStreamNodeSummaryLike {
  readonly key: string;
  readonly pointCount?: number;
  readonly pointDataLength: number;
}

export interface CopcCameraStreamHierarchyLike {
  readonly nodes: readonly CopcCameraStreamNodeSummaryLike[];
}

export interface CopcCameraStreamPreviewNodeKeyOptions {
  readonly detailNodeKeys?: readonly string[];
  readonly maxNodeCount: number;
  readonly maxPointDataLength: number;
}

export function createCopcNodeAncestorKeys(nodeKey: string): readonly string[] {
  const [depth, x, y, z] = nodeKey.split("-").map(Number);

  if (
    !Number.isSafeInteger(depth) ||
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y) ||
    !Number.isSafeInteger(z) ||
    depth < 0
  ) {
    return [];
  }

  return Array.from({ length: depth + 1 }, (_value, ancestorDepth) => {
    const scale = 2 ** (depth - ancestorDepth);

    return [
      ancestorDepth,
      Math.floor(x / scale),
      Math.floor(y / scale),
      Math.floor(z / scale),
    ].join("-");
  });
}

export function isCopcNodeKeyAncestorOf(
  ancestorNodeKey: string,
  descendantNodeKey: string,
): boolean {
  return createCopcNodeAncestorKeys(descendantNodeKey).includes(
    ancestorNodeKey,
  );
}

export function estimateCopcNodeFamilyOverlapRatio(
  previousNodeKeys: readonly string[],
  nextNodeKeys: readonly string[],
): number {
  if (previousNodeKeys.length === 0 || nextNodeKeys.length === 0) {
    return 0;
  }

  const previousNodeKeySet = new Set(previousNodeKeys);
  const previousAncestorNodeKeys = new Set(
    previousNodeKeys.flatMap(createCopcNodeAncestorKeys),
  );
  const overlapCount = nextNodeKeys.filter((nodeKey) => {
    if (
      previousNodeKeySet.has(nodeKey) ||
      previousAncestorNodeKeys.has(nodeKey)
    ) {
      return true;
    }

    return createCopcNodeAncestorKeys(nodeKey).some((ancestorNodeKey) =>
      previousNodeKeySet.has(ancestorNodeKey),
    );
  }).length;

  return overlapCount / nextNodeKeys.length;
}

export function estimateCopcNodeExactOverlapRatio(
  previousNodeKeys: readonly string[],
  nextNodeKeys: readonly string[],
): number {
  if (previousNodeKeys.length === 0 || nextNodeKeys.length === 0) {
    return 0;
  }

  const previousNodeKeySet = new Set(previousNodeKeys);
  const overlapCount = nextNodeKeys.filter((nodeKey) =>
    previousNodeKeySet.has(nodeKey),
  ).length;

  return overlapCount / nextNodeKeys.length;
}

export function shouldReuseCopcCameraStreamNodeKeys(
  previousNodeKeys: readonly string[],
  nextNodeKeys: readonly string[],
  minFamilyOverlapRatio: number,
  minExactOverlapRatio = 0,
): boolean {
  return (
    estimateCopcNodeFamilyOverlapRatio(previousNodeKeys, nextNodeKeys) >=
      minFamilyOverlapRatio &&
    estimateCopcNodeExactOverlapRatio(previousNodeKeys, nextNodeKeys) >=
      minExactOverlapRatio
  );
}

export function selectDistributedCopcCameraStreamNodeKeys(
  nodeKeys: readonly string[],
  maxNodeCount: number,
): readonly string[] {
  if (!Number.isSafeInteger(maxNodeCount) || maxNodeCount <= 0) {
    return [];
  }

  if (nodeKeys.length <= maxNodeCount) {
    return [...nodeKeys];
  }

  if (maxNodeCount === 1) {
    return [nodeKeys[0] ?? ""].filter(Boolean);
  }

  const lastNodeIndex = nodeKeys.length - 1;
  const selectedNodeKeys: string[] = [];

  for (let index = 0; index < maxNodeCount; index += 1) {
    const nodeIndex = Math.round((index * lastNodeIndex) / (maxNodeCount - 1));
    const nodeKey = nodeKeys[nodeIndex];

    if (nodeKey !== undefined) {
      selectedNodeKeys.push(nodeKey);
    }
  }

  return selectedNodeKeys;
}

export function createCopcCameraStreamRenderNodeKeys(
  selectedNodes: readonly CopcCameraStreamNodeSummaryLike[],
  hierarchy: CopcCameraStreamHierarchyLike | undefined,
): readonly string[] {
  const availableNodeKeys = new Set(
    (hierarchy?.nodes ?? selectedNodes)
      .filter(isRenderableCopcCameraStreamNode)
      .map((node) => node.key),
  );
  const renderNodeKeys = new Set<string>();

  selectedNodes.filter(isRenderableCopcCameraStreamNode).forEach((node) => {
    createCopcNodeAncestorKeys(node.key).forEach((nodeKey) => {
      if (availableNodeKeys.has(nodeKey)) {
        renderNodeKeys.add(nodeKey);
      }
    });

    if (availableNodeKeys.has(node.key)) {
      renderNodeKeys.add(node.key);
    }
  });

  return [...renderNodeKeys];
}

export function isRenderableCopcCameraStreamNode(
  node: CopcCameraStreamNodeSummaryLike,
): boolean {
  return (
    node.pointDataLength > 0 &&
    (node.pointCount === undefined || node.pointCount > 0)
  );
}

export function createCopcCameraStreamCoverageNodeKeys(
  renderNodeKeys: readonly string[],
  selectedDepth: number,
): readonly string[] {
  const coverageDepthOffset = selectedDepth >= 5 ? 3 : 2;
  const depthBasedCoverageDepth = selectedDepth - coverageDepthOffset;
  const maxCoverageDepth = Math.max(0, Math.min(2, depthBasedCoverageDepth));
  const coverageNodeKeys = renderNodeKeys.filter(
    (nodeKey) => readCopcNodeKeyDepth(nodeKey) <= maxCoverageDepth,
  );

  if (coverageNodeKeys.length > 0) {
    return coverageNodeKeys;
  }

  return renderNodeKeys;
}

export function createCopcCameraStreamPreviewNodeKeys(
  coverageNodeKeys: readonly string[],
  hierarchy: CopcCameraStreamHierarchyLike | undefined,
  options: CopcCameraStreamPreviewNodeKeyOptions,
): readonly string[] {
  const nodesByKey = new Map(
    hierarchy?.nodes.map((node) => [node.key, node]) ?? [],
  );
  const coveragePreview = selectCopcCameraStreamPreviewNodeKeySet(
    coverageNodeKeys,
    nodesByKey,
    {
      ...options,
      allowOversizedFallback: (options.detailNodeKeys?.length ?? 0) === 0,
    },
  );
  const detailPreview = selectCopcCameraStreamPreviewNodeKeySet(
    options.detailNodeKeys ?? [],
    nodesByKey,
    {
      ...options,
      allowOversizedFallback: true,
    },
  );

  return coveragePreview.nodeKeys.length > 0
    ? coveragePreview.nodeKeys
    : detailPreview.nodeKeys;
}

interface CopcCameraStreamPreviewNodeKeySet {
  readonly nodeKeys: readonly string[];
  readonly pointDataLength: number;
}

function selectCopcCameraStreamPreviewNodeKeySet(
  nodeKeys: readonly string[],
  nodesByKey: ReadonlyMap<string, CopcCameraStreamNodeSummaryLike>,
  options: CopcCameraStreamPreviewNodeKeyOptions & {
    readonly allowOversizedFallback: boolean;
  },
): CopcCameraStreamPreviewNodeKeySet {
  const deepestNodeKeys = filterAncestorCoveredCopcNodeKeys(nodeKeys);
  const orderedNodeKeys = orderCopcCameraStreamNodeKeysForProgressiveCoverage(
    deepestNodeKeys.length > 0 ? deepestNodeKeys : nodeKeys,
  );

  if (nodesByKey.size === 0) {
    return {
      nodeKeys: selectDistributedCopcCameraStreamNodeKeys(
        orderedNodeKeys,
        options.maxNodeCount,
      ),
      pointDataLength: 0,
    };
  }

  const previewNodeKeys: string[] = [];
  let selectedPointDataLength = 0;

  selectDistributedCopcCameraStreamNodeKeys(
    orderedNodeKeys,
    options.maxNodeCount,
  ).forEach((nodeKey) => {
    if (previewNodeKeys.length >= options.maxNodeCount) {
      return;
    }

    const node = nodesByKey.get(nodeKey);

    if (!node) {
      return;
    }

    const nextPointDataLength = selectedPointDataLength + node.pointDataLength;

    if (
      nextPointDataLength > options.maxPointDataLength &&
      (previewNodeKeys.length > 0 || !options.allowOversizedFallback)
    ) {
      return;
    }

    previewNodeKeys.push(nodeKey);
    selectedPointDataLength = nextPointDataLength;
  });

  if (previewNodeKeys.length > 0) {
    return {
      nodeKeys: previewNodeKeys,
      pointDataLength: selectedPointDataLength,
    };
  }

  if (!options.allowOversizedFallback) {
    return {
      nodeKeys: [],
      pointDataLength: 0,
    };
  }

  const fallbackNodeKey = selectDistributedCopcCameraStreamNodeKeys(
    orderedNodeKeys,
    1,
  );

  return {
    nodeKeys: fallbackNodeKey,
    pointDataLength: fallbackNodeKey.reduce(
      (total, nodeKey) =>
        total + (nodesByKey.get(nodeKey)?.pointDataLength ?? 0),
      0,
    ),
  };
}

export function filterAncestorCoveredCopcNodeKeys(
  nodeKeys: readonly string[],
): readonly string[] {
  const uniqueNodeKeys = [...new Set(nodeKeys)];

  return uniqueNodeKeys.filter(
    (nodeKey) =>
      !uniqueNodeKeys.some(
        (candidate) =>
          candidate !== nodeKey && isCopcNodeKeyAncestorOf(nodeKey, candidate),
      ),
  );
}

export function createCopcCameraStreamFinalNodeKeys(
  selectedNodeKeys: readonly string[],
  coverageNodeKeys: readonly string[],
): readonly string[] {
  if (selectedNodeKeys.length > 0) {
    return selectedNodeKeys;
  }

  return coverageNodeKeys;
}

export function orderCopcCameraStreamNodeKeysForProgressiveCoverage(
  nodeKeys: readonly string[],
): readonly string[] {
  const buckets = new Map<string, string[]>();

  nodeKeys.forEach((nodeKey) => {
    const bucketKey = createNodeSpatialBucketKey(nodeKey);
    buckets.set(bucketKey, [...(buckets.get(bucketKey) ?? []), nodeKey]);
  });

  const orderedBucketKeys = [...buckets.keys()].sort();
  const orderedNodeKeys: string[] = [];
  let hasRemainingNodeKeys = true;

  while (hasRemainingNodeKeys) {
    hasRemainingNodeKeys = false;

    orderedBucketKeys.forEach((bucketKey) => {
      const bucket = buckets.get(bucketKey);
      const nodeKey = bucket?.shift();

      if (nodeKey) {
        orderedNodeKeys.push(nodeKey);
        hasRemainingNodeKeys = true;
      }
    });
  }

  return orderedNodeKeys;
}

export function orderCopcCameraStreamNodeKeysForAdditiveProgress(
  nodeKeys: readonly string[],
): readonly string[] {
  const uniqueNodeKeys = [...new Set(nodeKeys)];
  const depths = [...new Set(uniqueNodeKeys.map(readCopcNodeKeyDepth))].sort(
    (left, right) => left - right,
  );

  return depths.flatMap((depth) =>
    orderCopcCameraStreamNodeKeysForProgressiveCoverage(
      uniqueNodeKeys.filter(
        (nodeKey) => readCopcNodeKeyDepth(nodeKey) === depth,
      ),
    ),
  );
}

export function maxCopcNodeKeyDepth(nodeKeys: readonly string[]): number {
  return nodeKeys.reduce(
    (maxDepth, nodeKey) => Math.max(maxDepth, readCopcNodeKeyDepth(nodeKey)),
    0,
  );
}

export function readCopcNodeKeyDepth(nodeKey: string): number {
  const depth = Number(nodeKey.split("-")[0]);

  return Number.isSafeInteger(depth) && depth >= 0
    ? depth
    : Number.MAX_SAFE_INTEGER;
}

function createNodeSpatialBucketKey(nodeKey: string): string {
  const [depth, x, y, z] = nodeKey.split("-").map(Number);

  if (
    !Number.isSafeInteger(depth) ||
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y) ||
    !Number.isSafeInteger(z) ||
    depth < 0
  ) {
    return nodeKey;
  }

  const bucketDepth = Math.max(0, depth - 2);
  const scale = 2 ** (depth - bucketDepth);

  return [
    bucketDepth,
    Math.floor(x / scale),
    Math.floor(y / scale),
    Math.floor(z / scale),
  ].join("-");
}
