# API Guide

**COPC Cesium PointCloud Provider** is a pre-1.0 typed ESM package named
`copc-cesium`. This guide documents the supported integration model and the
contracts most consumers need. The emitted `.d.ts` files and the public barrels
in `src/index.ts`, `src/core/index.ts`, and `src/cesium/index.ts` are the
exhaustive symbol reference.

## Entry Points

```ts
import { CopcPointCloudLayer } from "copc-cesium";
import { CopcSource } from "copc-cesium/core";
import { CesiumPrimitivePointRenderer } from "copc-cesium/cesium";
```

| Entry point | Contents |
| --- | --- |
| `copc-cesium` | Combined core and Cesium public surface |
| `copc-cesium/core` | COPC source, range, hierarchy, sampling, cache, and pure planning APIs without Cesium imports |
| `copc-cesium/cesium` | Cesium transforms, renderers, layer, worker pools, camera stream, policies, and telemetry |

The runtime target is a modern browser application using an ESM bundler and
CesiumJS `>=1.140.0 <2`. Node.js 22 and npm 11 are development/QC tools, not a
supported rendering runtime.

## Package Setup

Until an npm registry release is confirmed, create the verified package from a
repository checkout:

```bash
npm ci
npm run smoke:package
```

Install the tarball written under `output/package-smoke/` together with Cesium.
For Vite, `vite-plugin-cesium` supplies Cesium's static runtime assets:

```ts
import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

export default defineConfig({ plugins: [cesium()] });
```

Other bundlers must copy Cesium's `Workers`, `Assets`, `Widgets`, and
`ThirdParty` directories and configure `CESIUM_BASE_URL`. Import
`cesium/Build/Cesium/Widgets/widgets.css` when using Cesium widgets. COPC decode
and geometry workers ship as package-relative assets.

## High-Level Cesium Usage

```ts
import { Viewer } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  CopcPointCloudCameraStream,
  CopcPointCloudLayer,
} from "copc-cesium";

const viewer = new Viewer("cesium-container");
const layer = new CopcPointCloudLayer(viewer.scene, {
  url: "https://example.com/cloud.copc.laz",
  pointSampleLoading: "worker",
  pointGeometryLoading: "integrated-worker",
  showBounds: false,
});

const loadResult = await layer.load();
console.log(loadResult.inspection, loadResult.coordinateTransform);

const stream = new CopcPointCloudCameraStream({
  camera: viewer.camera,
  layer,
  quality: "balanced",
  onUpdate: ({ stage, visualQuality }) => {
    console.log(stage, visualQuality);
  },
  onError: console.error,
});

stream.start();

// Dispose in ownership order.
stream.destroy();
layer.destroy();
viewer.destroy();
```

Use `source` for a `File`, `Blob`, or URL string when that shape is more
convenient:

```ts
const file = fileInput.files?.[0];

if (file) {
  const layer = new CopcPointCloudLayer(viewer.scene, { source: file });
  await layer.load();
}
```

The complete type-checked example is
[`examples/minimal-layer.ts`](../examples/minimal-layer.ts).

## `CopcPointCloudLayer`

`CopcPointCloudLayer` owns one COPC source, coordinate-transform status,
Cesium renderers, optional worker pools, and bounded source/geometry caches.
Construct it with a Cesium `Scene` and exactly one effective input: `url` or
`source`.

### Option groups

| Group | Main options | Contract |
| --- | --- | --- |
| Input | `url`, `source`, `rangeGetterOptions` | URL or browser `File`/`Blob`; HTTP policy is forwarded to the source and brokered worker reads |
| Sampling | `maxPointCountPerNode`, `pointSampleLoading` | Main-thread sampling is the compatibility default; `"worker"` moves point-data reads and LAZ decode to a worker |
| Geometry | `pointGeometryLoading`, `activePointGeometryWorkerCancellation`, `brokeredRangeRequests` | `"main-thread"`, `"worker"`, or `"integrated-worker"`; integrated mode combines COPC read/sample/transform preparation |
| Concurrency | `maxConcurrentHierarchyPageLoads`, `maxConcurrentPointSampleWorkerRequests`, `maxConcurrentPointGeometryWorkerRequests` | Bounded queues; do not derive unbounded pools directly from CPU count |
| Caches | hierarchy, sample, decoded-view, and geometry count/byte limits | Limits are independent; oversized decoded entries can be used without retention |
| Rendering | `createPointRenderer`, `pointColorMode`, `showBounds` | Typed-array primitive renderer and attribute coloring are defaults |
| Coordinates | `coordinateTransforms` | Default factory uses metadata where possible; applications can provide a bidirectional transform |

Exact option names and types are declared by `CopcPointCloudLayerOptions`.
Defaults that materially affect behavior are tested in the implementation; avoid
copying the full volatile default table into application code.

### Load and inspect

```ts
const { inspection, hierarchy, coordinateTransform } = await layer.load();

console.log(inspection.pointCount);
console.log(hierarchy.nodes.length);
console.log(coordinateTransform.supportsCameraSelection);
```

`load()` opens metadata, the root hierarchy page, and the transform. It does not
load every point node. Loaded state is also exposed through `layer.inspection`,
`layer.hierarchy`, and `layer.coordinateTransform`.

Hierarchy methods:

- `loadHierarchyPage()` and `loadNextHierarchyPage()` load explicit/pending
  pages.
- `expandHierarchyForCamera()` opens a bounded set near the current view.
- `selectNodesForCamera()` returns a bounded camera/frustum selection without
  rendering.
- `suggestNodeForCamera()` provides the simpler target-oriented suggestion
  path.

Camera selection requires a transform with both `toCesium` and `toCopc`.

### Render and prepare

For explicit node ownership:

```ts
const first = layer.hierarchy?.nodes[0];

if (first) {
  const result = await layer.renderNode(first.key, {
    maxPointCount: 20_000,
    showBounds: false,
  });
  console.log(result.renderStats.pointCount);
}
```

The layer also exposes:

- `renderNodes()` and `renderNodeSampleResults()` for explicit batches;
- `prepareNodes()` / `prepareNodesProgressively()` for cache-only warming;
- `renderNodesProgressively()` for bounded progressive loading and commits;
- `renderAutomatic()` / `renderAutomaticProgressively()` for combined
  hierarchy expansion, selection, and rendering;
- `prefetchNodePointDataViews()` and `prefetchNodePointGeometryBatches()` for
  load-only prefetch.

Most async load/render methods accept an `AbortSignal`. Superseded
render-capable work must be aborted because late progress can otherwise mutate
the shared renderer even when an application rejects its result.

### COPC additive composition

COPC follows EPT additive-node semantics: child points add detail and do not
replace unique points in ancestors. A terminal render therefore contains a
selected frontier plus its complete available ancestor closure.

The high-level stream defaults to a complete-depth frontier. Low-level callers
can request coverage-oriented or mixed-depth planning. Mixed-depth terminal
frontiers must remain an antichain and refine visible siblings atomically so a
branch retains its parent when all required children do not fit.

`preview`, `refining`, and `interactive-ready` are useful progress states, but
only a stale-free exact composition is terminal.

### Budgets and progress

The main point budgets are distinct:

- `maxPointCountPerNode`: sample/read ceiling for one node;
- `maxRenderedPointCount`: final points submitted across a multi-node render;
- source-point and compressed-byte budgets: selection/load work limits before
  rendering;
- node and hierarchy-page limits: structural bounds.

Progressive results expose the already budget-limited node set and render
stats. Weighted composition uses source point counts when provided; callers
without weights retain deterministic equal-share behavior.

The exported `createCopcCameraStreamEffectiveBudget()`,
`constrainCopcCameraStreamBudgetForRenderedPoints()`, and
`updateCopcCameraStreamAdaptiveBudget()` are low-level policy helpers. Adaptive
state is not automatically enabled by `CopcPointCloudCameraStream`. A consumer
must explicitly own when it applies reduced work limits; fixed-budget
benchmarks must keep those limits disabled.

### Cache and lifecycle

Useful telemetry/lifecycle methods include:

- `getPointGeometryCacheStats()` and `getDecodedPointDataCacheStats()`;
- `getRendererRevision()` to prove whether a committed frame is still resident;
- `clearPointSampleCache()` and `clearPointGeometryCache()`;
- `resetStreamingCaches()` to clear streaming caches and restart worker pools
  while keeping opened metadata/hierarchy;
- `clear()` to remove rendered primitives while retaining the source/caches;
- `destroy()` to remove primitives, stop owned workers, and reject later use.

Worker warmup is optional:

```ts
layer.warmUpPointSampleWorkers({ workerCount: 2 });
layer.warmUpPointGeometryWorkers({ workerCount: 2 });
await layer.waitForPointGeometryWorkerWarmup();
```

Warmup starts workers and can seed source metadata; it does not make a visible
render terminal.

## `CopcPointCloudCameraStream`

The high-level stream binds a Cesium `Camera` to a compatible layer. It owns
camera listeners, debounce, stale-request cancellation, quality-based LOD,
progressive rendering, terminal validation, and bounded same-camera hierarchy
follow-up.

```ts
const stream = new CopcPointCloudCameraStream({
  camera: viewer.camera,
  layer,
  quality: "detail", // preview | balanced | detail | ultra
  debounceMilliseconds: 120,
  renderOnStart: true,
  renderOptions: {
    coverageMode: "complete-depth",
  },
  onUpdate(update) {
    // update.stage: preview | refining | interactive-ready | terminal
  },
});
```

Lifecycle:

- `start()` attaches listeners and optionally starts a render.
- `render()` immediately runs one request and can also be used manually.
- `cancel()` cancels scheduled/current work without removing listeners.
- `stop()` cancels work and removes camera listeners.
- `destroy()` permanently stops the stream.

State getters expose `isRunning`, `isRendering`, `isDestroyed`, `lastResult`,
`lastError`, and `lastVisualQuality`.

Quality setting objects define point/source/byte/node ceilings and also carry
renderer-oriented visual fields used by the reference viewer. The camera stream
consumes the LOD subset; it does not reconfigure a renderer that the layer has
already created. These are reproducible ceilings, not universal performance
guarantees. Use `createCopcPointCloudQualitySettings()` to obtain an editable
copy rather than mutating the exported preset table.

## Core COPC API

Use `CopcSource` when an application needs metadata, hierarchy, or sampled COPC
data without Cesium primitives:

```ts
import { CopcSource } from "copc-cesium/core";

const source = new CopcSource(fileOrUrl, {
  pointSampleLoading: "worker",
  maxCachedHierarchyPages: 64,
  maxCachedSampleSets: 32,
});

const inspection = await source.inspect();
const hierarchy = await source.loadHierarchySummary();
const node = hierarchy.nodes[0];

if (node) {
  const samples = await source.loadNodePointSamples({
    nodeKey: node.key,
    maxPointCount: 5_000,
    sampleFormat: "typed",
    signal,
  });
  console.log(samples.sampledPointCount);
}

source.destroy();
```

`CopcSource` keeps source XYZ values independent of Cesium. It provides bounded
hierarchy and sample caches, optional point-sample workers, priority-aware
requests, hierarchy load telemetry, warmup/reset, and explicit destruction.

Pure core helpers cover:

- hierarchy-page targeting and camera-node selection;
- complete- and mixed-depth traversal planning;
- point-data range planning and spatially distributed sampling;
- direct inspection/hierarchy/node sampling for custom integrations.

## Range Reads and Persistent Cache

`createCopcRangeGetter()` accepts an HTTP(S) URL or browser `Blob`/`File` and
returns a half-open byte-range getter. It uses a bounded in-memory cache to
share duplicate in-flight reads and returns copied bytes to callers.

For HTTP sources, `createHttpRangeGetter()` requires:

- `206 Partial Content`;
- the exact requested body length;
- a valid/matching exposed `Content-Range` when present;
- the configured range-size and request-timeout bounds.

Recognized HTTP failures use `CopcRangeRequestError`. Its stable `code`,
requested `begin`/`end`, optional `status`, `retriable`, and `cause` allow
programmatic handling. Network/CORS failures cannot always be distinguished by
the browser. Caller cancellation preserves an Error-valued abort reason.

Persistent HTTP range caching is opt-in:

```ts
import {
  CopcIndexedDbRangeCache,
  createCopcRangeGetter,
} from "copc-cesium/core";

const cache = new CopcIndexedDbRangeCache({
  databaseName: "my-copc-ranges-v1",
  maxCachedRangeBytes: 256 * 1024 * 1024,
  maxCachedRangeCount: 4_096,
});

const getter = createCopcRangeGetter(url, {
  persistentRangeCache: {
    cache,
    validation: { mode: "strong-etag" },
  },
});
```

Strong-ETag mode validates an exposed strong validator and authoritative source
length before reusing blocks. Application-version mode instead requires an
immutable application version and authoritative length. The application must
change that version whenever source bytes change.

`Cache-Control: no-store` disables reuse and triggers source-wide purge and a
persisted tombstone. Custom `CopcPersistentRangeCache` implementations must
honor the source disable/enable contract atomically; otherwise the getter fails
closed. Persistent caching applies only to HTTP(S), not `File`/`Blob`, and must
not be claimed as cold-load performance.

## Renderers

`CopcPointCloudLayer` defaults to `CesiumPrimitivePointRenderer`, which submits
typed position/color arrays through bounded Cesium `Primitive` objects.

```ts
import { CesiumPrimitivePointRenderer } from "copc-cesium/cesium";

const layer = new CopcPointCloudLayer(viewer.scene, {
  source,
  createPointRenderer: (scene) =>
    new CesiumPrimitivePointRenderer(scene, {
      pointSizeMode: "adaptive",
      minimumPointSize: 1,
      maximumPointSize: 5,
      pointSplatShape: "ground-ellipse",
      eyeDomeLighting: true,
      maxGeometryBatchesPerPrimitive: 4,
    }),
});
```

Adaptive point sizing requires per-batch spacing metadata for projected sizing;
missing metadata falls back to fixed `pointSize`. `ground-ellipse` requires
adaptive sizing. Eye-dome lighting is feature-detected and renderer-scoped; an
unsupported Cesium/WebGL runtime falls back to direct primitives.

Alternatives:

- `CesiumPointPrimitiveRenderer`: stable `PointPrimitiveCollection` fallback;
- `CesiumBufferPointRenderer`: experimental Cesium buffer comparison path;
- a custom `CopcPointCloudRenderer` or geometry-batch renderer.

Worker batches provide optional `positionBounds` and `hasTranslucentColors`
hints that avoid main-thread rescans. Custom batches may omit them; the default
renderer derives compatible values.

`pointColorMode: "attribute"` uses RGB, known classification colors, intensity,
then neutral/fallback colors. `"elevation"` uses one file-global source-Z
palette so adjacent nodes do not normalize independently.

## Coordinate Transforms

Core samples remain in source COPC XYZ. The Cesium layer converts them through
a `CopcCoordinateTransformFactory`.

The default factory supports likely geographic data, the documented Autzen
EPSG:2992 source, and proj4-compatible COPC WKT, including horizontal CRS
extraction and vertical unit scaling for supported compound WKT.

Use an explicit override when metadata is missing or application-specific:

```ts
import { createProj4CoordinateTransforms } from "copc-cesium/cesium";

const transforms = createProj4CoordinateTransforms({
  sourceCrs: "EPSG:32611",
  sourceDefinition:
    "+proj=utm +zone=11 +datum=WGS84 +units=m +no_defs +type=crs",
});
```

Rendering needs `toCesium`. Camera selection, hierarchy targeting, and automatic
LOD also need `toCopc`. The library does not download datum grid files; an
application must supply a transform when external grids or unsupported WKT are
required.

## Telemetry and Evidence

Layer render stats report rendered point count, estimated payload bytes,
coordinate-transform time, renderer submission time, bounds time, total
CPU-side submission time, and optional worker/geometry timing aggregates.
Camera-stream formatters and visual-quality helpers expose hierarchy, LOD,
budget, coverage, missing/stale-node, and source-node summaries.

These values are diagnostics. They are not GPU profiling or universal FPS
evidence. Use the repository browser benchmarks and source-bound evidence
manifest for performance claims.

## Stability

- Package and API are pre-1.0.
- Default renderer: `CesiumPrimitivePointRenderer`.
- Stable compatibility renderer: `CesiumPointPrimitiveRenderer`.
- Experimental comparison renderer: `CesiumBufferPointRenderer`.
- Browser/ESM bundler runtime only.
- CRS, producer, browser, and device coverage is incomplete; test the target
  data and environment before relying on defaults.
