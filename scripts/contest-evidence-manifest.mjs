import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  RUN_EVIDENCE_SCHEMA,
  createRunEvidence,
  validateRunEvidence,
  validateRunEvidenceSourceState,
} from "./run-evidence.mjs";

export const CONTEST_EVIDENCE_MANIFEST_SCHEMA =
  "copc-viewer.contest-evidence-manifest";
export const CONTEST_EVIDENCE_MANIFEST_SCHEMA_VERSION = 1;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "..");
const defaultOutputPath = path.join(
  defaultRepoRoot,
  "output",
  "contest-evidence",
  "contest-evidence-manifest.json",
);

export const CONTEST_EVIDENCE_REQUIRED_ARTIFACT_PATHS = [
  "output/qc/qc-status.json",
  "output/live-copc-range/live-copc-range.json",
  "output/renderer-benchmark/renderers.json",
  "output/smoothness-benchmark/smoothness-cold-detail.json",
  "output/smoothness-benchmark/smoothness-cold-detail-assertion.json",
  "output/smoothness-benchmark/smoothness-contest.json",
  "output/smoothness-benchmark/smoothness-contest-assertion.json",
  "output/smoothness-benchmark/smoothness-regression-live-range.json",
  "output/smoothness-benchmark/smoothness-regression-run-status.json",
  "output/smoothness-benchmark/smoothness-regression-sessions.json",
  "output/smoothness-benchmark/smoothness-regression.json",
  "output/package-smoke/browser-result.json",
  "output/example-smoke/smoke-example-result.json",
  "output/playwright/smoke-example-autzen-stream.png",
  "output/playwright/smoke-example-millsite-stream.png",
  "output/playwright/smoke-example-final-verification.png",
  "output/playwright/smoke-package-consumer.png",
];

const requiredPassingJsonPaths = new Map([
  ["output/qc/qc-status.json", { property: "status", expected: "passed" }],
  [
    "output/live-copc-range/live-copc-range.json",
    { property: "status", expected: "passed" },
  ],
  [
    "output/smoothness-benchmark/smoothness-cold-detail-assertion.json",
    { property: "failureCount", expected: 0 },
  ],
  [
    "output/smoothness-benchmark/smoothness-contest-assertion.json",
    { property: "failureCount", expected: 0 },
  ],
  [
    "output/smoothness-benchmark/smoothness-regression.json",
    { property: "failureCount", expected: 0 },
  ],
  [
    "output/package-smoke/browser-result.json",
    { property: "status", expected: "passed" },
  ],
  [
    "output/example-smoke/smoke-example-result.json",
    { property: "status", expected: "passed" },
  ],
  [
    "output/smoothness-benchmark/smoothness-regression-run-status.json",
    { property: "status", expected: "passed" },
  ],
]);

export async function createContestEvidenceManifest(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const outputPath = path.resolve(options.outputPath ?? defaultOutputPath);
  const runEvidence = options.runEvidence ?? await createRunEvidence({ repoRoot });
  const requireClean = options.requireClean ?? true;

  if (requireClean && runEvidence.git.worktreeState !== "clean") {
    throw new Error(
      "Contest evidence must be generated from a clean Git worktree.",
    );
  }

  const artifactPaths = [
    ...CONTEST_EVIDENCE_REQUIRED_ARTIFACT_PATHS,
    ...await findRegressionSessionArtifacts(repoRoot),
    ...await findPackageCandidateArtifacts(repoRoot),
  ];
  const uniqueArtifactPaths = [...new Set(artifactPaths)].sort(comparePaths);
  const artifacts = [];
  let embeddedRunEvidenceCount = 0;

  for (const relativePath of uniqueArtifactPaths) {
    const artifact = await createArtifactEvidence({
      repoRoot,
      relativePath,
      currentRunEvidence: runEvidence,
    });

    artifacts.push(artifact);
    embeddedRunEvidenceCount += artifact.embeddedRunEvidenceCount;
  }

  await verifyLinkedArtifactContracts(repoRoot, artifacts);

  const manifest = {
    schema: CONTEST_EVIDENCE_MANIFEST_SCHEMA,
    schemaVersion: CONTEST_EVIDENCE_MANIFEST_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    runEvidence,
    verification: {
      requiredArtifactCount: CONTEST_EVIDENCE_REQUIRED_ARTIFACT_PATHS.length,
      artifactCount: artifacts.length,
      totalByteLength: artifacts.reduce(
        (total, artifact) => total + artifact.byteLength,
        0,
      ),
      embeddedRunEvidenceCount,
      allRequiredArtifactsPresent: true,
      allPassingStatusesVerified: true,
      allEmbeddedCurrentSourceEvidenceMatched: true,
    },
    artifacts,
  };

  const failures = validateContestEvidenceManifest(manifest);

  if (failures.length > 0) {
    throw new Error(
      `Contest evidence manifest validation failed:\n${failures.join("\n")}`,
    );
  }

  await writeJsonAtomically(outputPath, manifest);
  return manifest;
}

export async function verifyContestEvidenceManifestFile(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const outputPath = path.resolve(options.outputPath ?? defaultOutputPath);
  const manifest = parseJsonArtifact(
    await readFile(outputPath),
    normalizeOutputPath(repoRoot, outputPath),
  );
  const failures = validateContestEvidenceManifest(manifest);

  if (failures.length > 0) {
    throw new Error(
      `Contest evidence manifest validation failed:\n${failures.join("\n")}`,
    );
  }

  const currentRunEvidence =
    options.runEvidence ?? await createRunEvidence({ repoRoot });
  const sourceFailures = validateRunEvidenceSourceState(
    manifest.runEvidence,
    currentRunEvidence,
    "contestEvidenceManifest.sourceState",
  );

  if (sourceFailures.length > 0) {
    throw new Error(
      `Contest evidence manifest does not match the current source:\n${sourceFailures.join("\n")}`,
    );
  }

  const expectedArtifactPaths = new Set([
    ...CONTEST_EVIDENCE_REQUIRED_ARTIFACT_PATHS,
    ...await findRegressionSessionArtifacts(repoRoot),
    ...await findPackageCandidateArtifacts(repoRoot),
  ]);
  const storedArtifactPaths = new Set(
    manifest.artifacts.map((artifact) => artifact.path),
  );

  if (
    expectedArtifactPaths.size !== storedArtifactPaths.size ||
    [...expectedArtifactPaths].some((value) => !storedArtifactPaths.has(value))
  ) {
    throw new Error(
      "Contest evidence manifest artifact paths do not match the current required evidence set.",
    );
  }

  const currentArtifacts = [];

  for (const storedArtifact of manifest.artifacts) {
    const currentArtifact = await createArtifactEvidence({
      repoRoot,
      relativePath: storedArtifact.path,
      currentRunEvidence,
    });

    for (const field of [
      "byteLength",
      "sha256",
      "embeddedRunEvidenceCount",
    ]) {
      if (storedArtifact[field] !== currentArtifact[field]) {
        throw new Error(
          `Contest evidence artifact changed after the manifest was generated: ${storedArtifact.path} (${field}).`,
        );
      }
    }

    currentArtifacts.push(currentArtifact);
  }

  await verifyLinkedArtifactContracts(repoRoot, currentArtifacts);
  return manifest;
}

export async function createArtifactEvidence(options) {
  const relativePath = normalizeRelativePath(options.relativePath);
  const absolutePath = resolveRepositoryPath(options.repoRoot, relativePath);
  const content = await readFile(absolutePath).catch((error) => {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      throw new Error(`Required contest evidence is missing: ${relativePath}`);
    }

    throw error;
  });
  let embeddedRunEvidenceCount = 0;

  if (relativePath.endsWith(".json")) {
    const parsed = parseJsonArtifact(content, relativePath);
    verifyPassingStatus(relativePath, parsed);
    const evidenceEntries = collectEmbeddedRunEvidence(parsed);

    if (evidenceEntries.length === 0) {
      throw new Error(
        `Contest JSON evidence is missing source-bound runEvidence: ${relativePath}`,
      );
    }

    for (const entry of evidenceEntries) {
      const failures = [
        ...validateRunEvidence(entry.evidence, entry.path),
        ...validateRunEvidenceSourceState(
          entry.evidence,
          options.currentRunEvidence,
          entry.path,
        ),
      ];

      if (failures.length > 0) {
        throw new Error(
          `Contest artifact source evidence does not match the current source (${relativePath}):\n${failures.join("\n")}`,
        );
      }
    }

    embeddedRunEvidenceCount = evidenceEntries.length;
  }

  return {
    path: relativePath,
    byteLength: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
    embeddedRunEvidenceCount,
  };
}

export function collectEmbeddedRunEvidence(value) {
  const entries = [];
  visitRunEvidence(value, "$", entries, false);
  return entries;
}

export function validateContestEvidenceManifest(manifest) {
  const failures = [];

  if (!isRecord(manifest)) {
    return ["manifest must be an object."];
  }

  if (manifest.schema !== CONTEST_EVIDENCE_MANIFEST_SCHEMA) {
    failures.push(
      `manifest.schema must be "${CONTEST_EVIDENCE_MANIFEST_SCHEMA}".`,
    );
  }

  if (
    manifest.schemaVersion !== CONTEST_EVIDENCE_MANIFEST_SCHEMA_VERSION
  ) {
    failures.push(
      `manifest.schemaVersion must be ${CONTEST_EVIDENCE_MANIFEST_SCHEMA_VERSION}.`,
    );
  }

  failures.push(...validateRunEvidence(manifest.runEvidence, "manifest.runEvidence"));

  if (
    typeof manifest.generatedAt !== "string" ||
    Number.isNaN(Date.parse(manifest.generatedAt)) ||
    new Date(manifest.generatedAt).toISOString() !== manifest.generatedAt
  ) {
    failures.push("manifest.generatedAt must be a valid UTC ISO-8601 timestamp.");
  }

  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    failures.push("manifest.artifacts must be a non-empty array.");
  } else {
    const seenPaths = new Set();

    for (const [index, artifact] of manifest.artifacts.entries()) {
      const valuePath = `manifest.artifacts[${index}]`;

      if (!isRecord(artifact)) {
        failures.push(`${valuePath} must be an object.`);
        continue;
      }

      if (
        typeof artifact.path !== "string" ||
        artifact.path.length === 0 ||
        artifact.path.includes("\\") ||
        path.posix.isAbsolute(artifact.path) ||
        artifact.path.split("/").includes("..")
      ) {
        failures.push(`${valuePath}.path must be a safe relative POSIX path.`);
      } else if (seenPaths.has(artifact.path)) {
        failures.push(`${valuePath}.path must be unique.`);
      } else {
        seenPaths.add(artifact.path);
      }

      if (!Number.isSafeInteger(artifact.byteLength) || artifact.byteLength <= 0) {
        failures.push(`${valuePath}.byteLength must be a positive integer.`);
      }

      if (
        typeof artifact.sha256 !== "string" ||
        !/^[0-9a-f]{64}$/.test(artifact.sha256)
      ) {
        failures.push(`${valuePath}.sha256 must be a lowercase SHA-256 digest.`);
      }

      if (
        !Number.isSafeInteger(artifact.embeddedRunEvidenceCount) ||
        artifact.embeddedRunEvidenceCount < 0
      ) {
        failures.push(
          `${valuePath}.embeddedRunEvidenceCount must be a non-negative integer.`,
        );
      }
    }

    for (const requiredPath of CONTEST_EVIDENCE_REQUIRED_ARTIFACT_PATHS) {
      if (!seenPaths.has(requiredPath)) {
        failures.push(
          `manifest.artifacts must include required evidence: ${requiredPath}.`,
        );
      }
    }

    validateManifestVerification(manifest.verification, manifest.artifacts, failures);
  }

  return failures;
}

function validateManifestVerification(verification, artifacts, failures) {
  if (!isRecord(verification)) {
    failures.push("manifest.verification must be an object.");
    return;
  }

  const expectedValues = {
    requiredArtifactCount: CONTEST_EVIDENCE_REQUIRED_ARTIFACT_PATHS.length,
    artifactCount: artifacts.length,
    totalByteLength: artifacts.reduce(
      (total, artifact) => total +
        (Number.isSafeInteger(artifact?.byteLength) ? artifact.byteLength : 0),
      0,
    ),
    embeddedRunEvidenceCount: artifacts.reduce(
      (total, artifact) => total +
        (Number.isSafeInteger(artifact?.embeddedRunEvidenceCount)
          ? artifact.embeddedRunEvidenceCount
          : 0),
      0,
    ),
    allRequiredArtifactsPresent: true,
    allPassingStatusesVerified: true,
    allEmbeddedCurrentSourceEvidenceMatched: true,
  };

  for (const [field, expected] of Object.entries(expectedValues)) {
    if (verification[field] !== expected) {
      failures.push(
        `manifest.verification.${field} must be ${JSON.stringify(expected)}.`,
      );
    }
  }
}

function visitRunEvidence(value, valuePath, entries, insideHistoricalBaseline) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      visitRunEvidence(
        item,
        `${valuePath}[${index}]`,
        entries,
        insideHistoricalBaseline,
      );
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (value.schema === RUN_EVIDENCE_SCHEMA) {
    if (!insideHistoricalBaseline) {
      entries.push({ path: valuePath, evidence: value });
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const historicalBaseline =
      insideHistoricalBaseline || key.toLowerCase().includes("baseline");
    visitRunEvidence(
      child,
      `${valuePath}.${key}`,
      entries,
      historicalBaseline,
    );
  }
}

function verifyPassingStatus(relativePath, parsed) {
  const contract = requiredPassingJsonPaths.get(relativePath);

  if (!contract) {
    return;
  }

  if (!isRecord(parsed) || parsed[contract.property] !== contract.expected) {
    throw new Error(
      `Contest evidence is not passing: ${relativePath} (${contract.property}=${JSON.stringify(parsed?.[contract.property])}, expected ${JSON.stringify(contract.expected)}).`,
    );
  }
}

function parseJsonArtifact(content, relativePath) {
  try {
    return JSON.parse(content.toString("utf8"));
  } catch (error) {
    throw new Error(`Contest evidence is not valid JSON: ${relativePath}`, {
      cause: error,
    });
  }
}

async function findRegressionSessionArtifacts(repoRoot) {
  const directory = path.join(
    repoRoot,
    "output",
    "smoothness-benchmark",
    "regression-sessions",
  );
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error) => {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        throw new Error(
          "Required contest evidence directory is missing: output/smoothness-benchmark/regression-sessions",
        );
      }

      throw error;
    },
  );
  const paths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map(
      (entry) =>
        `output/smoothness-benchmark/regression-sessions/${entry.name}`,
    )
    .sort(comparePaths);

  if (paths.length === 0) {
    throw new Error(
      "No current regression-session JSON evidence was found.",
    );
  }

  return paths;
}

async function findPackageCandidateArtifacts(repoRoot) {
  const directory = path.join(repoRoot, "output", "package-smoke");
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".tgz") || entry.name.endsWith(".tgz.sha256")),
    )
    .map((entry) => `output/package-smoke/${entry.name}`)
    .sort(comparePaths);
  const tarballCount = paths.filter((value) => value.endsWith(".tgz")).length;
  const checksumCount = paths.filter((value) => value.endsWith(".tgz.sha256")).length;

  if (tarballCount !== 1 || checksumCount !== 1) {
    throw new Error(
      `Expected one package tarball and one checksum, found ${tarballCount} tarballs and ${checksumCount} checksums.`,
    );
  }

  return paths;
}

async function verifyLinkedArtifactContracts(repoRoot, artifacts) {
  const artifactByPath = new Map(
    artifacts.map((artifact) => [artifact.path, artifact]),
  );
  const packageResultPath = "output/package-smoke/browser-result.json";
  const packageResult = parseJsonArtifact(
    await readFile(resolveRepositoryPath(repoRoot, packageResultPath)),
    packageResultPath,
  );
  const releaseCandidate = packageResult.releaseCandidateArtifact;

  if (
    !isRecord(releaseCandidate) ||
    typeof releaseCandidate.fileName !== "string" ||
    !Number.isSafeInteger(releaseCandidate.byteCount) ||
    !isRecord(releaseCandidate.digest) ||
    releaseCandidate.digest.algorithm !== "sha256" ||
    typeof releaseCandidate.digest.value !== "string"
  ) {
    throw new Error(
      "Package smoke evidence is missing a valid releaseCandidateArtifact contract.",
    );
  }

  const tarballPath = `output/package-smoke/${releaseCandidate.fileName}`;
  const checksumPath = `${tarballPath}.sha256`;
  const tarball = artifactByPath.get(tarballPath);
  const checksum = artifactByPath.get(checksumPath);

  if (!tarball || !checksum) {
    throw new Error(
      "Package candidate tarball or checksum is missing from contest evidence.",
    );
  }

  if (
    tarball.byteLength !== releaseCandidate.byteCount ||
    tarball.sha256 !== releaseCandidate.digest.value
  ) {
    throw new Error(
      "Package candidate bytes do not match browser-result releaseCandidateArtifact evidence.",
    );
  }

  const checksumText = await readFile(
    resolveRepositoryPath(repoRoot, checksumPath),
    "utf8",
  );
  const checksumMatch = /^([0-9a-f]{64})  ([^\r\n]+)\r?\n?$/.exec(
    checksumText,
  );

  if (
    !checksumMatch ||
    checksumMatch[1] !== tarball.sha256 ||
    checksumMatch[2] !== releaseCandidate.fileName
  ) {
    throw new Error(
      "Package candidate checksum sidecar does not match the tarball evidence.",
    );
  }

  const packageScreenshot = packageResult.artifacts;

  if (
    !isRecord(packageScreenshot) ||
    typeof packageScreenshot.screenshotPath !== "string" ||
    typeof packageScreenshot.screenshotRelativePath !== "string" ||
    !Number.isSafeInteger(packageScreenshot.screenshotByteCount) ||
    typeof packageScreenshot.screenshotSha256 !== "string"
  ) {
    throw new Error(
      "Package smoke evidence is missing a source-bound screenshot contract.",
    );
  }

  const packageScreenshotPath = normalizeArtifactPathFromEvidence(
    packageScreenshot.screenshotRelativePath,
  );
  const packageScreenshotArtifact = artifactByPath.get(packageScreenshotPath);

  if (
    !packageScreenshotArtifact ||
    packageScreenshotArtifact.byteLength !==
      packageScreenshot.screenshotByteCount ||
    packageScreenshotArtifact.sha256 !== packageScreenshot.screenshotSha256
  ) {
    throw new Error(
      "Package smoke screenshot does not match its source-bound browser result.",
    );
  }

  const smokeResultPath = "output/example-smoke/smoke-example-result.json";
  const smokeResult = parseJsonArtifact(
    await readFile(resolveRepositoryPath(repoRoot, smokeResultPath)),
    smokeResultPath,
  );

  if (!Array.isArray(smokeResult.screenshots)) {
    throw new Error("Example smoke evidence is missing screenshot contracts.");
  }

  const expectedSmokeScreenshotPaths = new Set([
    "output/playwright/smoke-example-autzen-stream.png",
    "output/playwright/smoke-example-millsite-stream.png",
    "output/playwright/smoke-example-final-verification.png",
  ]);
  const observedSmokeScreenshotPaths = new Set(
    smokeResult.screenshots.map((screenshot) => screenshot?.path),
  );

  if (
    expectedSmokeScreenshotPaths.size !== observedSmokeScreenshotPaths.size ||
    [...expectedSmokeScreenshotPaths].some(
      (value) => !observedSmokeScreenshotPaths.has(value),
    )
  ) {
    throw new Error(
      "Example smoke evidence does not contain the exact required screenshot set.",
    );
  }

  for (const screenshot of smokeResult.screenshots) {
    if (
      !isRecord(screenshot) ||
      typeof screenshot.path !== "string" ||
      !Number.isSafeInteger(screenshot.byteLength) ||
      typeof screenshot.sha256 !== "string"
    ) {
      throw new Error("Example smoke evidence has an invalid screenshot contract.");
    }

    const artifact = artifactByPath.get(screenshot.path);

    if (
      !artifact ||
      artifact.byteLength !== screenshot.byteLength ||
      artifact.sha256 !== screenshot.sha256
    ) {
      throw new Error(
        `Example smoke screenshot does not match its source-bound result: ${screenshot.path}`,
      );
    }
  }
}

function normalizeArtifactPathFromEvidence(value) {
  return normalizeRelativePath(value);
}

function resolveRepositoryPath(repoRoot, relativePath) {
  const absolutePath = path.resolve(repoRoot, ...relativePath.split("/"));
  const relative = path.relative(repoRoot, absolutePath);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Evidence path escapes the repository: ${relativePath}`);
  }

  return absolutePath;
}

function normalizeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Evidence path must be a non-empty string.");
  }

  const normalized = value.replaceAll("\\", "/");

  if (path.posix.isAbsolute(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`Evidence path must stay inside the repository: ${value}`);
  }

  return normalized;
}

function normalizeOutputPath(repoRoot, outputPath) {
  const relativePath = path.relative(repoRoot, outputPath).replaceAll("\\", "/");
  return relativePath.startsWith("../") || path.posix.isAbsolute(relativePath)
    ? outputPath
    : relativePath;
}

async function writeJsonAtomically(outputPath, value) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;

  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporaryPath, outputPath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

function comparePaths(left, right) {
  return Buffer.from(left, "utf8").compare(Buffer.from(right, "utf8"));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function runCli() {
  const checkOnly = process.argv.includes("--check");
  const manifest = checkOnly
    ? await verifyContestEvidenceManifestFile()
    : await createContestEvidenceManifest({
        requireClean: !process.argv.includes("--allow-dirty"),
      });

  console.log(
    `Contest evidence manifest ${checkOnly ? "verified" : "created"}: ${path.relative(defaultRepoRoot, defaultOutputPath)} (${manifest.verification.artifactCount} artifacts, ${manifest.verification.totalByteLength} bytes).`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : undefined;

if (invokedPath === import.meta.url) {
  await runCli();
}
