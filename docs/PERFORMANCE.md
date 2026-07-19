# Performance and Evidence

Performance results for **COPC Cesium PointCloud Provider** are measurements of
one source state, browser, GPU, dataset, and network observation. They are not
fixed guarantees. Blocking browser artifacts record the actual WebGL adapter,
browser/runtime details, Git state, and source fingerprint.

## Evidence Levels

Keep these validation levels separate:

| Level | What it proves | What it does not prove |
| --- | --- | --- |
| Deterministic product | Unit behavior, generated license/SBOM integrity, build, whitespace | Live source availability or browser/GPU behavior |
| Live functional | Documented remote Range contract and real browser/package flows | Same-device frame-rate regression |
| Device performance | Renderer and camera-stream behavior on the recorded browser/GPU | Other hardware, browsers, datasets, or networks |
| Release/contest manifest | Required artifacts match one clean source state | A result beyond the artifacts and environment it indexes |

A timeout or public-source outage is not a passing result and is not, by itself,
a code regression. A reachable source that violates the Range/COPC contract is
a functional failure.

## Principles

- Keep configured quality and point/byte/node budgets fixed during a controlled
  comparison. Do not apply application-owned adaptive work limits unless the
  experiment explicitly studies them.
- Measure the actual Cesium rendering path in a real browser.
- Separate product regressions, external-source unavailability, source-contract
  failures, and performance regressions.
- Use clean-commit artifacts for release claims. Dirty-worktree reports are
  diagnostic only.
- Attribute network timing to the observed source and route, not to the point
  renderer.
- Compare relative regressions only when source, WebGL adapter, browser
  contract, benchmark schema, camera path, and thresholds are compatible.
- Keep exact run numbers in JSON evidence or a reviewed baseline, not in this
  evergreen procedure.

## Main Commands

| Command | Purpose |
| --- | --- |
| `npm run qc:product` | Unit tests, license/SPDX self-test, library/example build, whitespace |
| `npm run live:copc-range` | Strict 64-byte `206`/`Content-Range`/`LASF` checks for documented live sources |
| `npm run smoke:example:file` | URL suite plus browser-selected local-file flow |
| `npm run smoke:package` | Build, pack, install, type-check, bundle, and browser-test the consumer tarball |
| `npm run benchmark:renderers` | Repeated Cesium renderer comparison in a real browser |
| `npm run benchmark:quality-ab` | Controlled visual-quality A/B capture and image metrics |
| `npm run benchmark:smoothness:contest` | Autzen and Millsite camera-movement gate |
| `npm run benchmark:smoothness:cold-detail` | Cold Millsite coverage and terminal-detail gate |
| `npm run benchmark:smoothness:warm-zoom-detail` | One warm zoom-detail session |
| `npm run benchmark:smoothness:regression` | Three fresh warm-detail sessions plus reviewed same-device baseline comparison |
| `npm run qc` | Deterministic product gate plus the live/browser/device suite |
| `npm run qc:release` | Hosted functional release gate; intentionally omits device smoothness gates |
| `npm run qc:contest-device` | Product/live/device suite, three-session regression, and evidence manifest |
| `npm run evidence:contest:check` | Revalidate an existing contest manifest and every indexed artifact |

Generated results are written under ignored `output/`. Use
`npm run smoke:example:install-browser` once if Chrome for Testing is missing.

## QC Composition

`npm run qc:product` runs:

1. unit tests;
2. license and SPDX evidence self-test;
3. library and example build;
4. `git diff --check`.

`npm run qc` adds the live Range check, cold/contest/warm camera-stream gates,
renderer benchmark, package-consumer smoke, URL browser smoke, and local-file
browser smoke.

`npm run qc:release` is designed for hosted Linux runners where a software
WebGL adapter may make workstation smoothness thresholds meaningless. It keeps
the live Range check, renderer functional run, package smoke, and the combined
URL/local-file browser smoke. It does not create workstation performance proof.

`npm run qc:contest-device` runs the main suite without duplicating the single
warm-detail step, then runs the three-session regression comparison and creates
and checks the final evidence manifest.

## Smoothness Contract

The browser benchmark moves a Cesium camera through a deterministic sequence
and records:

- `requestAnimationFrame` deltas during movement and terminal refinement;
- average FPS, p95/max frame time, and long-frame counts;
- first committed or revision-proven retained response for the expected request;
- foreground, interaction-ready, and terminal timing;
- rendered point count, selected depth, frontier, and current-view coverage;
- exact additive terminal composition and stale/missing node checks;
- hierarchy, worker decode, geometry, queue, and cache statistics;
- browser-observed HTTP Range request count, status, ranges, and bytes;
- HUD/application time correlated with the following Cesium `postRender`.

Starting work or finding cached data is not a visible response. Terminal success
requires the current request lineage, complete required-node composition, no
unexpected/stale nodes, and no relevant pending hierarchy work under the active
resource bounds.

## Same-Device Regression Gate

The reviewed baseline is
`benchmarks/baselines/smoothness-warm-zoom-detail-rtx3060.json`. Its filename is
part of the compatibility contract; it does not imply that other adapters should
be compared against it.

`npm run benchmark:smoothness:regression`:

1. verifies the Millsite live-source contract;
2. starts three fresh browser/cache sessions;
3. requires every session to pass the absolute warm-detail assertion;
4. compares the session median with the reviewed baseline only when the source,
   WebGL adapter, browser contract, schema, and threshold snapshots match.

Source timeout, DNS/fetch failure, HTTP `408`/`425`/`429`, or `5xx` is classified
as external-source unavailability and produces no relative performance verdict.
A reachable invalid Range/COPC response remains blocking.

When intentionally changing an accepted performance contract, keep the old
artifact, new artifact, actual adapter, source fingerprint, reason, and review
decision together. Never overwrite a baseline merely to make a gate pass.

## Renderer and Quality Comparisons

Renderer comparisons must keep camera pose, source, selected nodes, point
budget, style, browser, and adapter aligned. Report both CPU-side submission
metrics and frame behavior; one does not substitute for the other.

Quality A/B evidence should use deterministic camera poses and record the
comparison mode, quality preset, point budget, image metrics, and screenshots.
Visual changes such as EDL, adaptive splat sizing, or ground-ellipse footprints
must be evaluated for both improvement and new artifacts. A geometry-mask mode
can isolate coverage from appearance, but it is not the normal rendered output.

## Run Evidence

Browser JSON includes a `runEvidence` block containing:

- canonical UTC generation time;
- Git HEAD and clean/dirty state;
- SHA-256 fingerprint of tracked changes and non-ignored untracked content;
- Node version, platform, architecture, and npm lifecycle;
- browser version and actual WebGL adapter.

Each live/benchmark artifact also records the relevant source contract and
benchmark-specific settings. Do not combine metrics from artifacts whose
source fingerprints or environment contracts differ.

## Contest Evidence Manifest

`npm run evidence:contest` creates
`output/contest-evidence/contest-evidence-manifest.json`. It indexes required
JSON, screenshots, regression sessions, the exact npm tarball, its checksum,
byte sizes, SHA-256 values, passing states, and source-state agreement.

Manifest generation does not convert a failed check into a pass. It rejects
missing, failed, stale, post-generation-modified, or source-mismatched evidence.
Run `npm run evidence:contest:check` again immediately before handoff or
submission to verify that the indexed bytes are unchanged.

## Package Contract

Package smoke enforces:

- npm tarball at or below 650 KiB;
- each packed worker JavaScript asset at or below 600 KiB;
- all three typed ESM entry points and required worker assets;
- a fresh Bundler and NodeNext consumer type check;
- a fresh Vite consumer build;
- successful Cesium canvas, COPC Range, worker, and camera-LOD browser smoke;
- exact tarball byte length and SHA-256 in the browser result.

A Vite raw chunk-size warning is advisory. The explicit tarball and worker
ceilings are the package-size gates.

## Reproduction

Use Node.js 22 and the npm version declared by `packageManager`:

```powershell
npm ci
npm run smoke:example:install-browser
npm run qc:contest-device
npm run evidence:contest:check
```

Run the final gate from a clean worktree on the target performance machine.
Keep the manifest, QC status, JSON reports, screenshots, tarball, and checksum
together. Record any skipped step and reason; do not silently substitute an old
artifact.

## Limitations

- Browser frame intervals and CPU-side submission timing are measured; this is
  not a dedicated GPU profiler.
- Public-source latency and availability can vary independently of the code.
- One workstation result is not a low-end-device guarantee.
- Renderer payload bytes and cache estimates are not total process or GPU
  memory.
- More COPC producers, coordinate systems, browsers, and device classes require
  independent validation.
