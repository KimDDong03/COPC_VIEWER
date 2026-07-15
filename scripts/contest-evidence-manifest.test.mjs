import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONTEST_EVIDENCE_REQUIRED_ARTIFACT_PATHS,
  collectEmbeddedRunEvidence,
  createArtifactEvidence,
  createContestEvidenceManifest,
  validateContestEvidenceManifest,
  verifyContestEvidenceManifestFile,
} from "./contest-evidence-manifest.mjs";
import {
  RUN_EVIDENCE_SCHEMA,
  RUN_EVIDENCE_SCHEMA_VERSION,
} from "./run-evidence.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("contest evidence manifest", () => {
  it("creates and re-verifies a complete linked evidence set", async () => {
    const repoRoot = await createTemporaryDirectory();
    const runEvidence = createTestRunEvidence();
    const outputPath = path.join(
      repoRoot,
      "output",
      "contest-evidence",
      "contest-evidence-manifest.json",
    );
    const fixture = await writeCompleteEvidenceFixture(repoRoot, runEvidence);

    const manifest = await createContestEvidenceManifest({
      repoRoot,
      outputPath,
      runEvidence,
    });

    expect(manifest.artifacts.map((artifact) => artifact.path)).toEqual(
      expect.arrayContaining([
        fixture.tarballPath,
        `${fixture.tarballPath}.sha256`,
        fixture.regressionSessionPath,
        ...fixture.exampleScreenshotPaths,
        fixture.packageScreenshotPath,
      ]),
    );
    expect(manifest.verification).toMatchObject({
      allRequiredArtifactsPresent: true,
      allPassingStatusesVerified: true,
      allEmbeddedCurrentSourceEvidenceMatched: true,
    });

    await expect(
      verifyContestEvidenceManifestFile({
        repoRoot,
        outputPath,
        runEvidence,
      }),
    ).resolves.toEqual(manifest);

    await writeRepositoryArtifact(
      repoRoot,
      fixture.tarballPath,
      Buffer.from("mutated package candidate"),
    );

    await expect(
      verifyContestEvidenceManifestFile({
        repoRoot,
        outputPath,
        runEvidence,
      }),
    ).rejects.toThrow("changed after the manifest was generated");
  });

  it("hashes an artifact and verifies embedded current source evidence", async () => {
    const repoRoot = await createTemporaryDirectory();
    const relativePath = "output/example/result.json";
    const absolutePath = path.join(repoRoot, ...relativePath.split("/"));
    const runEvidence = createTestRunEvidence();
    const content = `${JSON.stringify({ runEvidence })}\n`;

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);

    await expect(
      createArtifactEvidence({
        repoRoot,
        relativePath,
        currentRunEvidence: runEvidence,
      }),
    ).resolves.toEqual({
      path: relativePath,
      byteLength: Buffer.byteLength(content),
      sha256: createHash("sha256").update(content).digest("hex"),
      embeddedRunEvidenceCount: 1,
    });
  });

  it("rejects stale embedded source evidence", async () => {
    const repoRoot = await createTemporaryDirectory();
    const relativePath = "output/example/result.json";
    const absolutePath = path.join(repoRoot, ...relativePath.split("/"));
    const currentRunEvidence = createTestRunEvidence();
    const staleRunEvidence = createTestRunEvidence({
      headSha: "b".repeat(40),
    });

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, JSON.stringify({ runEvidence: staleRunEvidence }));

    await expect(
      createArtifactEvidence({
        repoRoot,
        relativePath,
        currentRunEvidence,
      }),
    ).rejects.toThrow("does not match the current source");
  });

  it("rejects JSON evidence without a source-bound runEvidence record", async () => {
    const repoRoot = await createTemporaryDirectory();
    const relativePath = "output/example/result.json";
    const absolutePath = path.join(repoRoot, ...relativePath.split("/"));

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, JSON.stringify({ status: "passed" }));

    await expect(
      createArtifactEvidence({
        repoRoot,
        relativePath,
        currentRunEvidence: createTestRunEvidence(),
      }),
    ).rejects.toThrow("missing source-bound runEvidence");
  });

  it("excludes historical baseline evidence while retaining current evidence", () => {
    const current = createTestRunEvidence();
    const baseline = createTestRunEvidence({ headSha: "c".repeat(40) });
    const entries = collectEmbeddedRunEvidence({
      currentRunEvidence: current,
      baselineSourceRunEvidence: baseline,
      sessions: [{ runEvidence: current }],
    });

    expect(entries.map((entry) => entry.path)).toEqual([
      "$.currentRunEvidence",
      "$.sessions[0].runEvidence",
    ]);
  });

  it("validates unique safe artifact records", () => {
    const runEvidence = createTestRunEvidence();
    const manifest = {
      schema: "copc-viewer.contest-evidence-manifest",
      schemaVersion: 1,
      generatedAt: "2026-07-15T00:00:00.000Z",
      runEvidence,
      verification: {
        requiredArtifactCount: CONTEST_EVIDENCE_REQUIRED_ARTIFACT_PATHS.length,
        artifactCount: CONTEST_EVIDENCE_REQUIRED_ARTIFACT_PATHS.length,
        totalByteLength: 10 * CONTEST_EVIDENCE_REQUIRED_ARTIFACT_PATHS.length,
        embeddedRunEvidenceCount:
          CONTEST_EVIDENCE_REQUIRED_ARTIFACT_PATHS.filter((value) =>
            value.endsWith(".json"),
          ).length,
        allRequiredArtifactsPresent: true,
        allPassingStatusesVerified: true,
        allEmbeddedCurrentSourceEvidenceMatched: true,
      },
      artifacts: CONTEST_EVIDENCE_REQUIRED_ARTIFACT_PATHS.map(
        (artifactPath) => ({
          path: artifactPath,
          byteLength: 10,
          sha256: "d".repeat(64),
          embeddedRunEvidenceCount: artifactPath.endsWith(".json") ? 1 : 0,
        }),
      ),
    };

    expect(validateContestEvidenceManifest(manifest)).toEqual([]);
    expect(
      validateContestEvidenceManifest({
        ...manifest,
        verification: {
          ...manifest.verification,
          artifactCount: manifest.verification.artifactCount - 1,
        },
        artifacts: manifest.artifacts.slice(1),
      }),
    ).toContain(
      `manifest.artifacts must include required evidence: ${manifest.artifacts[0].path}.`,
    );
    expect(
      validateContestEvidenceManifest({
        ...manifest,
        artifacts: [
          ...manifest.artifacts,
          { ...manifest.artifacts[0], path: "../outside.json" },
        ],
      }),
    ).toContain(
      `manifest.artifacts[${manifest.artifacts.length}].path must be a safe relative POSIX path.`,
    );
  });
});

async function createTemporaryDirectory() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "copc-contest-evidence-test-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

async function writeCompleteEvidenceFixture(repoRoot, runEvidence) {
  const packageFileName = "copc-viewer-test.tgz";
  const tarballPath = `output/package-smoke/${packageFileName}`;
  const packageScreenshotPath =
    "output/playwright/smoke-package-consumer.png";
  const regressionSessionPath =
    "output/smoothness-benchmark/regression-sessions/session-01.json";
  const exampleScreenshotPaths = [
    "output/playwright/smoke-example-autzen-stream.png",
    "output/playwright/smoke-example-millsite-stream.png",
    "output/playwright/smoke-example-final-verification.png",
  ];
  const tarball = Buffer.from("linked package candidate bytes");
  const packageScreenshot = Buffer.from("package consumer screenshot");
  const tarballSha256 = sha256(tarball);
  const packageScreenshotSha256 = sha256(packageScreenshot);

  await writeRepositoryArtifact(repoRoot, tarballPath, tarball);
  await writeRepositoryArtifact(
    repoRoot,
    `${tarballPath}.sha256`,
    `${tarballSha256}  ${packageFileName}\n`,
  );
  await writeRepositoryArtifact(
    repoRoot,
    packageScreenshotPath,
    packageScreenshot,
  );

  const screenshots = [];

  for (const [index, screenshotPath] of exampleScreenshotPaths.entries()) {
    const content = Buffer.from(`example screenshot ${index + 1}`);

    await writeRepositoryArtifact(repoRoot, screenshotPath, content);
    screenshots.push({
      path: screenshotPath,
      byteLength: content.byteLength,
      sha256: sha256(content),
    });
  }

  const genericEvidence = {
    runEvidence,
  };
  const passingJsonOverrides = new Map([
    ["output/qc/qc-status.json", { status: "passed" }],
    ["output/live-copc-range/live-copc-range.json", { status: "passed" }],
    [
      "output/smoothness-benchmark/smoothness-cold-detail-assertion.json",
      { failureCount: 0 },
    ],
    [
      "output/smoothness-benchmark/smoothness-contest-assertion.json",
      { failureCount: 0 },
    ],
    [
      "output/smoothness-benchmark/smoothness-regression-run-status.json",
      { status: "passed" },
    ],
    [
      "output/smoothness-benchmark/smoothness-regression.json",
      { failureCount: 0 },
    ],
  ]);

  for (const artifactPath of CONTEST_EVIDENCE_REQUIRED_ARTIFACT_PATHS) {
    if (!artifactPath.endsWith(".json")) {
      continue;
    }

    if (artifactPath === "output/package-smoke/browser-result.json") {
      await writeJsonArtifact(repoRoot, artifactPath, {
        status: "passed",
        runEvidence,
        releaseCandidateArtifact: {
          fileName: packageFileName,
          byteCount: tarball.byteLength,
          digest: {
            algorithm: "sha256",
            value: tarballSha256,
          },
        },
        artifacts: {
          screenshotPath: path.join(
            repoRoot,
            ...packageScreenshotPath.split("/"),
          ),
          screenshotRelativePath: packageScreenshotPath,
          screenshotByteCount: packageScreenshot.byteLength,
          screenshotSha256: packageScreenshotSha256,
        },
      });
      continue;
    }

    if (artifactPath === "output/example-smoke/smoke-example-result.json") {
      await writeJsonArtifact(repoRoot, artifactPath, {
        status: "passed",
        runEvidence,
        screenshots,
      });
      continue;
    }

    await writeJsonArtifact(repoRoot, artifactPath, {
      ...genericEvidence,
      ...passingJsonOverrides.get(artifactPath),
    });
  }

  await writeJsonArtifact(repoRoot, regressionSessionPath, {
    runEvidence,
    session: 1,
  });

  return {
    tarballPath,
    packageScreenshotPath,
    regressionSessionPath,
    exampleScreenshotPaths,
  };
}

async function writeJsonArtifact(repoRoot, relativePath, value) {
  await writeRepositoryArtifact(
    repoRoot,
    relativePath,
    `${JSON.stringify(value)}\n`,
  );
}

async function writeRepositoryArtifact(repoRoot, relativePath, content) {
  const absolutePath = path.join(repoRoot, ...relativePath.split("/"));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function createTestRunEvidence(options = {}) {
  return {
    schema: RUN_EVIDENCE_SCHEMA,
    schemaVersion: RUN_EVIDENCE_SCHEMA_VERSION,
    generatedAt: "2026-07-15T00:00:00.000Z",
    git: {
      headSha: options.headSha ?? "a".repeat(40),
      worktreeState: "clean",
      fingerprint: {
        algorithm: "sha256",
        value: "1".repeat(64),
        trackedDiffByteLength: 0,
        trackedDiffSha256: "2".repeat(64),
        untrackedFileCount: 0,
        untrackedContentByteLength: 0,
        untrackedManifestSha256: "3".repeat(64),
        exclusions: ["output/**", "benchmarks/baselines/**"],
      },
    },
    runtime: {
      nodeVersion: "v22.22.0",
      platform: "win32",
      architecture: "x64",
      npm: {
        lifecycleEvent: null,
        lifecycleScript: null,
        packageName: null,
        packageVersion: null,
        userAgent: null,
      },
    },
  };
}
