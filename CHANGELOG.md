# Changelog

Notable user-facing changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and releases follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Implementation-only refactors, intermediate experiments, and test-by-test
development history belong in commits and machine-readable evidence rather
than this file.

## [Unreleased]

### Changed

- Balanced, detail, and ultra keep renderer-scoped EDL strength at `1`, avoiding
  density-dependent contour exaggeration in low-oblique views. The quality A/B
  benchmark can repeat that pose with normal appearance or an EDL-free geometry
  mask.
- Public branding and repository/Pages links use **COPC Cesium PointCloud
  Provider** while retaining `copc-cesium` as the package/import name.
- Camera-stream commits update dynamic inspection rows without rebuilding the
  full demo metadata panel. Smoothness schema v2 records UI-apply phases and the
  correlated next Cesium `postRender` boundary.
- Camera-targeted hierarchy expansion loads independent pages with deterministic
  bounded concurrency while preserving ordered parent/child discovery and
  telemetry.
- Integrated geometry workers write sampled decoded COPC values directly into
  final position/color buffers, removing transient typed attribute arrays while
  preserving sample order, transforms, color, bounds, and decode-only prefetch.

### Fixed

- Hosted release browser benchmarks accept only the known headless-Linux
  `ReadPixels` advisory while keeping all other console warnings/errors
  blocking; hosted QC omits device-only smoothness gates and duplicate URL smoke.
- The npm tarball contains consumer/evidence documentation while local agent,
  submission, demo-script, and generated evidence files remain excluded.

## [0.1.0] - 2026-07-19

### Added

- Direct COPC URL and browser `File`/`Blob` loading without a 3D Tiles
  conversion step.
- Exact HTTP Range validation for `206`, body length, exposed
  `Content-Range`, request bounds, timeout, cancellation, and classified retry
  behavior.
- Bounded in-memory range reuse and opt-in IndexedDB fixed-block caching with
  strong-ETag or application-version validation, source-wide `no-store`
  revocation, and fail-closed custom-store policy.
- COPC metadata inspection, on-demand hierarchy pages, camera-targeted
  hierarchy expansion, and count/byte-bounded hierarchy/sample caches.
- Camera/frustum LOD selection with complete-depth coverage and an opt-in
  mixed-depth antichain planner that preserves additive ancestor composition.
- Spatially distributed nested-prefix sampling for stable density changes.
- Optional point-sample and integrated geometry workers with bounded queues,
  request priority, cancellation, coalescing, decoded-node affinity, warmup,
  and decoded-view memory limits.
- A shared worker Range broker with bounded adjacent point-data coalescing.
- `CopcPointCloudLayer` for loading, selection, preparation, prefetch,
  progressive rendering, cache telemetry/reset, and explicit lifecycle.
- `CopcPointCloudCameraStream` for Cesium camera events, debounce, stale-request
  cancellation, quality-based LOD, progressive updates, terminal validation,
  and bounded same-camera follow-up.
- Typed-array `CesiumPrimitivePointRenderer` as the default, plus stable
  `CesiumPointPrimitiveRenderer` and experimental `CesiumBufferPointRenderer`.
- Fixed/adaptive point sizing, screen-circle/ground-ellipse splats,
  renderer-scoped feature-detected EDL, stable progressive geometry batching,
  and renderer revision tracking.
- RGB/classification/intensity coloring and file-global elevation coloring
  shared by main-thread and worker paths.
- Geographic, EPSG:2992, proj4-compatible WKT, compound-WKT vertical-unit,
  explicit proj4, and application-provided coordinate transform paths.
- Typed ESM package entry points for `copc-cesium`, `copc-cesium/core`, and
  `copc-cesium/cesium`, with CesiumJS `>=1.140.0 <2` as a peer dependency.
- A reference browser viewer with remote presets, custom URL, local-file input,
  quality presets, diagnostic status, and deterministic benchmark camera poses.
- Unit, build, live Range, URL/local-file browser, renderer, smoothness,
  quality A/B, and fresh package-consumer verification.
- Source-bound run evidence and a clean-worktree contest manifest covering
  required JSON, screenshots, regression sessions, tarball, checksum, sizes,
  hashes, and pass states.
- MIT licensing, reproducible third-party notices, SPDX 2.3 SBOM, sample-data
  provenance, security policy, issue/PR templates, Dependabot, CI, CodeQL,
  GitHub Pages, and manual release workflows.

### Changed

- Worker-prepared geometry became the primary high-density path, while
  main-thread/object renderers remain compatibility paths.
- Camera-stream terminal rendering now distinguishes preview,
  `interactive-ready`, and exact terminal composition rather than treating the
  first visible result as completion.
- Point/source/compressed-byte/node budgets are explicit and monotonic across
  quality/zoom bands. Application-owned adaptive limits remain opt-in.
- Worker-generated position bounds and opacity hints are reused by the typed
  renderer to avoid redundant main-thread array scans, with a custom-batch
  fallback.
- Package verification installs the packed tarball in a fresh consumer and
  checks declarations, bundle output, workers, Cesium canvas rendering, Range
  reads, and camera LOD.

### Fixed

- Superseded progressive requests are aborted and their enqueued promises are
  observed so stale progress cannot mutate the active renderer or leak
  unhandled rejections.
- Terminal validation rejects ancestor-overlapping frontiers, missing required
  ancestors/frontier nodes, stale nodes, and relevant pending hierarchy work.
- Complete-depth selection stops at the deepest frontier that fits active
  structural and byte/point budgets, avoiding hierarchy-cache churn.
- Worker pools coalesce compatible same-node work and preserve decoded-node
  affinity to prevent avoidable duplicate Range reads and LAZ decode.
- Geometry cache accounting counts aliased backing buffers once and reloads an
  evicted transfer-only cache reference instead of rendering empty data.
- HTTP/browser smoke accepts transient retriable responses only when the exact
  URL/range later succeeds with a valid `206`; unrecovered or mismatched
  responses fail.
- Elevation color normalization uses source-global bounds, eliminating
  per-node color seams.
- Progressive sampling and budget truncation preserve Classification and
  Intensity channels across object, typed, and worker geometry paths.

[Unreleased]: https://github.com/KimDDong03/COPC-Cesium-PointCloud-Provider/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/KimDDong03/COPC-Cesium-PointCloud-Provider/releases/tag/v0.1.0
