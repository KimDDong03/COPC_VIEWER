import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LIVE_COPC_SAMPLE_URLS } from "../config/live-copc-sources.mjs";
import { classifyLiveCopcExecutionFailure } from "./live-copc-range-check.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const benchmarkRoot = path.join(repoRoot, "output", "smoothness-benchmark");
const sessionRoot = path.join(benchmarkRoot, "regression-sessions");
const rawBenchmarkPath = path.join(
  benchmarkRoot,
  "smoothness-warm-zoom-detail.json",
);
const rawAssertionPath = path.join(
  benchmarkRoot,
  "smoothness-warm-zoom-detail-assertion.json",
);
const bundleOutputPath =
  readPathArg("--output") ??
  path.join(benchmarkRoot, "smoothness-regression-sessions.json");
const baselinePath =
  readPathArg("--baseline") ??
  path.join(
    repoRoot,
    "benchmarks",
    "baselines",
    "smoothness-warm-zoom-detail-rtx3060.json",
  );
const regressionOutputPath = path.join(
  benchmarkRoot,
  "smoothness-regression.json",
);
const liveRangeEvidencePath = path.join(
  benchmarkRoot,
  "smoothness-regression-live-range.json",
);
const runStatusPath = path.join(
  benchmarkRoot,
  "smoothness-regression-run-status.json",
);
const liveSourceUrl = LIVE_COPC_SAMPLE_URLS.millsiteReservoir;
const liveRangeOnly = process.argv.includes("--live-range-only");
const createBaselineCandidate = process.argv.includes(
  "--create-baseline-candidate",
);
const installBaselineCandidatePath = readPathArg(
  "--install-baseline-candidate",
);
const confirmReviewedBaseline = process.argv.includes(
  "--confirm-reviewed-baseline",
);
const sessionCount = readSessionCount();
const profileContractFields = [
  "profile",
  "repeatCount",
  "warmupRunCount",
  "warmupSettleTimeoutMilliseconds",
  "prefetchWaitTimeoutMilliseconds",
  "waitForFinalDetail",
  "finalDetailTimeoutMilliseconds",
  "interactiveTimeoutMilliseconds",
  "durationMilliseconds",
  "cameraSteps",
  "moveMeters",
  "cameraHeightAboveCloudMeters",
  "cacheResetMode",
  "requestedPointRenderer",
  "pointRenderer",
  "maxPointCountPerNode",
];

if (process.argv.includes("--approve-baseline")) {
  throw new Error(
    "--approve-baseline was replaced by --create-baseline-candidate followed by --install-baseline-candidate <path> --confirm-reviewed-baseline.",
  );
}

if (installBaselineCandidatePath) {
  installReviewedBaselineCandidate(installBaselineCandidatePath);
  process.exit(0);
}

if (sessionCount < 3 || sessionCount % 2 === 0) {
  throw new Error("Smoothness regression session count must be an odd integer of at least 3.");
}

if (createBaselineCandidate && sessionCount < 5) {
  throw new Error("Baseline candidates require at least 5 independent sessions.");
}

mkdirSync(benchmarkRoot, { recursive: true });
const preflightResult = runNodeScriptCapture("scripts/live-copc-range-qc.mjs", [
  "--source",
  `millsite-reservoir=${liveSourceUrl}`,
  "--output",
  liveRangeEvidencePath,
]);

if (preflightResult.status !== 0) {
  const classification =
    preflightResult.status === 2
      ? "external-source-unavailable"
      : "live-source-contract-failure";
  finishClassifiedFailure({
    classification,
    stage: "live-range-preflight",
    exitCode: preflightResult.status === 2 ? 2 : 1,
    detail:
      classification === "external-source-unavailable"
        ? "The Millsite live source or network was unavailable before performance capture. No code-regression verdict was produced."
        : "The Millsite live source did not satisfy the strict HTTP 206/COPC source contract.",
  });
}

if (liveRangeOnly) {
  writeRunStatus({
    status: "passed",
    classification: "live-range-verified",
    stage: "live-range-preflight",
  });
  console.log("Live Millsite HTTP Range evidence passed; performance sessions were not requested.");
  process.exit(0);
}

rmSync(sessionRoot, { force: true, recursive: true });
mkdirSync(sessionRoot, { recursive: true });

const captures = [];

for (let sessionIndex = 1; sessionIndex <= sessionCount; sessionIndex += 1) {
  console.log(`\n== Warm smoothness regression session ${sessionIndex}/${sessionCount} ==`);
  const sessionResult = runNodeScriptCapture("scripts/smoothness-qc.mjs", [
    "--warm-zoom-detail",
  ]);

  if (sessionResult.status !== 0) {
    const classification = classifyLiveCopcExecutionFailure(
      sessionResult.output,
    );
    finishClassifiedFailure({
      classification,
      stage: "warm-performance-session",
      sessionIndex,
      exitCode: classification === "external-source-unavailable" ? 2 : 1,
      detail:
        classification === "external-source-unavailable"
          ? `The external Millsite source became unavailable during session ${sessionIndex}; no performance-regression verdict was produced.`
          : classification === "performance-regression"
            ? `Warm performance session ${sessionIndex} failed its unchanged absolute assertions.`
            : `Warm performance session ${sessionIndex} failed before a valid assertion report was produced.`,
    });
  }

  let rawReport;
  let assertionReport;

  try {
    rawReport = readJson(rawBenchmarkPath);
    assertionReport = readJson(rawAssertionPath);
    validateCapture(rawReport, assertionReport, captures[0], sessionIndex);
  } catch (error) {
    finishClassifiedFailure({
      classification: "benchmark-execution-failure",
      stage: "session-evidence-validation",
      sessionIndex,
      exitCode: 1,
      detail: `Warm performance session ${sessionIndex} produced invalid evidence: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  const sessionStem = `smoothness-warm-zoom-detail-session-${sessionIndex}`;
  const sessionRawPath = path.join(sessionRoot, `${sessionStem}.json`);
  const sessionAssertionPath = path.join(
    sessionRoot,
    `${sessionStem}-assertion.json`,
  );
  copyFileSync(rawBenchmarkPath, sessionRawPath);
  copyFileSync(rawAssertionPath, sessionAssertionPath);
  captures.push({ rawReport, assertionReport });
}

const bundle = createSessionBundle(captures);
mkdirSync(path.dirname(bundleOutputPath), { recursive: true });
writeFileSync(bundleOutputPath, `${JSON.stringify(bundle, null, 2)}\n`);

if (createBaselineCandidate) {
  const approvedBaseline = {
    ...bundle,
    approval: {
      ...pickProfileContract(bundle),
      approvedOn: new Date().toISOString().slice(0, 10),
      sourceBenchmark:
        "scripts/smoothness-regression-qc.mjs --create-baseline-candidate",
      sessionCount,
      minimumCurrentSessionCount: 3,
      aggregation: "median-of-session-group-summaries",
    },
  };
  const candidateBaselinePath = path.join(
    sessionRoot,
    "smoothness-baseline-candidate.json",
  );
  const candidateSelfCheckPath = path.join(
    sessionRoot,
    "smoothness-baseline-candidate-self-check.json",
  );
  writeFileSync(
    candidateBaselinePath,
    `${JSON.stringify(approvedBaseline, null, 2)}\n`,
  );
  runNodeScript("scripts/assert-smoothness-regression.mjs", [
    "--input",
    bundleOutputPath,
    "--baseline",
    candidateBaselinePath,
    "--output",
    candidateSelfCheckPath,
  ]);
  console.log(
    [
      `Created ${sessionCount}-session smoothness baseline candidate: ${candidateBaselinePath}`,
      "Review the five raw/assertion session artifacts and the candidate metrics before installation.",
      `Install only after review: node scripts/smoothness-regression-qc.mjs --install-baseline-candidate "${candidateBaselinePath}" --confirm-reviewed-baseline`,
    ].join("\n"),
  );
} else {
  const regressionResult = runNodeScriptCapture(
    "scripts/assert-smoothness-regression.mjs",
    [
      "--input",
      bundleOutputPath,
      "--baseline",
      baselinePath,
      "--output",
      regressionOutputPath,
    ],
  );

  if (regressionResult.status !== 0) {
    finishClassifiedFailure({
      classification: "performance-regression",
      stage: "relative-performance-assertion",
      exitCode: 1,
      detail:
        "The fresh-session bundle failed the unchanged same-device relative performance assertions.",
    });
  }
}

writeRunStatus({
  status: "passed",
  classification: createBaselineCandidate
    ? "baseline-candidate-captured"
    : "performance-regression-passed",
  stage: createBaselineCandidate
    ? "baseline-candidate-self-check"
    : "relative-performance-assertion",
  sessionCount,
});

console.log(
  `Captured ${sessionCount} fresh-browser smoothness session(s): ${bundleOutputPath}`,
);

function createSessionBundle(sessionCaptures) {
  const firstRawReport = sessionCaptures[0].rawReport;

  return {
    schemaVersion: 2,
    ...pickProfileContract(firstRawReport),
    sessionAggregation: "median-of-session-group-summaries",
    browserGraphics: firstRawReport.browserGraphics,
    browserEnvironment: firstRawReport.browserEnvironment,
    absoluteThresholds: sessionCaptures[0].assertionReport.thresholds,
    capture: {
      generatedAt: new Date().toISOString(),
      sessionCount: sessionCaptures.length,
      sessionLifecycle: "fresh-browser",
    },
    sessions: sessionCaptures.map(({ assertionReport }, index) => ({
      sessionIndex: index + 1,
      sessionLifecycle: "fresh-browser",
      browserGraphics: assertionReport.browserGraphics,
      browserEnvironment: assertionReport.browserEnvironment,
      absoluteThresholds: assertionReport.thresholds,
      sourceRunEvidence: assertionReport.sourceRunEvidence,
      checkedResults: assertionReport.checkedResults,
    })),
  };
}

function installReviewedBaselineCandidate(candidatePath) {
  if (!confirmReviewedBaseline) {
    throw new Error(
      "Installing a baseline candidate requires --confirm-reviewed-baseline after reviewing its session artifacts and metrics.",
    );
  }

  if (path.resolve(candidatePath) === path.resolve(baselinePath)) {
    throw new Error("Baseline candidate path must differ from the versioned baseline path.");
  }

  const candidate = readJson(candidatePath);
  validateBaselineCandidateForInstallation(candidate);
  mkdirSync(sessionRoot, { recursive: true });
  const installSelfCheckPath = path.join(
    sessionRoot,
    "smoothness-baseline-install-self-check.json",
  );
  runNodeScript("scripts/assert-smoothness-regression.mjs", [
    "--input",
    candidatePath,
    "--baseline",
    candidatePath,
    "--output",
    installSelfCheckPath,
  ]);
  mkdirSync(path.dirname(baselinePath), { recursive: true });
  copyFileSync(candidatePath, baselinePath);
  console.log(`Installed reviewed smoothness baseline: ${baselinePath}`);
}

function validateBaselineCandidateForInstallation(candidate) {
  if (candidate?.schemaVersion !== 2) {
    throw new Error("Baseline candidate schemaVersion must be 2.");
  }

  const approval = candidate.approval;

  if (!approval || typeof approval !== "object" || Array.isArray(approval)) {
    throw new Error("Baseline candidate must contain an approval object.");
  }

  if (
    approval.sourceBenchmark !==
    "scripts/smoothness-regression-qc.mjs --create-baseline-candidate"
  ) {
    throw new Error(
      "Baseline candidate approval.sourceBenchmark does not identify the candidate capture flow.",
    );
  }

  if (
    !Number.isInteger(approval.sessionCount) ||
    approval.sessionCount < 5 ||
    approval.sessionCount % 2 === 0
  ) {
    throw new Error(
      "Baseline candidate approval.sessionCount must be an odd integer of at least 5.",
    );
  }

  if (
    !Array.isArray(candidate.sessions) ||
    candidate.sessions.length !== approval.sessionCount
  ) {
    throw new Error(
      "Baseline candidate sessions must match approval.sessionCount exactly.",
    );
  }

  if (approval.minimumCurrentSessionCount !== 3) {
    throw new Error(
      "Baseline candidate approval.minimumCurrentSessionCount must be 3.",
    );
  }

  if (
    approval.aggregation !== "median-of-session-group-summaries" ||
    candidate.sessionAggregation !== "median-of-session-group-summaries"
  ) {
    throw new Error(
      "Baseline candidate must use median-of-session-group-summaries aggregation.",
    );
  }

  if (
    !candidate.absoluteThresholds ||
    typeof candidate.absoluteThresholds !== "object" ||
    Array.isArray(candidate.absoluteThresholds)
  ) {
    throw new Error(
      "Baseline candidate must contain an absoluteThresholds snapshot.",
    );
  }

  if (
    candidate.capture?.sessionCount !== approval.sessionCount ||
    candidate.capture?.sessionLifecycle !== "fresh-browser"
  ) {
    throw new Error(
      "Baseline candidate capture metadata must match the approved fresh-browser session count.",
    );
  }

  if (
    typeof approval.approvedOn !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(approval.approvedOn) ||
    !isCalendarDate(approval.approvedOn)
  ) {
    throw new Error(
      "Baseline candidate approval.approvedOn must be an ISO date.",
    );
  }
}

function isCalendarDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function validateCapture(rawReport, assertionReport, firstCapture, sessionIndex) {
  if (rawReport?.profile !== "warm-zoom-detail") {
    throw new Error(
      `Session ${sessionIndex} did not produce the warm-zoom-detail profile.`,
    );
  }

  if (
    assertionReport?.failureCount !== 0 ||
    !Array.isArray(assertionReport.checkedResults) ||
    assertionReport.checkedResults.length === 0 ||
    !assertionReport.thresholds ||
    typeof assertionReport.thresholds !== "object" ||
    Array.isArray(assertionReport.thresholds)
  ) {
    throw new Error(
      `Session ${sessionIndex} does not contain a passing absolute assertion report.`,
    );
  }

  if (
    JSON.stringify(rawReport.runEvidence) !==
    JSON.stringify(assertionReport.sourceRunEvidence)
  ) {
    throw new Error(
      `Session ${sessionIndex} raw and assertion run evidence do not match.`,
    );
  }

  if (!firstCapture) {
    return;
  }

  if (
    JSON.stringify(assertionReport.thresholds) !==
    JSON.stringify(firstCapture.assertionReport.thresholds)
  ) {
    throw new Error(
      `Session ${sessionIndex} absolute assertion thresholds changed between captures.`,
    );
  }

  for (const field of profileContractFields) {
    if (!Object.is(rawReport[field], firstCapture.rawReport[field])) {
      throw new Error(
        `Session ${sessionIndex} profile field ${field} changed between captures.`,
      );
    }
  }

  for (const field of ["vendor", "renderer", "version"]) {
    if (
      rawReport.browserGraphics?.[field] !==
      firstCapture.rawReport.browserGraphics?.[field]
    ) {
      throw new Error(
        `Session ${sessionIndex} WebGL ${field} changed between captures.`,
      );
    }
  }

  if (
    rawReport.browserEnvironment?.version !==
      firstCapture.rawReport.browserEnvironment?.version ||
    rawReport.browserEnvironment?.userAgent !==
      firstCapture.rawReport.browserEnvironment?.userAgent
  ) {
    throw new Error(
      `Session ${sessionIndex} browser environment changed between captures.`,
    );
  }

  if (
    rawReport.runEvidence?.git?.headSha !==
      firstCapture.rawReport.runEvidence?.git?.headSha ||
    rawReport.runEvidence?.git?.fingerprint?.value !==
      firstCapture.rawReport.runEvidence?.git?.fingerprint?.value
  ) {
    throw new Error(
      `Session ${sessionIndex} Git HEAD or source fingerprint changed between captures.`,
    );
  }
}

function pickProfileContract(report) {
  return Object.fromEntries(
    profileContractFields.map((field) => [field, report[field]]),
  );
}

function readSessionCount() {
  const rawValue =
    readStringArg("--session-count") ??
    process.env.COPC_SMOOTHNESS_REGRESSION_SESSION_COUNT ??
    "3";
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("--session-count must be a positive integer.");
  }

  return value;
}

function readPathArg(name) {
  const value = readStringArg(name);
  return value === undefined ? undefined : path.resolve(repoRoot, value);
}

function readStringArg(name) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  const value = process.argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function runNodeScript(relativeScriptPath, args = []) {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, relativeScriptPath), ...args],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${relativeScriptPath} failed with exit code ${result.status}.`,
    );
  }
}

function runNodeScriptCapture(relativeScriptPath, args = []) {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, relativeScriptPath), ...args],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  process.stdout.write(stdout);
  process.stderr.write(stderr);

  if (result.error) {
    throw result.error;
  }

  return {
    status: result.status ?? 1,
    output: `${stdout}\n${stderr}`,
  };
}

function finishClassifiedFailure({
  classification,
  stage,
  exitCode,
  detail,
  sessionIndex,
}) {
  const status =
    classification === "external-source-unavailable" ? "unavailable" : "failed";
  writeRunStatus({
    status,
    classification,
    stage,
    detail,
    sessionIndex,
  });
  console.error(
    [
      `Smoothness regression ${status}: ${classification}.`,
      detail,
      `Classification evidence: ${runStatusPath}`,
    ].join("\n"),
  );
  process.exit(exitCode);
}

function writeRunStatus(fields) {
  mkdirSync(path.dirname(runStatusPath), { recursive: true });
  writeFileSync(
    runStatusPath,
    `${JSON.stringify(
      {
        schema: "copc-viewer.smoothness-regression-run-status",
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        liveSource: {
          id: "millsite-reservoir",
          url: liveSourceUrl,
          rangeEvidencePath: liveRangeEvidencePath,
        },
        ...fields,
      },
      null,
      2,
    )}\n`,
  );
}
