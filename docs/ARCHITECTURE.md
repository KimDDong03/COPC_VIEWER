# Architecture

**COPC Cesium PointCloud Provider** (`copc-cesium`) is a browser TypeScript
library that reads existing COPC data and renders it directly in CesiumJS. The
reference viewer proves the library API; it is not the product boundary.

## Goals

- Accept a COPC URL, browser `File`, or `Blob`.
- Read metadata, hierarchy, and selected point-data ranges on demand.
- Select bounded camera-relevant octree nodes with explicit LOD budgets.
- Decode/sample points and optionally prepare Cesium geometry in workers.
- Transform source coordinates into Cesium coordinates.
- Render through Cesium-native primitives.
- Expose reusable high- and low-level APIs with repeatable verification.

## Non-Goals

- COPC-to-3D-Tiles or other pre-tiling/conversion pipelines.
- Live LiDAR ingestion, point-cloud editing, or non-COPC format adapters.
- A general viewer product or application-specific styling framework.
- Backend/proxy services, data hosting, AWS/CloudFront/S3 operations, or
  CDN/edge infrastructure.
- Universal performance guarantees across data, browsers, networks, and GPUs.

Persistent IndexedDB range reuse is a browser-library feature for validated
repeat visits. It is not an offline application framework or cold-load claim.

## Module Boundaries

```text
src/core/
  source descriptors and exact range getters
  COPC metadata and hierarchy
  point-data reads, sampling, and decoded cache state
  pure hierarchy/range/traversal planning

src/cesium/
  coordinate transforms
  Cesium point and bounds renderers
  point/geometry worker pools and range broker
  CopcPointCloudLayer
  camera-stream settings, planning, execution, quality, and telemetry

examples/basic-viewer/
  DOM controls and status
  quality-preset application
  retained-frame and movement policy
  benchmark hooks and sample selection
```

`src/core` must not import Cesium. Data crosses into `src/cesium` through typed
metadata, hierarchy nodes, samples, planned ranges, and geometry batches.

## End-to-End Flow

```text
URL / File / Blob
  -> CopcSourceInput
  -> exact half-open range getter
  -> COPC header, VLRs, info, and root hierarchy
  -> bounded hierarchy-page expansion
  -> camera/frustum/LOD frontier selection
  -> additive ancestor closure and render plan
  -> bounded point-data reads and LAZ decode
  -> spatially distributed sampling
  -> coordinate transform and color policy
  -> worker-prepared or main-thread geometry batches
  -> Cesium renderer mutation
  -> visual-quality and timing telemetry
```

Remote sources use strict HTTP Range requests. Local `File`/`Blob` sources use
bounded `Blob.slice()` reads behind the same source abstraction.

## Range and Source Layer

`createCopcRangeGetter()` chooses the URL or Blob path and adds bounded
in-memory reuse. Duplicate in-flight reads share work; cached bytes are copied
before being returned so callers cannot mutate the retained entry.

The HTTP path validates:

- `206 Partial Content`;
- exact response body length;
- exposed `Content-Range` syntax, requested start/end, and complete length;
- configured single-range size and request deadline;
- caller cancellation and the bounded retry policy.

Structured HTTP failures use `CopcRangeRequestError`. Browser network and CORS
failures are intentionally grouped because Fetch does not reliably distinguish
them.

`CopcIndexedDbRangeCache` is optional and fixed-block/bounded. Strong-ETag mode
revalidates a strong validator and source length before serving stored bytes.
Application-version mode requires an immutable app-owned version and
authoritative length. `Cache-Control: no-store` revokes in-memory and persistent
reuse for the source identity, purges matching namespaces, and records a
tombstone. Custom stores must implement that source-wide disable/enable policy
atomically or persistence fails closed.

`CopcSource` owns parsed COPC metadata, the merged hierarchy, bounded
hierarchy-page/sample caches, optional sample workers, and their telemetry.
Non-root hierarchy pages can be evicted back to pending references; the root
remains available.

## Hierarchy and LOD Planning

COPC uses the EPT additive octree model. Child nodes contain additional points;
they do not replace the unique points stored by ancestors. The visible terminal
set is therefore:

```text
selected frontier + complete available ancestor closure
```

The library supports three related selection styles:

- target/nearest ordering for low-level inspection;
- complete-depth coverage, the high-level camera-stream default;
- mixed-depth coverage, which reserves a coarse visible baseline and refines
  complete visible sibling groups within node/point/byte limits.

A mixed-depth terminal frontier must be an antichain. If all visible children
needed for a refinement do not fit, their parent remains the frontier node for
that branch. Separate refine/retain thresholds allow hysteresis during camera
movement.

Camera selection uses:

- the transformed viewport-center target for priority;
- the transformed camera-eye position for projected size/spacing;
- Cesium frustum culling of transformed node bounds;
- explicit depth, node, source-point, rendered-point, and compressed-byte
  limits.

Camera height is measured relative to the transformed point-cloud top when
available, so the same LOD bands remain meaningful for elevated datasets.

## Decode, Sampling, and Workers

The layer supports three geometry-loading arrangements:

```text
main-thread
  COPC read/decode/sample -> transform/geometry on main thread

pointSampleLoading: "worker"
  COPC read/decode/sample in worker -> transform/geometry in layer path

pointGeometryLoading: "integrated-worker"
  COPC range/read/decode/sample/transform/geometry in one worker path
```

Worker pools are bounded and priority-aware. They support:

- queued request cancellation and stale-result rejection;
- configurable active integrated-worker cancellation;
- identical/compatible request coalescing;
- density upgrades that can serve lower-density callers;
- decoded-node affinity to avoid repeating range reads and LAZ decode;
- per-worker and optional layer-wide decoded-view byte limits;
- source-aware warmup and cache telemetry.

The default soft integrated-worker cancellation preserves worker-local decoded
state and routes byte reads through a shared main-thread range broker.
Termination modes trade that reuse for faster interruption and can use direct
worker reads. Brokered adjacent point-data ranges are coalesced only within
explicit span and gap limits.

Sampling uses a stable spatial order so a lower density is a distributed nested
prefix of a denser request rather than source-order truncation. The order's
typed-array memory is included in decoded-view accounting.

## Layer and Cache Ownership

`CopcPointCloudLayer` composes the source, transforms, renderers, geometry
workers, and geometry caches. It keeps separate limits for:

- hierarchy pages and estimated hierarchy bytes;
- sampled node results and estimated sample bytes;
- decoded point-data views inside workers;
- prepared/transformed geometry entries and distinct backing-buffer bytes.

Aliased geometry buffers are counted once. Resolved least-recently-used entries
can be evicted without canceling pending requests. Transfer-only worker results
are cache references; if the matching batch has been evicted, the layer reloads
instead of rendering an empty payload.

`getRendererRevision()` advances after successful renderer mutations. A caller
may retain a prior frame without resubmitting geometry only when the layer,
revision, node set, density, and budgets still prove it is the expected frame.

Lifecycle is explicit:

- `clear()` removes rendered content but retains source/caches;
- cache-clear/reset methods release selected caches and worker state;
- `destroy()` releases renderers, workers, and pending work and forbids reuse.

## Rendering

The default `CesiumPrimitivePointRenderer` submits typed position/color arrays
through bounded Cesium `Primitive` objects. Stable per-node batches support
progressive updates; configured grouping can seal several geometry batches into
one primitive without rebuilding every partial group.

Worker geometry batches can include `positionBounds` and
`hasTranslucentColors`. The renderer reuses those hints to avoid scanning all
positions/colors on the main thread. Custom batches may omit them and use the
compatibility scan.

Renderer paths:

- `CesiumPrimitivePointRenderer`: default typed-array primitive renderer;
- `CesiumPointPrimitiveRenderer`: stable object-based fallback;
- `CesiumBufferPointRenderer`: experimental Cesium comparison renderer;
- application-provided renderer interfaces.

Fixed point sizing is the renderer API default. Adaptive sizing projects COPC
spacing and retained density into a bounded screen footprint. A ground-aligned
ellipse mode improves oblique views when spacing metadata is available; missing
metadata retains the fixed circular fallback. Optional renderer-scoped EDL is
feature-detected and falls back to direct primitives if unsupported.

Attribute coloring preserves RGB, classification, and intensity through main
and worker paths. Elevation coloring uses one file-global source-Z domain to
avoid node-local seams.

## Progressive and Terminal Rendering

Progressive rendering separates responsiveness from correctness:

```text
preview -> refining -> interactive-ready -> terminal
```

`interactive-ready` means the current view is useful, not that all required
nodes are complete. Bounded windows can continue loading after that point. A
terminal result must match the current request lineage, contain the planned
frontier and ancestor closure, and contain no stale or unexpected nodes.

`runCopcCameraStreamTerminalRender()` owns the reusable bounded terminal pass.
The internal stream engine supplies selection, render plan, and source weights.
`CopcPointCloudCameraStream` adds Cesium camera events, debounce, cancellation,
quality-based LOD, terminal validation, and bounded same-camera follow-up.

The reference viewer adds application-owned retained-frame, movement,
predictive-prefetch, HUD, and benchmark policy. Those policies must not be
treated as core library requirements unless promoted through a deliberate
public API change.

## Coordinate Transforms

Core data stays in source COPC XYZ. The Cesium layer resolves a transform set:

- `toCesium` is required for rendering;
- `toCopc` is additionally required for camera selection and targeted
  hierarchy expansion.

The default factory handles likely geographic coordinates, the documented
Autzen EPSG:2992 source, and proj4-compatible WKT, including supported compound
WKT horizontal extraction and vertical-unit scaling. Explicit proj4 and
application-provided transforms cover missing or application-specific metadata.
The library does not download external datum grids.

## Evidence Boundary

Unit tests verify pure contracts and lifecycle behavior. Browser/package smoke
verifies actual Cesium, workers, Range reads, and consumer bundling. Performance
scripts record frame intervals, CPU-side stages, network observations, source
state, browser, and WebGL adapter.

CPU submission timing is not GPU profiling. A public-source outage is not a
performance verdict. A historical benchmark is not evidence for a changed
commit. The evidence manifest binds the required artifacts to one clean source
state.

## Current Limitations

- Browser ESM/bundler runtime only.
- Pre-1.0 public API and tuning defaults.
- Hierarchy selection and screen-space thresholds still need calibration across
  more COPC producers, CRSs, browsers, datasets, and device classes.
- Hierarchy metadata selection remains on the main thread.
- Main-thread fallback paths still perform coordinate/geometry work on the main
  thread.
- Renderer payload bytes and cache estimates are not total JavaScript heap or
  GPU memory measurements.
- Optional EDL depends on a feature-detected Cesium runtime path not represented
  by Cesium's public TypeScript declarations.
- Unsupported WKT or grid-dependent CRS transforms require application code.
