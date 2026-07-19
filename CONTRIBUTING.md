# Contributing

Thanks for helping improve **COPC Cesium PointCloud Provider**, distributed as
the `copc-cesium` package.

## Scope

Contributions should strengthen direct browser COPC loading and CesiumJS-native
rendering:

- URL/`File`/`Blob` byte-range reads and COPC metadata/hierarchy;
- bounded camera/frustum/LOD selection;
- worker, cache, priority, prefetch, cancellation, and lifecycle behavior;
- coordinate transforms and Cesium renderers;
- reusable public APIs, the reference example, and repeatable verification.

The project is not a general point-cloud viewer, live LiDAR ingestion system,
backend/hosting product, or COPC-to-3D-Tiles converter. Keep `src/core`
independent of Cesium and application-only UI/orchestration in the example.

Read [Architecture](docs/ARCHITECTURE.md) before changing a layer boundary and
[API Guide](docs/API.md) before changing public behavior.

## Setup

Use Node.js 22 and the npm version declared by `packageManager`:

```bash
node --version
npm --version
npm ci
npm run dev
```

Open <http://localhost:3000>. If a browser check reports that Chrome for Testing
is missing, run once:

```bash
npm run smoke:example:install-browser
```

## Verification

Run the smallest gate that proves the change, then expand according to risk.

| Change | Expected checks |
| --- | --- |
| Documentation | link/command audit, focused contract tests, `git diff --check` |
| Pure logic | focused tests and `npm test` |
| Public API/build | `npm test`, `npm run build`, `npm run smoke:package` |
| Example/rendering | above plus `npm run smoke:example` |
| Range/worker/cache/CRS/LOD/renderer | `npm run qc` and the relevant focused benchmark |
| Release/contest evidence | clean worktree, `npm run qc:contest-device`, `npm run evidence:contest:check` |

`npm run qc` includes live public sources and real browser/device observations;
it can fail for a classified external-source outage. Report the classification
and deterministic product result separately instead of relabeling the run.

Performance changes must include artifact paths, the actual
`browserGraphics.renderer`, source fingerprint, budgets, and comparison
contract. Do not compare different GPUs as a same-device regression.

## Code Guidelines

- Keep changes focused and avoid unrelated formatting/refactors.
- Preserve typed data boundaries between core loading and Cesium rendering.
- Preserve COPC additive ancestor semantics in terminal node composition.
- Keep work bounded by explicit node, point, byte, cache, concurrency, and
  cancellation limits.
- Add focused tests for new behavior and regression tests for fixed failures.
- Abort superseded render-capable work and reject stale progress before it can
  mutate the shared renderer.
- Keep example UI changes tied to demonstrating or verifying library behavior.
- Update documentation when exports, defaults, runtime requirements, commands,
  or evidence contracts change.
- Do not commit generated `output/`, local submission files, agent working files,
  secrets, private URLs, or non-redistributable data.

## Dependencies and Data

After every dependency or lockfile change:

```bash
npm run license:evidence
npm run license:evidence:self-test
```

Commit the regenerated `THIRD_PARTY_NOTICES.md` and `docs/sbom.spdx.json` with
the dependency change.

Do not add a sample-data preset without recording its provider, canonical
source, reuse terms, attribution, CRS, transformation history, and
redistribution status in [DATASETS.md](docs/DATASETS.md). A reachable URL alone
does not prove permission.

## Pull Requests

Use the repository template and state:

- evidence observed and reason/root cause;
- focused change made;
- public API, compatibility, data-flow, memory, or performance impact;
- exact verification commands and results;
- skipped checks and remaining risk;
- dependency/license/data effects.

Keep unrelated user work out of the commit and stage only intended files.

## Reporting Issues

Include:

- package version, tag, or commit;
- browser, OS, Cesium version, and GPU/WebGL adapter when relevant;
- shareable COPC characteristics: input type, size, point format, CRS, and
  Range/CORS behavior;
- expected and actual behavior with exact errors or artifact paths;
- minimal reproduction;
- results of `npm test`, `npm run build`, and relevant browser smoke.

Report suspected vulnerabilities privately according to
[SECURITY.md](SECURITY.md), never in a public issue.
