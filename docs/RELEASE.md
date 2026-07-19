# Release Procedure

Releases are manual and source-bound. The `Release Candidate` workflow produces
a verified package artifact and hosted functional evidence. It does not publish
to npm or create a GitHub release. `Publish npm Package` is a separate
manual-only workflow protected by the `npm` GitHub Environment.

Never move an existing version tag or replace a published artifact silently.

## 1. Prepare the Version

1. Start from a reviewed commit on the intended release branch with no
   unrelated worktree changes.
2. Choose the next semantic version. Update `package.json`, `package-lock.json`,
   and `CHANGELOG.md` together.
3. Move the relevant `Unreleased` entries into a dated version section and
   update the changelog comparison links.
4. Confirm the public exports, generated declarations, browser/bundler target,
   Cesium peer range, and Node/npm development contract.
5. If dependencies or lock metadata changed, run `npm run license:evidence` and
   commit both `THIRD_PARTY_NOTICES.md` and `docs/sbom.spdx.json`.
6. Confirm that no sample dataset bytes, local submission files, agent files,
   ignored evidence, tokens, or private URLs enter the npm package.

The current `v0.1.0` tag already exists. Do not recreate or force-move it; use a
new patch/minor version for later publication changes.

## 2. Verify Locally

Use Node.js 22 and the npm version declared by `packageManager`:

```powershell
npm ci
npm run smoke:example:install-browser
npm audit
npm run license:evidence:self-test
npm run qc:contest-device
npm run evidence:contest:check
npm pack --dry-run
git diff --check
git status --short
```

Run the final device gate from a clean source state on the performance machine.
Preserve:

- `output/qc/qc-status.json`;
- live Range, renderer, smoothness, and regression JSON;
- browser screenshots;
- the exact package tarball and `.sha256` file;
- `output/package-smoke/browser-result.json`;
- `output/contest-evidence/contest-evidence-manifest.json`.

Check that every artifact records the intended commit/source fingerprint and
actual browser/WebGL adapter. Dirty diagnostics can help investigate a change,
but must not be cited as final release evidence.

The workstation device gate and hosted release workflow prove different
things. Hosted functional success does not replace same-device performance
evidence.

## 3. Create the Release Candidate

Create an annotated tag that exactly matches `package.json` and push it:

```powershell
$version = node -p "require('./package.json').version"
git tag -a "v$version" -m "v$version"
git push origin "v$version"
```

Pushing `v*` triggers `.github/workflows/release-candidate.yml`. A maintainer can
also dispatch that workflow manually for a pre-tag diagnostic, but npm
publication still requires an existing exact version tag and a successful
Release Candidate run for the same commit.

The workflow:

1. checks that a tag equals `v${package.version}` when tag-triggered;
2. installs Node 22 and the declared npm version;
3. runs `npm audit` and `npm run qc:release`;
4. uploads functional diagnostics even when a later step fails;
5. uploads one versioned candidate artifact containing the tarball, checksum,
   browser/package evidence, notices, and SBOM.

`qc:release` intentionally omits workstation smoothness gates because hosted
Linux may use a software WebGL adapter. Verify the candidate contains exactly
one `.tgz`, its adjacent `.tgz.sha256`, and the expected JSON/screenshots.

Record the successful Release Candidate workflow run ID; publication requires
it.

## 4. Publish to npm

Publishing requires maintainer approval and the protected `npm` Environment.
Before dispatch:

- verify npm account/organization ownership, package name `copc-cesium`, public
  access, and 2FA/trusted-publishing configuration;
- configure required reviewers for the GitHub `npm` Environment;
- configure npm trusted publishing for repository
  `KimDDong03/COPC-Cesium-PointCloud-Provider`, workflow `npm-publish.yml`, and
  environment `npm`;
- if the first publication cannot yet use trusted publishing, use only a
  short-lived granular `NPM_TOKEN` in that protected environment and remove it
  immediately after trusted publishing is enabled;
- verify the candidate checksum and unpacked file list.

From the exact version tag, manually dispatch `Publish npm Package` with:

- `confirm_publish = true`;
- the successful same-SHA Release Candidate run ID.

The workflow rejects a non-tag ref or tag/version mismatch, reruns
`npm run qc:release`, downloads the approved Release Candidate artifact,
verifies the run name/conclusion/SHA, checks the approved checksum, reproduces
the tarball, and requires both tarball SHA-256 values to match before
`npm publish --provenance`.

Do not publish a locally rebuilt tarball in place of the approved artifact.

## 5. Create the GitHub Release

After npm publication succeeds:

1. Create the GitHub release from the existing version tag.
2. Attach the approved `.tgz`, `.tgz.sha256`, and any intentionally public
   release evidence.
3. Use the matching `CHANGELOG.md` section as the release-note basis.
4. Record the public npm and GitHub release URLs in changelog link references if
   they differ from the standard locations.

## 6. Verify the Published Package

Use a new directory with no repository-local resolution:

```powershell
npm init -y
npm install copc-cesium@<version> cesium
npm audit signatures
```

Then verify:

- all three imports: `copc-cesium`, `copc-cesium/core`, and
  `copc-cesium/cesium`;
- TypeScript declarations under Bundler and NodeNext resolution;
- Vite consumer build and Cesium static assets;
- packaged COPC workers;
- live `206` Range behavior and camera LOD in the browser;
- package version, tarball checksum, provenance, and registry metadata.

## 7. Close the Release

- Confirm README, API, security, changelog, declarations, notices, and SBOM
  describe the released package rather than later `main` changes.
- Keep the tag, approved candidate, checksum, workflow run, and evidence
  reachable.
- If a release is bad, publish a documented patch or deprecate the affected
  version. Do not mutate the existing tag or release files.
- Retain the public repository and contest evidence for any period required by
  the competition rules.
