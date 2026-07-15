## Summary

<!-- State the user-visible outcome and keep the scope narrow. -->

## Evidence / reason

<!-- For a bug, include the observed failure and root cause. For a feature, include the design reason and relevant existing pattern or official documentation. -->

## Changed

<!-- List the focused implementation and any public API, compatibility, data-flow, or performance impact. -->

## Verification

<!-- List exact commands, browser checks, datasets, and results. Never mark a check as run when it was not run. -->

- [ ] Focused tests pass.
- [ ] Type check/build passes, when applicable.
- [ ] Browser smoke passes for rendering changes, when applicable.
- [ ] `npm run qc` passes for release, LOD, worker, cache, CRS, or renderer changes, when applicable.
- [ ] Performance reports include their artifact path and actual `browserGraphics.renderer`, when applicable.

## License and data

<!-- Check every applicable statement and explain any unchecked requirement. -->

- [ ] No new dependency, copied third-party source, or sample dataset is introduced.
- [ ] Or, new dependency/source licenses and notices are recorded, and `npm run license:evidence` artifacts are committed.
- [ ] Or, new sample-data provenance, reuse terms, attribution, CRS, and redistribution status are recorded in `docs/DATASETS.md`.
- [ ] No secrets, credentials, private URLs, or non-redistributable data are included.

## Notes / remaining risk

<!-- Record tradeoffs, skipped checks with reasons, and known follow-up work. -->
