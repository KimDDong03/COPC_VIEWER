import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const assertionScriptPath = path.join(
  scriptDir,
  "assert-smoothness-regression.mjs",
);
const browserGraphics = {
  vendor: "Test GPU Vendor",
  renderer: "Test GPU Renderer",
  version: "WebGL 2.0 Test",
};
const browserEnvironment = {
  userAgent: "Mozilla/5.0 Chrome/141.0.7390.76 Safari/537.36",
  version: "141.0.7390.76",
};
const profileContract = {
  profile: "warm-zoom-detail",
  repeatCount: 2,
  warmupRunCount: 1,
  warmupSettleTimeoutMilliseconds: 30_000,
  prefetchWaitTimeoutMilliseconds: 5_000,
  waitForFinalDetail: true,
  finalDetailTimeoutMilliseconds: 120_000,
  interactiveTimeoutMilliseconds: 120_000,
  durationMilliseconds: 1_200,
  cameraSteps: 12,
  moveMeters: 10,
  cameraHeightAboveCloudMeters: 550,
  cacheResetMode: "none",
  requestedPointRenderer: "typed",
  pointRenderer: "Primitive typed arrays",
  maxPointCountPerNode: 360_000,
};
const absoluteThresholds = {
  minAverageFps: 30,
  maxP95FrameMilliseconds: 67,
  maxFrameMilliseconds: 100,
  maxCameraStreamFirstResponseMilliseconds: 250,
  maxCameraStreamFinalDetailMilliseconds: 8_000,
  maxAverageGeometryQueueMilliseconds: 500,
};

test("accepts an exact profile, graphics, group, and run contract", async () => {
  const baseline = createBaseline([createRuns("sample-a", 360_000)]);
  const current = createCurrent([createRuns("sample-a", 360_000)]);
  const result = await runAssertion(current, baseline);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.report.failures, []);
  assert.equal(result.report.comparedGroupCount, 1);
});

test("rejects a missing required metric instead of substituting zero", async () => {
  const baseline = createBaseline([createRuns("sample-a", 360_000)]);
  const currentRuns = createRuns("sample-a", 360_000);

  delete currentRuns[0].averageFps;

  const result = await runAssertion(createCurrent([currentRuns]), baseline);

  assert.equal(result.status, 1);
  assert.match(
    result.report.failures.join("\n"),
    /currentReports\[0\]\.checkedResults\[0\]\.averageFps must be a finite number/,
  );
});

test("rejects invalid performance metric ranges", async () => {
  const baseline = createBaseline([createRuns("sample-a", 360_000)]);
  const currentRuns = createRuns("sample-a", 360_000);
  currentRuns[0].averageFps = 0;
  currentRuns[0].renderedFinalNodeCoverageRatio = 1.1;
  currentRuns[0].framesOver50Milliseconds = 0.5;
  currentRuns[0].cameraStreamTotalMilliseconds = -1;
  currentRuns[0].averageGeometryQueueMilliseconds = -1;

  const result = await runAssertion(createCurrent([currentRuns]), baseline);
  const failures = result.report.failures.join("\n");

  assert.equal(result.status, 1);
  assert.match(failures, /averageFps must be positive/);
  assert.match(
    failures,
    /renderedFinalNodeCoverageRatio must be between 0 and 1/,
  );
  assert.match(failures, /framesOver50Milliseconds must be a non-negative integer/);
  assert.match(failures, /cameraStreamTotalMilliseconds must be non-negative/);
  assert.match(failures, /averageGeometryQueueMilliseconds must be non-negative/);
});

test("rejects both missing and unexpected sample-budget groups", async () => {
  const baseline = createBaseline([
    createRuns("sample-a", 360_000),
    createRuns("sample-b", 180_000),
  ]);
  const current = createCurrent([
    createRuns("sample-b", 180_000),
    createRuns("sample-c", 90_000),
  ]);
  const result = await runAssertion(current, baseline);
  const failures = result.report.failures.join("\n");

  assert.equal(result.status, 1);
  assert.match(failures, /sample-a:budget=360000: missing current benchmark group/);
  assert.match(
    failures,
    /sample-c:budget=90000: unexpected current benchmark group/,
  );
});

test("rejects wrong run counts and duplicate run indices", async () => {
  const baseline = createBaseline([
    createRuns("sample-a", 360_000),
    createRuns("sample-b", 180_000),
  ]);
  const shortGroup = createRuns("sample-a", 360_000).slice(0, 1);
  const duplicateIndexGroup = createRuns("sample-b", 180_000, [1, 1]);
  const result = await runAssertion(
    createCurrent([shortGroup, duplicateIndexGroup]),
    baseline,
  );
  const failures = result.report.failures.join("\n");

  assert.equal(result.status, 1);
  assert.match(
    failures,
    /current session 1: sample-a:budget=360000: session has 1 run\(s\); expected 2/,
  );
  assert.match(
    failures,
    /sample-b:budget=180000: session runIndex values must be unique/,
  );
  assert.match(
    failures,
    /sample-b:budget=180000: session runIndex set must be \[1, 2\]/,
  );
});

test("rejects available profile and browser graphics mismatches", async () => {
  const baseline = createBaseline([createRuns("sample-a", 360_000)]);
  const current = createCurrent([createRuns("sample-a", 360_000)]);

  current.cacheResetMode = "cold";
  current.prefetchWaitTimeoutMilliseconds = 6_000;
  current.browserGraphics.version = "WebGL 1.0 Test";
  current.browserEnvironment.version = "142.0.0.0";
  delete current.pointRenderer;

  const result = await runAssertion(current, baseline);
  const failures = result.report.failures.join("\n");

  assert.equal(result.status, 1);
  assert.match(
    failures,
    /Benchmark profile contract cacheResetMode changed from "none" to "cold"/,
  );
  assert.match(
    failures,
    /Benchmark profile contract prefetchWaitTimeoutMilliseconds changed from 5000 to 6000/,
  );
  assert.match(failures, /Browser WebGL version changed/);
  assert.match(failures, /Browser environment version changed/);
  assert.match(
    failures,
    /Benchmark profile contract pointRenderer is missing from current/,
  );
});

test("rejects missing baseline source evidence and malformed current browser evidence", async () => {
  const baseline = createBaseline([createRuns("sample-a", 360_000)]);
  const current = createCurrent([createRuns("sample-a", 360_000)]);

  delete baseline.sourceRunEvidence;
  current.browserEnvironment.version = "latest";

  const result = await runAssertion(current, baseline);
  const failures = result.report.failures.join("\n");

  assert.equal(result.status, 1);
  assert.match(
    failures,
    /baseline\.sessions\[0\]\.sourceRunEvidence must be an object/,
  );
  assert.match(
    failures,
    /currentReports\[0\]\.browserEnvironment\.version must be a browser version string/,
  );
});

test("uses independent-session medians and keeps geometry queue relative values informational", async () => {
  const baseline = createBaselineBundle(
    Array.from({ length: 5 }, () => [createRuns("sample-a", 360_000)]),
  );
  const outlierRuns = createRuns("sample-a", 360_000).map((run) => ({
    ...run,
    maxFrameMilliseconds: 80,
    cameraStreamTotalMilliseconds: 2_000,
    cameraStreamFirstResponseMilliseconds: 100,
    averageGeometryQueueMilliseconds: 1_000,
  }));
  const current = createCurrentBundle([
    [outlierRuns],
    [createRuns("sample-a", 360_000)],
    [createRuns("sample-a", 360_000)],
  ]);
  const result = await runAssertion(current, baseline);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.currentSessionCount, 3);
  assert.equal(result.report.baselineSessionCount, 5);
  assert.deepEqual(result.report.informationalMetrics, [
    "averageGeometryQueueMilliseconds",
  ]);
  assert.equal(
    result.report.comparisons[0].current.averageGeometryQueueMilliseconds,
    2,
  );
  assert.equal(result.report.comparisons[0].current.sessionSummaries.length, 3);
});

test("uses hybrid timing deltas without disabling ratio-based failures", async () => {
  const baseline = createBaseline([createRuns("sample-a", 360_000)]);
  const jitterRuns = createRuns("sample-a", 360_000).map((run) => ({
    ...run,
    maxFrameMilliseconds: 36,
    cameraStreamTotalMilliseconds: 1_190,
    cameraStreamFirstResponseMilliseconds: 19,
    averageGeometryQueueMilliseconds: 80,
  }));
  const accepted = await runAssertion(
    createCurrent([jitterRuns]),
    baseline,
  );

  assert.equal(accepted.status, 0, accepted.stderr);

  const regressedRuns = jitterRuns.map((run) => ({
    ...run,
    maxFrameMilliseconds: 38,
    cameraStreamTotalMilliseconds: 1_210,
    cameraStreamFirstResponseMilliseconds: 21,
  }));
  const rejected = await runAssertion(
    createCurrent([regressedRuns]),
    baseline,
  );
  const failures = rejected.report.failures.join("\n");

  assert.equal(rejected.status, 1);
  assert.match(failures, /max frame 38 exceeds allowed 37/);
  assert.match(failures, /camera stream total 1,210 exceeds allowed 1,200/);
  assert.match(failures, /camera stream first response 21 exceeds allowed 20/);
});

test("uses baseline MAD to absorb measured independent-session stream variance", async () => {
  const baselineTotals = [600, 800, 1_000, 1_200, 1_400];
  const baseline = createBaselineBundle(
    baselineTotals.map((total) => [
      createRuns("sample-a", 360_000).map((run) => ({
        ...run,
        cameraStreamTotalMilliseconds: total,
      })),
    ]),
  );
  const accepted = createCurrentBundle(
    [1_450, 1_500, 1_550].map((total) => [
      createRuns("sample-a", 360_000).map((run) => ({
        ...run,
        cameraStreamTotalMilliseconds: total,
      })),
    ]),
  );
  const acceptedResult = await runAssertion(accepted, baseline);

  assert.equal(acceptedResult.status, 0, acceptedResult.stderr);
  assert.equal(
    acceptedResult.report.comparisons[0].baseline.cameraStreamTotalMadMilliseconds,
    200,
  );

  const rejected = createCurrentBundle(
    [1_550, 1_600, 1_650].map((total) => [
      createRuns("sample-a", 360_000).map((run) => ({
        ...run,
        cameraStreamTotalMilliseconds: total,
      })),
    ]),
  );
  const rejectedResult = await runAssertion(rejected, baseline);

  assert.equal(rejectedResult.status, 1);
  assert.match(
    rejectedResult.report.failures.join("\n"),
    /camera stream total 1,600 exceeds allowed 1,593\.04/,
  );
});

test("rejects independent sessions captured with different absolute gates", async () => {
  const baseline = createBaselineBundle(
    Array.from({ length: 5 }, () => [createRuns("sample-a", 360_000)]),
  );
  const current = createCurrentBundle(
    Array.from({ length: 3 }, () => [createRuns("sample-a", 360_000)]),
  );
  current.absoluteThresholds.maxFrameMilliseconds = 101;

  for (const session of current.sessions) {
    session.absoluteThresholds.maxFrameMilliseconds = 101;
  }

  const result = await runAssertion(current, baseline);

  assert.equal(result.status, 1);
  assert.match(
    result.report.failures.join("\n"),
    /absolute smoothness thresholds are not comparable/,
  );
});

test("rejects non-independent or undersized session sets", async () => {
  const baseline = createBaselineBundle(
    Array.from({ length: 5 }, () => [createRuns("sample-a", 360_000)]),
  );
  const current = createCurrentBundle([
    [createRuns("sample-a", 360_000)],
    [createRuns("sample-a", 360_000)],
  ]);
  current.sessions[1].sessionIndex = 1;
  current.sessions[1].sessionLifecycle = "reused-browser";
  current.sessions[1].browserGraphics.renderer = "Unexpected GPU";
  current.sessions[1].browserEnvironment.version = "150.0.0.0";
  current.sessions[1].absoluteThresholds.maxFrameMilliseconds = 101;
  current.sessions[1].sourceRunEvidence.generatedAt =
    current.sessions[0].sourceRunEvidence.generatedAt;
  current.sessions[1].sourceRunEvidence.git.headSha = "f".repeat(40);
  const result = await runAssertion(current, baseline);
  const failures = result.report.failures.join("\n");

  assert.equal(result.status, 1);
  assert.match(failures, /requires at least 3/);
  assert.match(failures, /session count must be odd/);
  assert.match(failures, /sessionIndex values must be \[1, 2\]/);
  assert.match(failures, /sessionLifecycle must be "fresh-browser"/);
  assert.match(failures, /unique run-evidence timestamps/);
  assert.match(failures, /identical Git HEAD and source fingerprint/);
  assert.match(failures, /browserGraphics\.renderer must match/);
  assert.match(failures, /browserEnvironment\.version must match/);
  assert.match(failures, /absoluteThresholds must match/);
});

function createBaseline(runGroups) {
  return {
    schemaVersion: 1,
    approval: {
      ...profileContract,
    },
    browserGraphics: { ...browserGraphics },
    browserEnvironment: { ...browserEnvironment },
    sourceRunEvidence: createRunEvidence(),
    checkedResults: runGroups.flat(),
  };
}

function createCurrent(runGroups) {
  return {
    ...profileContract,
    browserGraphics: { ...browserGraphics },
    browserEnvironment: { ...browserEnvironment },
    runEvidence: createRunEvidence(),
    checkedResults: runGroups.flat(),
  };
}

function createBaselineBundle(sessionRunGroups) {
  const baseline = createBaseline([]);
  delete baseline.sourceRunEvidence;
  delete baseline.checkedResults;
  baseline.schemaVersion = 2;
  baseline.approval = {
    ...baseline.approval,
    sessionCount: sessionRunGroups.length,
    minimumCurrentSessionCount: 3,
    aggregation: "median-of-session-group-summaries",
  };
  baseline.sessionAggregation = "median-of-session-group-summaries";
  baseline.absoluteThresholds = { ...absoluteThresholds };
  baseline.sessions = sessionRunGroups.map((runGroups, index) =>
    createSession(index, runGroups),
  );
  return baseline;
}

function createCurrentBundle(sessionRunGroups) {
  const current = createCurrent([]);
  delete current.runEvidence;
  delete current.checkedResults;
  current.schemaVersion = 2;
  current.sessionAggregation = "median-of-session-group-summaries";
  current.absoluteThresholds = { ...absoluteThresholds };
  current.sessions = sessionRunGroups.map((runGroups, index) =>
    createSession(index, runGroups),
  );
  return current;
}

function createSession(index, runGroups) {
  return {
    sessionIndex: index + 1,
    sessionLifecycle: "fresh-browser",
    browserGraphics: { ...browserGraphics },
    browserEnvironment: { ...browserEnvironment },
    absoluteThresholds: { ...absoluteThresholds },
    sourceRunEvidence: createRunEvidence(index),
    checkedResults: runGroups.flat(),
  };
}

function createRunEvidence(sessionOffset = 0) {
  return {
    schema: "copc-viewer.run-evidence",
    schemaVersion: 1,
    generatedAt: `2026-07-10T03:04:${String(5 + sessionOffset).padStart(2, "0")}.678Z`,
    git: {
      headSha: "0".repeat(40),
      worktreeState: "dirty",
      fingerprint: {
        algorithm: "sha256",
        value: "1".repeat(64),
        trackedDiffByteLength: 10,
        trackedDiffSha256: "2".repeat(64),
        untrackedFileCount: 0,
        untrackedContentByteLength: 0,
        untrackedManifestSha256: "3".repeat(64),
        exclusions: ["output/**", "benchmarks/baselines/**"],
      },
    },
    runtime: {
      nodeVersion: "v22.17.0",
      platform: "win32",
      architecture: "x64",
      npm: {
        lifecycleEvent: "benchmark:smoothness",
        lifecycleScript: "node scripts/benchmark-smoothness.mjs",
        packageName: "@gaia3d/copc-cesium",
        packageVersion: "0.1.0",
        userAgent: "npm/11.4.2 node/v22.17.0 win32 x64",
      },
    },
  };
}

function createRuns(sampleId, streamPointBudget, runIndices = [1, 2]) {
  return runIndices.map((runIndex) => ({
    sampleId,
    runIndex,
    streamPointBudget,
    renderedPointCount: 100_000 + runIndex,
    renderedFinalNodeCoverageRatio: 0.95,
    renderedFinalNodeWeightCoverageRatio: 0.98,
    averageFps: 60,
    p95FrameMilliseconds: 16.7,
    maxFrameMilliseconds: 17,
    framesOver50Milliseconds: 0,
    cameraStreamTotalMilliseconds: 1_000,
    cameraStreamFirstResponseMilliseconds: 10,
    averageGeometryQueueMilliseconds: 2,
  }));
}

async function runAssertion(current, baseline) {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "copc-smoothness-regression-"),
  );
  const inputPath = path.join(temporaryRoot, "current.json");
  const baselinePath = path.join(temporaryRoot, "baseline.json");
  const outputPath = path.join(temporaryRoot, "regression.json");

  try {
    await Promise.all([
      writeFile(inputPath, `${JSON.stringify(current, null, 2)}\n`),
      writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`),
    ]);

    const env = createCleanRegressionEnvironment();
    const processResult = spawnSync(
      process.execPath,
      [
        assertionScriptPath,
        "--input",
        inputPath,
        "--baseline",
        baselinePath,
        "--output",
        outputPath,
      ],
      {
        encoding: "utf8",
        env,
      },
    );
    const report = JSON.parse(await readFile(outputPath, "utf8"));

    return {
      status: processResult.status,
      stderr: processResult.stderr,
      stdout: processResult.stdout,
      report,
    };
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

function createCleanRegressionEnvironment() {
  const env = { ...process.env };

  for (const name of Object.keys(env)) {
    if (name.startsWith("COPC_SMOOTHNESS_REGRESSION_")) {
      delete env[name];
    }
  }

  env.COPC_SMOOTHNESS_REGRESSION_REQUIRE_SAME_GPU = "true";

  return env;
}
