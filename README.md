# COPC Cesium PointCloud Provider

[![CI](https://github.com/KimDDong03/COPC-Cesium-PointCloud-Provider/actions/workflows/ci.yml/badge.svg)](https://github.com/KimDDong03/COPC-Cesium-PointCloud-Provider/actions/workflows/ci.yml)
[![Live COPC Browser Evidence](https://github.com/KimDDong03/COPC-Cesium-PointCloud-Provider/actions/workflows/example-smoke.yml/badge.svg)](https://github.com/KimDDong03/COPC-Cesium-PointCloud-Provider/actions/workflows/example-smoke.yml)
[![GitHub Pages](https://github.com/KimDDong03/COPC-Cesium-PointCloud-Provider/actions/workflows/pages.yml/badge.svg)](https://github.com/KimDDong03/COPC-Cesium-PointCloud-Provider/actions/workflows/pages.yml)

CesiumJS-native COPC point-cloud streaming and visualization for browser
applications.

**Live demo:** <https://kimddong03.github.io/COPC-Cesium-PointCloud-Provider/>

The project is submitted as **COPC Cesium PointCloud Provider**. The npm package
name and JavaScript import identifier remain `copc-cesium`.

`copc-cesium` opens an existing COPC URL, browser `File`, or `Blob`; reads only
needed byte ranges; selects camera-relevant octree nodes; decodes and transforms
points in the browser; and renders them in CesiumJS. No COPC-to-3D Tiles
conversion step is required.

> Status: pre-1.0. `package.json` and the source tag are at `0.1.0`; `main` may
> also contain entries listed under `Unreleased` in the changelog. Do not assume
> an npm registry release exists—the verified local tarball workflow below is
> the authoritative install path until publication is completed.

## Features

- Strict HTTP Range reads with `206`, exact body length, and exposed
  `Content-Range` validation.
- URL, `File`, and `Blob` inputs through the same COPC source boundary.
- Camera/frustum-aware hierarchy expansion and bounded complete- or mixed-depth
  LOD selection.
- Optional worker decode and integrated Cesium geometry preparation with
  bounded queues, caches, priorities, prefetch, and cancellation.
- Geographic, EPSG:2992, proj4-compatible WKT, explicit proj4, and
  application-provided coordinate transforms.
- A typed-array Cesium `Primitive` renderer, stable point-primitive fallback,
  and experimental buffer renderer.
- A high-level camera stream plus lower-level source, planning, layer, renderer,
  telemetry, and cache APIs.
- Unit, build, live-source, local-file, package-consumer, browser, license/SBOM,
  and device performance verification.

### Competition scope boundary

The competition deliverable is the reusable TypeScript library, its CesiumJS
rendering path, the reference example, and reproducible verification. Backend
services, data hosting, COPC conversion, and external delivery infrastructure are explicitly out of scope.
Public COPC URLs are test inputs. GitHub Pages only hosts the static reference
example; it is not a runtime dependency or performance optimization.

## Run the Reference Viewer

Use the [public viewer](https://kimddong03.github.io/COPC-Cesium-PointCloud-Provider/)
or run it locally with Node.js 22 and the npm version declared in
`packageManager`:

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. The viewer supports the documented Autzen and
Millsite presets, a custom URL, and a browser-selected local COPC file. Sample
provenance and reuse terms are in [DATASETS.md](docs/DATASETS.md).

## Consumer Setup

The package targets modern browser applications built with an ESM bundler.
CesiumJS `>=1.140.0 <2` is a peer dependency; native Node.js execution is not a
supported runtime.

Create and verify the current installable package from a repository checkout:

```bash
npm ci
npm run smoke:package
```

The command builds, packs, installs, type-checks, bundles, and browser-tests a
consumer application. It writes the tarball and checksum under
`output/package-smoke/`. Install that tarball with Cesium until the npm registry
release is confirmed:

```bash
npm install ./path/to/copc-cesium-0.1.0.tgz cesium
```

For a Vite consumer, configure Cesium's static assets:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

export default defineConfig({
  plugins: [cesium()],
});
```

Other bundlers must copy Cesium's `Workers`, `Assets`, `Widgets`, and
`ThirdParty` directories and configure `CESIUM_BASE_URL`. The package's COPC
workers are emitted as package-relative assets.

## Minimal Usage

```ts
import { Viewer } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  CopcPointCloudCameraStream,
  CopcPointCloudLayer,
} from "copc-cesium";

const viewer = new Viewer("cesium-container", {
  animation: false,
  baseLayer: false,
  baseLayerPicker: false,
  timeline: false,
});

const layer = new CopcPointCloudLayer(viewer.scene, {
  url: "https://example.com/cloud.copc.laz",
  pointSampleLoading: "worker",
  pointGeometryLoading: "integrated-worker",
  showBounds: false,
});

await layer.load();

const stream = new CopcPointCloudCameraStream({
  camera: viewer.camera,
  layer,
  quality: "balanced",
  onError: console.error,
});

stream.start();

// Dispose in ownership order when the view is no longer needed.
stream.destroy();
layer.destroy();
viewer.destroy();
```

For a browser-selected local file, pass `source` instead of `url`:

```ts
const file = fileInput.files?.[0];

if (file) {
  const localLayer = new CopcPointCloudLayer(viewer.scene, { source: file });
  await localLayer.load();
}
```

A complete type-checked integration is available in
[examples/minimal-layer.ts](examples/minimal-layer.ts).

## Remote Source Contract

A remote COPC host must:

- honor `Range` requests and return `206 Partial Content`;
- return exactly the requested number of bytes;
- expose `Content-Range` when exact range metadata is required; and
- allow the viewer origin and `Range` request header through CORS.

Persistent IndexedDB range reuse is opt-in. It additionally needs an exposed
strong `ETag`, or an application-owned immutable version plus authoritative
source length. It improves repeat visits only and is not cold-load evidence.

## Public Entry Points

```ts
import { CopcPointCloudLayer } from "copc-cesium";
import { CopcSource } from "copc-cesium/core";
import { CesiumPrimitivePointRenderer } from "copc-cesium/cesium";
```

| Entry point | Purpose |
| --- | --- |
| `copc-cesium` | Combined public surface |
| `copc-cesium/core` | Cesium-independent source, range, hierarchy, sampling, cache, and planning APIs |
| `copc-cesium/cesium` | Coordinate transforms, renderers, layer, workers, camera stream, policies, and telemetry |

See [API.md](docs/API.md) for integration contracts and the emitted TypeScript
declarations for the exhaustive public symbol list.

## Verification

Choose the smallest gate that proves the change:

```bash
npm test
npm run build
npm run smoke:package
```

Browser rendering changes should also run `npm run smoke:example`. The full
competition-device gate is:

```bash
npm run qc:contest-device
npm run evidence:contest:check
```

The full gate includes deterministic product checks, documented live COPC
Range checks, browser/package smoke, renderer measurements, smoothness gates,
same-device regression comparison, and a source-bound evidence manifest.
Performance reports record the actual GPU, browser, source state, and commit
fingerprint; they are not universal FPS guarantees.

## Documentation

- [API guide](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Sample data provenance](docs/DATASETS.md)
- [Performance and evidence](https://github.com/KimDDong03/COPC-Cesium-PointCloud-Provider/blob/main/docs/PERFORMANCE.md) (repository-only)
- [Gaia3D competition evidence map](https://github.com/KimDDong03/COPC-Cesium-PointCloud-Provider/blob/main/docs/COMPETITION.md) (repository-only)
- [Release procedure](https://github.com/KimDDong03/COPC-Cesium-PointCloud-Provider/blob/main/docs/RELEASE.md) (repository-only)
- [Contributing](https://github.com/KimDDong03/COPC-Cesium-PointCloud-Provider/blob/main/CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [SPDX SBOM](docs/sbom.spdx.json)

## License and Stability

The project is licensed under [MIT](LICENSE). Third-party packages and bundled
worker components are recorded in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[docs/sbom.spdx.json](docs/sbom.spdx.json).

The API is pre-1.0 and may change between minor releases. Current limitations
include browser-only runtime support, incomplete coverage across COPC producers,
CRSs, browsers, and hardware, and the need for an application-provided transform
when a CRS depends on unavailable external datum grids.
