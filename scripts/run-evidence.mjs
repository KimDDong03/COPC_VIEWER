import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RUN_EVIDENCE_SCHEMA = "copc-viewer.run-evidence";
export const RUN_EVIDENCE_SCHEMA_VERSION = 1;

const fingerprintExclusions = ["output/**", "benchmarks/baselines/**"];
const earliestPlausibleGeneratedAt = Date.parse("2020-01-01T00:00:00.000Z");
const generatedAtFutureToleranceMilliseconds = 5 * 60 * 1_000;
const gitFingerprintPathspecs = [
  ".",
  ...fingerprintExclusions.map((pattern) => `:(exclude)${pattern}`),
];

export async function createRunEvidence(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  ));
  const generatedAt = options.generatedAt ?? new Date();
  const environment = options.environment ?? process.env;
  const git = await readGitEvidence(repoRoot);

  return {
    schema: RUN_EVIDENCE_SCHEMA,
    schemaVersion: RUN_EVIDENCE_SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString(),
    git,
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      npm: {
        lifecycleEvent: readNullableEnvironmentValue(
          environment.npm_lifecycle_event,
        ),
        lifecycleScript: readNullableEnvironmentValue(
          environment.npm_lifecycle_script,
        ),
        packageName: readNullableEnvironmentValue(environment.npm_package_name),
        packageVersion: readNullableEnvironmentValue(
          environment.npm_package_version,
        ),
        userAgent: readNullableEnvironmentValue(environment.npm_config_user_agent),
      },
    },
  };
}

export function validateRunEvidence(evidence, valuePath = "runEvidence") {
  const failures = [];

  if (!isRecord(evidence)) {
    return [`${valuePath} must be an object.`];
  }

  if (evidence.schema !== RUN_EVIDENCE_SCHEMA) {
    failures.push(
      `${valuePath}.schema must be "${RUN_EVIDENCE_SCHEMA}".`,
    );
  }

  if (evidence.schemaVersion !== RUN_EVIDENCE_SCHEMA_VERSION) {
    failures.push(
      `${valuePath}.schemaVersion must be ${RUN_EVIDENCE_SCHEMA_VERSION}.`,
    );
  }

  validateUtcTimestamp(evidence.generatedAt, `${valuePath}.generatedAt`, failures);
  validateGitEvidence(evidence.git, `${valuePath}.git`, failures);
  validateRuntimeEvidence(evidence.runtime, `${valuePath}.runtime`, failures);

  return failures;
}

export function validateRunEvidenceSourceState(
  capturedEvidence,
  currentEvidence,
  valuePath = "runEvidenceSourceState",
) {
  const failures = [
    ...validateRunEvidence(capturedEvidence, `${valuePath}.captured`),
    ...validateRunEvidence(currentEvidence, `${valuePath}.current`),
  ];

  if (failures.length > 0) {
    return failures;
  }

  for (const field of ["headSha", "worktreeState"]) {
    if (capturedEvidence.git[field] !== currentEvidence.git[field]) {
      failures.push(`${valuePath}.git.${field} changed during the run.`);
    }
  }

  if (
    capturedEvidence.git.fingerprint.value !==
    currentEvidence.git.fingerprint.value
  ) {
    failures.push(
      `${valuePath}.git.fingerprint.value changed during the run.`,
    );
  }

  return failures;
}

export function validateBrowserEnvironment(
  environment,
  valuePath = "browserEnvironment",
) {
  const failures = [];

  if (!isRecord(environment)) {
    return [`${valuePath} must be an object.`];
  }

  validateNonEmptyString(
    environment.userAgent,
    `${valuePath}.userAgent`,
    failures,
  );
  validateNonEmptyString(environment.version, `${valuePath}.version`, failures);

  if (
    typeof environment.version === "string" &&
    !/^\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(environment.version)
  ) {
    failures.push(`${valuePath}.version must be a browser version string.`);
  }

  return failures;
}

async function readGitEvidence(repoRoot) {
  const headSha = runGit(repoRoot, ["rev-parse", "--verify", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const status = runGit(
    repoRoot,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { encoding: null },
  );
  const trackedDiff = runGit(
    repoRoot,
    [
      "diff",
      "--binary",
      "--no-ext-diff",
      "--no-textconv",
      "HEAD",
      "--",
      ...gitFingerprintPathspecs,
    ],
    { encoding: null },
  );
  const untrackedPaths = parseNullSeparatedPaths(
    runGit(
      repoRoot,
      [
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        ...gitFingerprintPathspecs,
      ],
      { encoding: null },
    ),
  ).sort(comparePaths);
  const fingerprintHash = createHash("sha256");
  const untrackedManifestHash = createHash("sha256");
  const trackedDiffSha256 = hashBuffer(trackedDiff);
  let untrackedContentByteLength = 0;

  updateFramedHash(fingerprintHash, "tracked-diff", trackedDiff);

  for (const relativePath of untrackedPaths) {
    const absolutePath = resolveRepositoryPath(repoRoot, relativePath);
    const content = await readFile(absolutePath);

    updateFramedHash(fingerprintHash, `untracked-path:${relativePath}`, content);
    updateFramedHash(
      untrackedManifestHash,
      `untracked-path:${relativePath}`,
      content,
    );
    untrackedContentByteLength += content.byteLength;
  }

  return {
    headSha,
    worktreeState: status.byteLength === 0 ? "clean" : "dirty",
    fingerprint: {
      algorithm: "sha256",
      value: fingerprintHash.digest("hex"),
      trackedDiffByteLength: trackedDiff.byteLength,
      trackedDiffSha256,
      untrackedFileCount: untrackedPaths.length,
      untrackedContentByteLength,
      untrackedManifestSha256: untrackedManifestHash.digest("hex"),
      exclusions: [...fingerprintExclusions],
    },
  };
}

function runGit(repoRoot, args, options) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: options.encoding,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8")
      : result.stderr;
    throw new Error(
      `git ${args.join(" ")} failed with exit code ${result.status}: ${stderr}`,
    );
  }

  return result.stdout;
}

function parseNullSeparatedPaths(buffer) {
  return buffer
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((value) => value.replaceAll("\\", "/"));
}

function comparePaths(left, right) {
  return Buffer.from(left, "utf8").compare(Buffer.from(right, "utf8"));
}

function resolveRepositoryPath(repoRoot, relativePath) {
  const absolutePath = path.resolve(repoRoot, ...relativePath.split("/"));
  const relative = path.relative(repoRoot, absolutePath);

  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Git returned a path outside the repository: ${relativePath}`);
  }

  return absolutePath;
}

function updateFramedHash(hash, label, content) {
  const labelBuffer = Buffer.from(label, "utf8");
  const lengthBuffer = Buffer.allocUnsafe(16);

  lengthBuffer.writeBigUInt64BE(BigInt(labelBuffer.byteLength), 0);
  lengthBuffer.writeBigUInt64BE(BigInt(content.byteLength), 8);
  hash.update(lengthBuffer);
  hash.update(labelBuffer);
  hash.update(content);
}

function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function readNullableEnvironmentValue(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function validateUtcTimestamp(value, valuePath, failures) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    failures.push(`${valuePath} must be a valid UTC ISO-8601 timestamp.`);
    return;
  }

  const timestamp = Date.parse(value);

  if (timestamp < earliestPlausibleGeneratedAt) {
    failures.push(`${valuePath} must not be earlier than 2020-01-01T00:00:00.000Z.`);
  }

  if (timestamp > Date.now() + generatedAtFutureToleranceMilliseconds) {
    failures.push(`${valuePath} must not be more than 5 minutes in the future.`);
  }
}

function validateGitEvidence(git, valuePath, failures) {
  if (!isRecord(git)) {
    failures.push(`${valuePath} must be an object.`);
    return;
  }

  if (typeof git.headSha !== "string" || !/^[0-9a-f]{40,64}$/.test(git.headSha)) {
    failures.push(`${valuePath}.headSha must be a lowercase Git object ID.`);
  }

  if (git.worktreeState !== "clean" && git.worktreeState !== "dirty") {
    failures.push(`${valuePath}.worktreeState must be "clean" or "dirty".`);
  }

  validateFingerprint(git.fingerprint, `${valuePath}.fingerprint`, failures);
}

function validateFingerprint(fingerprint, valuePath, failures) {
  if (!isRecord(fingerprint)) {
    failures.push(`${valuePath} must be an object.`);
    return;
  }

  if (fingerprint.algorithm !== "sha256") {
    failures.push(`${valuePath}.algorithm must be "sha256".`);
  }

  validateSha256(fingerprint.value, `${valuePath}.value`, failures);
  validateNonNegativeInteger(
    fingerprint.trackedDiffByteLength,
    `${valuePath}.trackedDiffByteLength`,
    failures,
  );
  validateSha256(
    fingerprint.trackedDiffSha256,
    `${valuePath}.trackedDiffSha256`,
    failures,
  );

  validateNonNegativeInteger(
    fingerprint.untrackedFileCount,
    `${valuePath}.untrackedFileCount`,
    failures,
  );
  validateNonNegativeInteger(
    fingerprint.untrackedContentByteLength,
    `${valuePath}.untrackedContentByteLength`,
    failures,
  );
  validateSha256(
    fingerprint.untrackedManifestSha256,
    `${valuePath}.untrackedManifestSha256`,
    failures,
  );

  if (
    !Array.isArray(fingerprint.exclusions) ||
    fingerprint.exclusions.length !== fingerprintExclusions.length ||
    fingerprint.exclusions.some(
      (value, index) => value !== fingerprintExclusions[index],
    )
  ) {
    failures.push(
      `${valuePath}.exclusions must be ${JSON.stringify(fingerprintExclusions)}.`,
    );
  }
}

function validateRuntimeEvidence(runtime, valuePath, failures) {
  if (!isRecord(runtime)) {
    failures.push(`${valuePath} must be an object.`);
    return;
  }

  validateNonEmptyString(runtime.nodeVersion, `${valuePath}.nodeVersion`, failures);
  if (
    typeof runtime.nodeVersion === "string" &&
    !/^v\d+\.\d+\.\d+/.test(runtime.nodeVersion)
  ) {
    failures.push(`${valuePath}.nodeVersion must be a Node.js version.`);
  }
  validateNonEmptyString(runtime.platform, `${valuePath}.platform`, failures);
  validateNonEmptyString(runtime.architecture, `${valuePath}.architecture`, failures);

  if (!isRecord(runtime.npm)) {
    failures.push(`${valuePath}.npm must be an object.`);
    return;
  }

  for (const field of [
    "lifecycleEvent",
    "lifecycleScript",
    "packageName",
    "packageVersion",
    "userAgent",
  ]) {
    const value = runtime.npm[field];

    if (value !== null && (typeof value !== "string" || value.length === 0)) {
      failures.push(`${valuePath}.npm.${field} must be a non-empty string or null.`);
    }
  }
}

function validateSha256(value, valuePath, failures) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    failures.push(`${valuePath} must be a lowercase SHA-256 digest.`);
  }
}

function validateNonNegativeInteger(value, valuePath, failures) {
  if (!Number.isSafeInteger(value) || value < 0) {
    failures.push(`${valuePath} must be a non-negative safe integer.`);
  }
}

function validateNonEmptyString(value, valuePath, failures) {
  if (typeof value !== "string" || value.length === 0) {
    failures.push(`${valuePath} must be a non-empty string.`);
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;

if (invokedPath === fileURLToPath(import.meta.url)) {
  const evidence = await createRunEvidence();
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
