import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import {
  validateBrowserEnvironment,
  validateRunEvidence,
} from "./run-evidence.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outputRoot = path.join(repoRoot, "output");
const defaultBenchmarkRoot = path.join(outputRoot, "smoothness-benchmark");
const defaultInputPath = path.join(
  defaultBenchmarkRoot,
  "smoothness-warm-zoom-detail.json",
);
const defaultBaselinePath = path.join(
  repoRoot,
  "benchmarks",
  "baselines",
  "smoothness-warm-zoom-detail-rtx3060.json",
);
const defaultOutputPath = path.join(
  defaultBenchmarkRoot,
  "smoothness-regression.json",
);

const inputPaths = readStringArgs("--input");

if (inputPaths.length === 0) {
  inputPaths.push(defaultInputPath);
}

const baselinePath =
  readStringArg("--baseline") ?? readFirstPositionalArg() ?? defaultBaselinePath;
const outputPath = readStringArg("--output") ?? defaultOutputPath;

const thresholds = {
  minAverageFpsRatio: readNumberEnv(
    "COPC_SMOOTHNESS_REGRESSION_MIN_AVG_FPS_RATIO",
    0.9,
  ),
  maxP95FrameRatio: readNumberEnv(
    "COPC_SMOOTHNESS_REGRESSION_MAX_P95_FRAME_RATIO",
    1.2,
  ),
  maxFrameRatio: readNumberEnv(
    "COPC_SMOOTHNESS_REGRESSION_MAX_FRAME_RATIO",
    1.35,
  ),
  maxFrameAbsoluteDeltaMilliseconds: readNumberEnv(
    "COPC_SMOOTHNESS_REGRESSION_MAX_FRAME_DELTA_MS",
    20,
  ),
  maxFramesOver50Ratio: readNumberEnv(
    "COPC_SMOOTHNESS_REGRESSION_MAX_FRAMES_OVER_50_RATIO",
    1.5,
  ),
  maxCameraStreamTotalRatio: readNumberEnv(
    "COPC_SMOOTHNESS_REGRESSION_MAX_STREAM_TOTAL_RATIO",
    1.2,
  ),
  maxCameraStreamTotalMinimumDeltaMilliseconds: readNumberEnv(
    "COPC_SMOOTHNESS_REGRESSION_MAX_STREAM_TOTAL_MIN_DELTA_MS",
    150,
  ),
  maxCameraStreamTotalRobustSigmaMultiplier: readNumberEnv(
    "COPC_SMOOTHNESS_REGRESSION_MAX_STREAM_TOTAL_ROBUST_SIGMA",
    2,
  ),
  maxCameraStreamFirstResponseRatio: readNumberEnv(
    "COPC_SMOOTHNESS_REGRESSION_MAX_FIRST_RESPONSE_RATIO",
    1.2,
  ),
  maxCameraStreamFirstResponseAbsoluteDeltaMilliseconds: readNumberEnv(
    "COPC_SMOOTHNESS_REGRESSION_MAX_FIRST_RESPONSE_DELTA_MS",
    10,
  ),
  minRenderedPointRatio: readNumberEnv(
    "COPC_SMOOTHNESS_REGRESSION_MIN_RENDERED_POINT_RATIO",
    0.85,
  ),
  maxCoverageDrop: readNumberEnv(
    "COPC_SMOOTHNESS_REGRESSION_MAX_COVERAGE_DROP",
    0.05,
  ),
  requireSameBrowserGraphics: readBooleanEnv(
    "COPC_SMOOTHNESS_REGRESSION_REQUIRE_SAME_GPU",
    true,
  ),
};

const currentReports = await Promise.all(
  inputPaths.map(async (currentInputPath) =>
    JSON.parse(await readFile(currentInputPath, "utf8")),
  ),
);
const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const currentBrowserGraphics = currentReports[0]?.browserGraphics;
const baselineBrowserGraphics = baseline.browserGraphics;
const currentBrowserEnvironment = currentReports[0]?.browserEnvironment;
const baselineBrowserEnvironment = baseline.browserEnvironment;
const currentAbsoluteThresholds = currentReports[0]?.absoluteThresholds;
const baselineAbsoluteThresholds = baseline.absoluteThresholds;
const failures = [];
const comparisons = [];
const dataFailures = [];
const currentSessions = expandReportSessions(
  currentReports,
  "current",
  failures,
);
const baselineSessions = expandReportSessions([baseline], "baseline", failures);
const currentRunEvidence = currentSessions.map(
  ({ report }) => report.runEvidence ?? report.sourceRunEvidence,
);
const baselineSourceRunEvidence = baselineSessions.map(
  ({ report }) => report.runEvidence ?? report.sourceRunEvidence,
);

for (const [index, evidence] of currentRunEvidence.entries()) {
  failures.push(
    ...validateRunEvidence(evidence, `current.sessions[${index}].runEvidence`),
  );
}

for (const [index, evidence] of baselineSourceRunEvidence.entries()) {
  failures.push(
    ...validateRunEvidence(
      evidence,
      `baseline.sessions[${index}].sourceRunEvidence`,
    ),
  );
}

failures.push(
  ...validateBrowserEnvironment(
    baselineBrowserEnvironment,
    "baseline.browserEnvironment",
  ),
);

for (const [index, currentReport] of currentReports.entries()) {
  failures.push(
    ...validateBrowserEnvironment(
      currentReport.browserEnvironment,
      `currentReports[${index}].browserEnvironment`,
    ),
  );
  compareProfileContract(currentReport, baseline, failures);
  compareBrowserGraphics(
    currentReport.browserGraphics,
    baselineBrowserGraphics,
    failures,
  );
  compareBrowserEnvironment(
    currentReport.browserEnvironment,
    baselineBrowserEnvironment,
    failures,
  );
}

function expandReportSessions(reports, collectionLabel, failures) {
  const sessions = [];

  for (const [reportIndex, report] of reports.entries()) {
    if (!report || typeof report !== "object" || Array.isArray(report)) {
      failures.push(`${collectionLabel}Reports[${reportIndex}] must be an object.`);
      continue;
    }

    if (report.sessions === undefined) {
      sessions.push({
        report,
        label: `${collectionLabel}Reports[${reportIndex}]`,
        sessionIndex: reportIndex + 1,
        sessionLifecycle: undefined,
      });
      continue;
    }

    if (!Array.isArray(report.sessions) || report.sessions.length === 0) {
      failures.push(
        `${collectionLabel}Reports[${reportIndex}].sessions must contain at least one session.`,
      );
      continue;
    }

    for (const [sessionOffset, session] of report.sessions.entries()) {
      const label = `${collectionLabel}Reports[${reportIndex}].sessions[${sessionOffset}]`;

      if (!session || typeof session !== "object" || Array.isArray(session)) {
        failures.push(`${label} must be an object.`);
        continue;
      }

      sessions.push({
        report: session,
        label,
        sessionIndex: session.sessionIndex,
        sessionLifecycle: session.sessionLifecycle,
      });
    }
  }

  return sessions;
}

function validateSessionContracts(
  currentSessions,
  baselineSessions,
  baselineReport,
  failures,
) {
  const approvedSessionCount = baselineReport?.approval?.sessionCount;
  const minimumCurrentSessionCount =
    baselineReport?.approval?.minimumCurrentSessionCount;
  const approvedAggregation = baselineReport?.approval?.aggregation;

  if (approvedSessionCount !== undefined) {
    if (!Number.isInteger(approvedSessionCount) || approvedSessionCount < 5) {
      failures.push(
        "baseline.approval.sessionCount must be an integer of at least 5 when provided.",
      );
    } else if (baselineSessions.length !== approvedSessionCount) {
      failures.push(
        `Baseline contains ${baselineSessions.length} session(s); approval requires ${approvedSessionCount}.`,
      );
    }
  }

  if (minimumCurrentSessionCount !== undefined) {
    if (
      !Number.isInteger(minimumCurrentSessionCount) ||
      minimumCurrentSessionCount < 3 ||
      minimumCurrentSessionCount % 2 === 0
    ) {
      failures.push(
        "baseline.approval.minimumCurrentSessionCount must be an odd integer of at least 3 when provided.",
      );
    } else if (currentSessions.length < minimumCurrentSessionCount) {
      failures.push(
        `Current comparison contains ${currentSessions.length} session(s); baseline requires at least ${minimumCurrentSessionCount}.`,
      );
    }
  }

  if (
    approvedAggregation !== undefined &&
    approvedAggregation !== "median-of-session-group-summaries"
  ) {
    failures.push(
      'baseline.approval.aggregation must be "median-of-session-group-summaries".',
    );
  }

  validateIndependentSessionSet("current", currentSessions, failures);
  validateIndependentSessionSet("baseline", baselineSessions, failures);
}

function validateIndependentSessionSet(label, sessions, failures) {
  if (sessions.length <= 1) {
    return;
  }

  if (sessions.length % 2 === 0) {
    failures.push(`${label} session count must be odd for median aggregation.`);
  }

  const expectedIndices = Array.from(
    { length: sessions.length },
    (_, index) => index + 1,
  );
  const observedIndices = sessions.map((session) => session.sessionIndex);

  if (
    observedIndices.some(
      (sessionIndex, index) => sessionIndex !== expectedIndices[index],
    )
  ) {
    failures.push(
      `${label} sessionIndex values must be ${formatRunIndices(expectedIndices)}; received ${formatRunIndices(observedIndices)}.`,
    );
  }

  for (const [index, session] of sessions.entries()) {
    if (session.sessionLifecycle !== "fresh-browser") {
      failures.push(
        `${label}.sessions[${index}].sessionLifecycle must be "fresh-browser" for independent-session aggregation.`,
      );
    }
  }

  const evidence = sessions.map(
    ({ report }) => report.runEvidence ?? report.sourceRunEvidence,
  );
  const generatedAtValues = evidence.map((value) => value?.generatedAt);

  if (new Set(generatedAtValues).size !== generatedAtValues.length) {
    failures.push(`${label} sessions must have unique run-evidence timestamps.`);
  }

  const sourceIdentities = evidence.map(
    (value) =>
      `${value?.git?.headSha ?? "missing-head"}:${
        value?.git?.fingerprint?.value ?? "missing-fingerprint"
      }`,
  );

  if (new Set(sourceIdentities).size !== 1) {
    failures.push(
      `${label} sessions must use one identical Git HEAD and source fingerprint.`,
    );
  }
}

function validateSessionBrowserContracts(
  label,
  sessions,
  expectedGraphics,
  expectedEnvironment,
  failures,
) {
  if (sessions.length <= 1) {
    return;
  }

  for (const [index, session] of sessions.entries()) {
    const sessionGraphics = session.report.browserGraphics;
    const sessionEnvironment = session.report.browserEnvironment;
    failures.push(
      ...validateBrowserEnvironment(
        sessionEnvironment,
        `${label}.sessions[${index}].browserEnvironment`,
      ),
    );

    for (const field of ["vendor", "renderer", "version"]) {
      if (
        readBrowserGraphicsField(sessionGraphics, field) !==
        readBrowserGraphicsField(expectedGraphics, field)
      ) {
        failures.push(
          `${label}.sessions[${index}].browserGraphics.${field} must match the bundle browser contract.`,
        );
      }
    }

    for (const field of ["userAgent", "version"]) {
      if (sessionEnvironment?.[field] !== expectedEnvironment?.[field]) {
        failures.push(
          `${label}.sessions[${index}].browserEnvironment.${field} must match the bundle browser contract.`,
        );
      }
    }
  }
}

const currentSessionResults = currentSessions.map(({ report, label }) =>
  readSmoothnessResults(report, label, dataFailures),
);
const baselineSessionResults = baselineSessions.map(({ report, label }) =>
  readSmoothnessResults(report, label, dataFailures),
);

failures.push(...dataFailures);
validateSessionContracts(
  currentSessions,
  baselineSessions,
  baseline,
  failures,
);
validateSessionBrowserContracts(
  "current",
  currentSessions,
  currentBrowserGraphics,
  currentBrowserEnvironment,
  failures,
);
validateAbsoluteThresholdContracts(
  currentSessions,
  baselineSessions,
  currentAbsoluteThresholds,
  baselineAbsoluteThresholds,
  failures,
);
validateSessionBrowserContracts(
  "baseline",
  baselineSessions,
  baselineBrowserGraphics,
  baselineBrowserEnvironment,
  failures,
);

if (dataFailures.length === 0) {
  const currentResultGroups = currentSessionResults.map(groupResultValues);
  const baselineResultGroups = baselineSessionResults.map(groupResultValues);
  const referenceBaselineGroups = baselineResultGroups[0] ?? new Map();

  for (const [index, resultGroups] of baselineResultGroups.entries()) {
    validateSessionResultGroups(
      `baseline session ${index + 1}`,
      resultGroups,
      referenceBaselineGroups,
      baseline,
      failures,
    );
  }

  for (const [index, resultGroups] of currentResultGroups.entries()) {
    validateSessionResultGroups(
      `current session ${index + 1}`,
      resultGroups,
      referenceBaselineGroups,
      baseline,
      failures,
    );
  }

  const currentGroups = aggregateSessionResultGroups(currentResultGroups);
  const baselineGroups = aggregateSessionResultGroups(baselineResultGroups);

  for (const [key, baselineGroup] of baselineGroups) {
    const currentGroup = currentGroups.get(key);

    if (!currentGroup) {
      comparisons.push({
        key,
        baseline: baselineGroup,
        current: undefined,
        passed: false,
        failures: [`${key}: missing current benchmark group.`],
      });
      continue;
    }

    const groupFailures = compareGroup(key, currentGroup, baselineGroup);

    failures.push(...groupFailures);
    comparisons.push({
      key,
      baseline: baselineGroup,
      current: currentGroup,
      passed: groupFailures.length === 0,
      failures: groupFailures,
    });
  }

  for (const [key, currentGroup] of currentGroups) {
    if (baselineGroups.has(key)) {
      continue;
    }

    comparisons.push({
      key,
      baseline: undefined,
      current: currentGroup,
      passed: false,
      failures: [`${key}: unexpected current benchmark group.`],
    });
  }
}

const regression = {
  inputPaths,
  baselinePath,
  aggregation: "median-of-session-group-summaries",
  currentSessionCount: currentSessions.length,
  baselineSessionCount: baselineSessions.length,
  currentBrowserGraphics,
  baselineBrowserGraphics,
  currentBrowserEnvironment,
  baselineBrowserEnvironment,
  currentRunEvidence,
  baselineSourceRunEvidence,
  currentAbsoluteThresholds,
  baselineAbsoluteThresholds,
  informationalMetrics: ["averageGeometryQueueMilliseconds"],
  thresholds,
  comparedGroupCount: comparisons.length,
  failureCount: failures.length,
  comparisons,
  failures,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(regression, null, 2)}\n`);

if (failures.length > 0) {
  console.error(
    [
      `Smoothness regression assertion failed with ${failures.length} issue(s).`,
      ...failures.map((failure) => `- ${failure}`),
      `Regression report: ${outputPath}`,
    ].join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log(
    `Smoothness regression assertion passed for ${comparisons.length} group(s): ${outputPath}`,
  );
}

function compareProfileContract(currentReport, baselineReport, failures) {
  const contractFields = [
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

  for (const field of contractFields) {
    const currentValue = readProfileContractValue(currentReport, field);
    const baselineValue = readProfileContractValue(baselineReport, field);

    if (currentValue === undefined || baselineValue === undefined) {
      const missingLocations = [
        currentValue === undefined ? "current" : undefined,
        baselineValue === undefined ? "baseline" : undefined,
      ].filter(Boolean);
      failures.push(
        `Benchmark profile contract ${field} is missing from ${missingLocations.join(
          " and ",
        )}.`,
      );
      continue;
    }

    if (!isDeepStrictEqual(currentValue, baselineValue)) {
      failures.push(
        `Benchmark profile contract ${field} changed from ${formatContractValue(
          baselineValue,
        )} to ${formatContractValue(currentValue)}.`,
      );
    }
  }
}

function readProfileContractValue(report, field) {
  if (
    report?.approval &&
    Object.prototype.hasOwnProperty.call(report.approval, field)
  ) {
    return report.approval[field];
  }

  return report?.[field];
}

function formatContractValue(value) {
  return JSON.stringify(value);
}

function compareBrowserGraphics(currentGraphics, baselineGraphics, failures) {
  if (!thresholds.requireSameBrowserGraphics) {
    return;
  }

  const fields = ["vendor", "renderer", "version"];

  for (const field of fields) {
    const currentValue = readBrowserGraphicsField(currentGraphics, field);
    const baselineValue = readBrowserGraphicsField(baselineGraphics, field);

    if (!currentValue || !baselineValue) {
      failures.push(
        `Current and baseline reports must both include browserGraphics.${field}.`,
      );
      continue;
    }

    if (currentValue !== baselineValue) {
      failures.push(
        `Browser WebGL ${field} changed from "${baselineValue}" to "${currentValue}"; performance reports are not comparable.`,
      );
    }
  }
}

function readBrowserGraphicsField(graphics, field) {
  const value = graphics?.[field];

  return typeof value === "string" ? value.trim() : undefined;
}

function compareBrowserEnvironment(
  currentEnvironment,
  baselineEnvironment,
  failures,
) {
  for (const field of ["userAgent", "version"]) {
    const currentValue = currentEnvironment?.[field];
    const baselineValue = baselineEnvironment?.[field];

    if (
      typeof currentValue !== "string" ||
      currentValue.trim().length === 0 ||
      typeof baselineValue !== "string" ||
      baselineValue.trim().length === 0
    ) {
      failures.push(
        `Current and baseline reports must both include browserEnvironment.${field}.`,
      );
      continue;
    }

    if (currentValue !== baselineValue) {
      failures.push(
        `Browser environment ${field} changed from "${baselineValue}" to "${currentValue}"; performance reports are not comparable.`,
      );
    }
  }
}

function validateAbsoluteThresholdContracts(
  currentSessions,
  baselineSessions,
  currentThresholds,
  baselineThresholds,
  failures,
) {
  if (currentSessions.length <= 1 && baselineSessions.length <= 1) {
    return;
  }

  if (!isRecord(currentThresholds)) {
    failures.push(
      "Current independent-session bundle must contain absoluteThresholds.",
    );
  }

  if (!isRecord(baselineThresholds)) {
    failures.push(
      "Baseline independent-session bundle must contain absoluteThresholds.",
    );
  }

  if (
    isRecord(currentThresholds) &&
    isRecord(baselineThresholds) &&
    !isDeepStrictEqual(currentThresholds, baselineThresholds)
  ) {
    failures.push(
      "Current and baseline absolute smoothness thresholds are not comparable.",
    );
  }

  validateSessionAbsoluteThresholds(
    "current",
    currentSessions,
    currentThresholds,
    failures,
  );
  validateSessionAbsoluteThresholds(
    "baseline",
    baselineSessions,
    baselineThresholds,
    failures,
  );
}

function validateSessionAbsoluteThresholds(
  label,
  sessions,
  expectedThresholds,
  failures,
) {
  for (const [index, session] of sessions.entries()) {
    if (
      !isRecord(session.report.absoluteThresholds) ||
      !isDeepStrictEqual(
        session.report.absoluteThresholds,
        expectedThresholds,
      )
    ) {
      failures.push(
        `${label}.sessions[${index}].absoluteThresholds must match the bundle threshold snapshot.`,
      );
    }
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readSmoothnessResults(report, reportLabel, failures) {
  let results;
  let resultKind;

  if (Array.isArray(report.checkedResults)) {
    results = report.checkedResults;
    resultKind = "checkedResults";
  } else if (Array.isArray(report.results)) {
    results = report.results;
    resultKind = "results";
  } else {
    failures.push(
      `${reportLabel} smoothness report must contain checkedResults or raw benchmark results.`,
    );
    return [];
  }

  if (results.length === 0) {
    failures.push(`${reportLabel}.${resultKind} must contain at least one run.`);
    return [];
  }

  return results.map((result, index) => {
    const valuePath = `${reportLabel}.${resultKind}[${index}]`;

    if (!result || typeof result !== "object" || Array.isArray(result)) {
      failures.push(`${valuePath} must be an object.`);
      return createInvalidResult();
    }

    return resultKind === "checkedResults"
      ? normalizeAssertionResult(result, valuePath, failures)
      : normalizeBenchmarkResult(result, valuePath, failures);
  });
}

function normalizeAssertionResult(result, valuePath, failures) {
  return {
    sampleId: readRequiredString(result.sampleId, `${valuePath}.sampleId`, failures),
    runIndex: readRequiredPositiveInteger(
      result.runIndex,
      `${valuePath}.runIndex`,
      failures,
    ),
    streamPointBudget: readRequiredPositiveNumber(
      result.streamPointBudget,
      `${valuePath}.streamPointBudget`,
      failures,
    ),
    renderedPointCount: readRequiredNonNegativeNumber(
      result.renderedPointCount,
      `${valuePath}.renderedPointCount`,
      failures,
    ),
    renderedFinalNodeCoverageRatio: readRequiredRatio(
      result.renderedFinalNodeCoverageRatio,
      `${valuePath}.renderedFinalNodeCoverageRatio`,
      failures,
    ),
    renderedFinalNodeWeightCoverageRatio: readRequiredRatio(
      result.renderedFinalNodeWeightCoverageRatio,
      `${valuePath}.renderedFinalNodeWeightCoverageRatio`,
      failures,
    ),
    averageFps: readRequiredPositiveNumber(
      result.averageFps,
      `${valuePath}.averageFps`,
      failures,
    ),
    p95FrameMilliseconds: readRequiredNonNegativeNumber(
      result.p95FrameMilliseconds,
      `${valuePath}.p95FrameMilliseconds`,
      failures,
    ),
    maxFrameMilliseconds: readRequiredNonNegativeNumber(
      result.maxFrameMilliseconds,
      `${valuePath}.maxFrameMilliseconds`,
      failures,
    ),
    framesOver50Milliseconds: readRequiredNonNegativeInteger(
      result.framesOver50Milliseconds,
      `${valuePath}.framesOver50Milliseconds`,
      failures,
    ),
    cameraStreamTotalMilliseconds: readRequiredNonNegativeNumber(
      result.cameraStreamTotalMilliseconds,
      `${valuePath}.cameraStreamTotalMilliseconds`,
      failures,
    ),
    cameraStreamFirstResponseMilliseconds: readOptionalNonNegativeNumber(
      result.cameraStreamFirstResponseMilliseconds,
      `${valuePath}.cameraStreamFirstResponseMilliseconds`,
      failures,
    ),
    averageGeometryQueueMilliseconds: readOptionalNonNegativeNumber(
      result.averageGeometryQueueMilliseconds,
      `${valuePath}.averageGeometryQueueMilliseconds`,
      failures,
    ),
  };
}

function normalizeBenchmarkResult(result, valuePath, failures) {
  const summary = result.summary ?? {};
  const diagnostics =
    result.cameraStreamDiagnostics ??
    result.status?.cameraStreamDiagnosticsData ??
    {};
  const pointGeometryTiming = result.pointGeometryTiming;

  return {
    sampleId: readRequiredString(result.sampleId, `${valuePath}.sampleId`, failures),
    runIndex: readRequiredPositiveInteger(
      result.runIndex,
      `${valuePath}.runIndex`,
      failures,
    ),
    streamPointBudget: readRequiredPositiveNumber(
      result.streamPointBudget,
      `${valuePath}.streamPointBudget`,
      failures,
    ),
    renderedPointCount: readRequiredNonNegativeNumber(
      result.renderedPointCount,
      `${valuePath}.renderedPointCount`,
      failures,
    ),
    renderedFinalNodeCoverageRatio: readRequiredRatio(
      result.renderedFinalNodeCoverageRatio,
      `${valuePath}.renderedFinalNodeCoverageRatio`,
      failures,
    ),
    renderedFinalNodeWeightCoverageRatio: readRequiredRatio(
      result.renderedFinalNodeWeightCoverageRatio,
      `${valuePath}.renderedFinalNodeWeightCoverageRatio`,
      failures,
    ),
    averageFps: readRequiredPositiveNumber(
      summary.estimatedAverageFps,
      `${valuePath}.summary.estimatedAverageFps`,
      failures,
    ),
    p95FrameMilliseconds: readRequiredNonNegativeNumber(
      summary.p95FrameMilliseconds,
      `${valuePath}.summary.p95FrameMilliseconds`,
      failures,
    ),
    maxFrameMilliseconds: readRequiredNonNegativeNumber(
      summary.maxFrameMilliseconds,
      `${valuePath}.summary.maxFrameMilliseconds`,
      failures,
    ),
    framesOver50Milliseconds: readRequiredNonNegativeInteger(
      summary.frameDeltasOver50Milliseconds,
      `${valuePath}.summary.frameDeltasOver50Milliseconds`,
      failures,
    ),
    cameraStreamTotalMilliseconds: readRequiredNonNegativeNumber(
      diagnostics.totalMilliseconds,
      `${valuePath}.cameraStreamDiagnostics.totalMilliseconds`,
      failures,
    ),
    cameraStreamFirstResponseMilliseconds: readOptionalNonNegativeNumber(
      result.cameraStreamFirstResponseMilliseconds,
      `${valuePath}.cameraStreamFirstResponseMilliseconds`,
      failures,
    ),
    averageGeometryQueueMilliseconds: readAverageGeometryQueueMilliseconds(
      pointGeometryTiming,
      valuePath,
      failures,
    ),
  };
}

function createInvalidResult() {
  return {
    sampleId: "invalid-sample",
    runIndex: Number.NaN,
    streamPointBudget: Number.NaN,
  };
}

function readAverageGeometryQueueMilliseconds(
  pointGeometryTiming,
  valuePath,
  failures,
) {
  if (pointGeometryTiming === undefined) {
    return undefined;
  }

  if (
    !pointGeometryTiming ||
    typeof pointGeometryTiming !== "object" ||
    Array.isArray(pointGeometryTiming)
  ) {
    failures.push(`${valuePath}.pointGeometryTiming must be an object.`);
    return Number.NaN;
  }

  const sumQueueMilliseconds = readRequiredNonNegativeNumber(
    pointGeometryTiming.sumQueueMilliseconds,
    `${valuePath}.pointGeometryTiming.sumQueueMilliseconds`,
    failures,
  );
  const nodeCount = readRequiredNonNegativeInteger(
    pointGeometryTiming.nodeCount,
    `${valuePath}.pointGeometryTiming.nodeCount`,
    failures,
  );

  return sumQueueMilliseconds / Math.max(1, nodeCount);
}

function groupResultValues(results) {
  const groupedValues = new Map();

  for (const result of results) {
    const key = createGroupKey(result);
    groupedValues.set(key, [...(groupedValues.get(key) ?? []), result]);
  }

  return groupedValues;
}

function summarizeResultGroups(resultGroups) {
  return new Map(
    [...resultGroups].map(([key, results]) => [key, summarizeGroup(results)]),
  );
}

function aggregateSessionResultGroups(resultGroupsBySession) {
  const sessionSummaries = resultGroupsBySession.map(summarizeResultGroups);
  const keys = new Set(
    sessionSummaries.flatMap((summaries) => [...summaries.keys()]),
  );

  return new Map(
    [...keys].map((key) => {
      const groupSessions = sessionSummaries
        .map((summaries) => summaries.get(key))
        .filter((summary) => summary !== undefined);

      return [key, aggregateSessionGroup(groupSessions)];
    }),
  );
}

function aggregateSessionGroup(sessionSummaries) {
  const first = sessionSummaries[0] ?? {};
  const streamTotalValues = sessionSummaries.map(
    (summary) => summary.cameraStreamTotalMilliseconds,
  );
  const streamTotalMedian = median(streamTotalValues);
  const streamTotalMad = medianAbsoluteDeviation(
    streamTotalValues,
    streamTotalMedian,
  );
  const geometryQueueValues = sessionSummaries
    .map((summary) => summary.averageGeometryQueueMilliseconds)
    .filter((value) => value !== undefined);
  const geometryQueueMedian = medianDefined(geometryQueueValues);

  return {
    aggregation: "median-of-session-group-summaries",
    sampleId: first.sampleId ?? "unknown-sample",
    streamPointBudget: first.streamPointBudget ?? 0,
    sessionCount: sessionSummaries.length,
    runCount: first.runCount ?? 0,
    runIndices: first.runIndices ?? [],
    averageFps: median(
      sessionSummaries.map((summary) => summary.averageFps),
    ),
    p95FrameMilliseconds: median(
      sessionSummaries.map((summary) => summary.p95FrameMilliseconds),
    ),
    maxFrameMilliseconds: median(
      sessionSummaries.map((summary) => summary.maxFrameMilliseconds),
    ),
    framesOver50Milliseconds: median(
      sessionSummaries.map((summary) => summary.framesOver50Milliseconds),
    ),
    cameraStreamTotalMilliseconds: streamTotalMedian,
    cameraStreamTotalMadMilliseconds: streamTotalMad,
    cameraStreamTotalRobustSigmaMilliseconds: streamTotalMad * 1.4826,
    cameraStreamFirstResponseMilliseconds: medianDefined(
      sessionSummaries
        .map((summary) => summary.cameraStreamFirstResponseMilliseconds)
        .filter((value) => value !== undefined),
    ),
    averageGeometryQueueMilliseconds: geometryQueueMedian,
    averageGeometryQueueMadMilliseconds:
      geometryQueueMedian === undefined
        ? undefined
        : medianAbsoluteDeviation(geometryQueueValues, geometryQueueMedian),
    renderedPointCount: median(
      sessionSummaries.map((summary) => summary.renderedPointCount),
    ),
    renderedFinalNodeCoverageRatio: median(
      sessionSummaries.map(
        (summary) => summary.renderedFinalNodeCoverageRatio,
      ),
    ),
    renderedFinalNodeWeightCoverageRatio: median(
      sessionSummaries.map(
        (summary) => summary.renderedFinalNodeWeightCoverageRatio,
      ),
    ),
    sessionSummaries,
  };
}

function summarizeGroup(results) {
  return {
    sampleId: results[0]?.sampleId ?? "unknown-sample",
    streamPointBudget: results[0]?.streamPointBudget ?? 0,
    runCount: results.length,
    runIndices: results.map((result) => result.runIndex),
    averageFps: average(results.map((result) => result.averageFps)),
    p95FrameMilliseconds: average(
      results.map((result) => result.p95FrameMilliseconds),
    ),
    maxFrameMilliseconds: Math.max(
      ...results.map((result) => result.maxFrameMilliseconds),
    ),
    framesOver50Milliseconds: results.reduce(
      (sum, result) => sum + result.framesOver50Milliseconds,
      0,
    ),
    cameraStreamTotalMilliseconds: average(
      results.map((result) => result.cameraStreamTotalMilliseconds),
    ),
    cameraStreamFirstResponseMilliseconds: averageDefined(
      results.map((result) => result.cameraStreamFirstResponseMilliseconds),
    ),
    averageGeometryQueueMilliseconds: averageDefined(
      results.map((result) => result.averageGeometryQueueMilliseconds),
    ),
    renderedPointCount: average(
      results.map((result) => result.renderedPointCount),
    ),
    renderedFinalNodeCoverageRatio: average(
      results.map((result) => result.renderedFinalNodeCoverageRatio),
    ),
    renderedFinalNodeWeightCoverageRatio: average(
      results.map((result) => result.renderedFinalNodeWeightCoverageRatio),
    ),
  };
}

function validateExactGroupSet(
  currentResultGroups,
  baselineResultGroups,
  failures,
) {
  for (const key of baselineResultGroups.keys()) {
    if (!currentResultGroups.has(key)) {
      failures.push(`${key}: missing current benchmark group.`);
    }
  }

  for (const key of currentResultGroups.keys()) {
    if (!baselineResultGroups.has(key)) {
      failures.push(`${key}: unexpected current benchmark group.`);
    }
  }
}

function validateSessionResultGroups(
  sessionLabel,
  resultGroups,
  referenceBaselineGroups,
  baselineReport,
  failures,
) {
  const sessionFailures = [];
  validateExactGroupSet(
    resultGroups,
    referenceBaselineGroups,
    sessionFailures,
  );
  const approvedRepeatCount =
    readApprovedRepeatCount(baselineReport, sessionFailures) ??
    [...referenceBaselineGroups.values()][0]?.length ??
    0;

  for (const [key, runs] of resultGroups) {
    validateGroupRuns(
      "session",
      key,
      runs,
      approvedRepeatCount,
      sessionFailures,
    );
  }

  failures.push(
    ...sessionFailures.map((failure) => `${sessionLabel}: ${failure}`),
  );
}

function readApprovedRepeatCount(baselineReport, failures) {
  const repeatCount = baselineReport?.approval?.repeatCount;

  if (repeatCount === undefined) {
    return undefined;
  }

  if (!Number.isInteger(repeatCount) || repeatCount <= 0) {
    failures.push(
      "baseline.approval.repeatCount must be a positive integer when provided.",
    );
    return undefined;
  }

  return repeatCount;
}

function validateGroupRuns(label, key, runs, expectedRunCount, failures) {
  if (runs.length !== expectedRunCount) {
    failures.push(
      `${key}: ${label} has ${runs.length} run(s); expected ${expectedRunCount}.`,
    );
  }

  const runIndices = runs.map((run) => run.runIndex);
  const uniqueRunIndices = new Set(runIndices);

  if (uniqueRunIndices.size !== runIndices.length) {
    failures.push(
      `${key}: ${label} runIndex values must be unique; received ${formatRunIndices(
        runIndices,
      )}.`,
    );
  }

  const expectedRunIndices = Array.from(
    { length: expectedRunCount },
    (_, index) => index + 1,
  );
  const missingRunIndices = expectedRunIndices.filter(
    (runIndex) => !uniqueRunIndices.has(runIndex),
  );
  const unexpectedRunIndices = [...uniqueRunIndices].filter(
    (runIndex) => !expectedRunIndices.includes(runIndex),
  );

  if (missingRunIndices.length > 0 || unexpectedRunIndices.length > 0) {
    failures.push(
      `${key}: ${label} runIndex set must be ${formatRunIndices(
        expectedRunIndices,
      )}; received ${formatRunIndices(runIndices)}.`,
    );
  }
}

function formatRunIndices(runIndices) {
  return `[${runIndices.join(", ")}]`;
}

function compareGroup(key, current, baseline) {
  const failures = [];

  checkMinimumRatio(
    failures,
    key,
    "average FPS",
    current.averageFps,
    baseline.averageFps,
    thresholds.minAverageFpsRatio,
  );
  checkMaximumRatio(
    failures,
    key,
    "p95 frame",
    current.p95FrameMilliseconds,
    baseline.p95FrameMilliseconds,
    thresholds.maxP95FrameRatio,
  );
  checkMaximumRatioWithAbsoluteDelta(
    failures,
    key,
    "max frame",
    current.maxFrameMilliseconds,
    baseline.maxFrameMilliseconds,
    thresholds.maxFrameRatio,
    thresholds.maxFrameAbsoluteDeltaMilliseconds,
  );
  checkMaximumRatio(
    failures,
    key,
    "frames over 50 ms",
    current.framesOver50Milliseconds,
    baseline.framesOver50Milliseconds,
    thresholds.maxFramesOver50Ratio,
  );
  const streamTotalAbsoluteDeltaMilliseconds = Math.max(
    thresholds.maxCameraStreamTotalMinimumDeltaMilliseconds,
    baseline.cameraStreamTotalRobustSigmaMilliseconds *
      thresholds.maxCameraStreamTotalRobustSigmaMultiplier,
  );
  checkMaximumRatioWithAbsoluteDelta(
    failures,
    key,
    "camera stream total",
    current.cameraStreamTotalMilliseconds,
    baseline.cameraStreamTotalMilliseconds,
    thresholds.maxCameraStreamTotalRatio,
    streamTotalAbsoluteDeltaMilliseconds,
  );
  checkOptionalMaximumRatioWithAbsoluteDelta(
    failures,
    key,
    "camera stream first response",
    current.cameraStreamFirstResponseMilliseconds,
    baseline.cameraStreamFirstResponseMilliseconds,
    thresholds.maxCameraStreamFirstResponseRatio,
    thresholds.maxCameraStreamFirstResponseAbsoluteDeltaMilliseconds,
  );
  checkMinimumRatio(
    failures,
    key,
    "rendered points",
    current.renderedPointCount,
    baseline.renderedPointCount,
    thresholds.minRenderedPointRatio,
  );

  if (
    current.renderedFinalNodeCoverageRatio <
    baseline.renderedFinalNodeCoverageRatio - thresholds.maxCoverageDrop
  ) {
    failures.push(
      `${key}: current-view coverage ${formatPercent(
        current.renderedFinalNodeCoverageRatio,
      )} dropped below baseline ${formatPercent(
        baseline.renderedFinalNodeCoverageRatio,
      )} by more than ${formatPercent(thresholds.maxCoverageDrop)}.`,
    );
  }

  if (
    current.renderedFinalNodeWeightCoverageRatio <
    baseline.renderedFinalNodeWeightCoverageRatio - thresholds.maxCoverageDrop
  ) {
    failures.push(
      `${key}: weighted current-view coverage ${formatPercent(
        current.renderedFinalNodeWeightCoverageRatio,
      )} dropped below baseline ${formatPercent(
        baseline.renderedFinalNodeWeightCoverageRatio,
      )} by more than ${formatPercent(thresholds.maxCoverageDrop)}.`,
    );
  }

  return failures;
}

function checkMinimumRatio(
  failures,
  key,
  label,
  currentValue,
  baselineValue,
  minRatio,
) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(baselineValue)) {
    failures.push(`${key}: ${label} could not be compared.`);
    return;
  }

  if (baselineValue <= 0) {
    return;
  }

  const ratio = currentValue / baselineValue;

  if (ratio < minRatio) {
    failures.push(
      `${key}: ${label} ${formatNumber(currentValue)} is ${formatRatio(
        ratio,
      )} of baseline ${formatNumber(baselineValue)}, below ${formatRatio(
        minRatio,
      )}.`,
    );
  }
}

function checkMaximumRatio(
  failures,
  key,
  label,
  currentValue,
  baselineValue,
  maxRatio,
) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(baselineValue)) {
    failures.push(`${key}: ${label} could not be compared.`);
    return;
  }

  if (baselineValue <= 0) {
    if (currentValue > 0) {
      failures.push(
        `${key}: ${label} increased from 0 to ${formatNumber(currentValue)}.`,
      );
    }
    return;
  }

  const ratio = currentValue / baselineValue;

  if (ratio > maxRatio) {
    failures.push(
      `${key}: ${label} ${formatNumber(currentValue)} is ${formatRatio(
        ratio,
      )} of baseline ${formatNumber(baselineValue)}, above ${formatRatio(
        maxRatio,
      )}.`,
    );
  }
}

function checkMaximumRatioWithAbsoluteDelta(
  failures,
  key,
  label,
  currentValue,
  baselineValue,
  maxRatio,
  maxAbsoluteDelta,
) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(baselineValue)) {
    failures.push(`${key}: ${label} could not be compared.`);
    return;
  }

  const ratioLimit = baselineValue > 0 ? baselineValue * maxRatio : 0;
  const additiveLimit = baselineValue + maxAbsoluteDelta;
  const allowedValue = Math.max(ratioLimit, additiveLimit);

  if (currentValue <= allowedValue) {
    return;
  }

  const observedRatio =
    baselineValue > 0 ? currentValue / baselineValue : Number.POSITIVE_INFINITY;
  failures.push(
    `${key}: ${label} ${formatNumber(currentValue)} exceeds allowed ${formatNumber(
      allowedValue,
    )} from baseline ${formatNumber(baselineValue)} (${formatRatio(
      maxRatio,
    )} or +${formatNumber(maxAbsoluteDelta)} ms; observed ${formatRatio(
      observedRatio,
    )}).`,
  );
}

function checkOptionalMaximumRatioWithAbsoluteDelta(
  failures,
  key,
  label,
  currentValue,
  baselineValue,
  maxRatio,
  maxAbsoluteDelta,
) {
  if (currentValue === undefined && baselineValue === undefined) {
    return;
  }

  checkMaximumRatioWithAbsoluteDelta(
    failures,
    key,
    label,
    currentValue,
    baselineValue,
    maxRatio,
    maxAbsoluteDelta,
  );
}

function createGroupKey(result) {
  return `${result.sampleId}:budget=${result.streamPointBudget}`;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function averageDefined(values) {
  const definedValues = values.filter((value) => value !== undefined);

  return definedValues.length === 0 ? undefined : average(definedValues);
}

function median(values) {
  if (values.length === 0) {
    return Number.NaN;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function medianDefined(values) {
  return values.length === 0 ? undefined : median(values);
}

function medianAbsoluteDeviation(values, center = median(values)) {
  return median(values.map((value) => Math.abs(value - center)));
}

function readRequiredString(value, valuePath, failures) {
  if (typeof value !== "string" || value.trim().length === 0) {
    failures.push(`${valuePath} must be a non-empty string.`);
    return "invalid-sample";
  }

  return value;
}

function readRequiredPositiveInteger(value, valuePath, failures) {
  if (!Number.isInteger(value) || value <= 0) {
    failures.push(`${valuePath} must be a positive integer.`);
    return Number.NaN;
  }

  return value;
}

function readRequiredFiniteNumber(value, valuePath, failures) {
  if (!Number.isFinite(value)) {
    failures.push(`${valuePath} must be a finite number.`);
    return Number.NaN;
  }

  return value;
}

function readRequiredNonNegativeNumber(value, valuePath, failures) {
  const number = readRequiredFiniteNumber(value, valuePath, failures);

  if (Number.isFinite(number) && number < 0) {
    failures.push(`${valuePath} must be non-negative.`);
    return Number.NaN;
  }

  return number;
}

function readRequiredPositiveNumber(value, valuePath, failures) {
  const number = readRequiredFiniteNumber(value, valuePath, failures);

  if (Number.isFinite(number) && number <= 0) {
    failures.push(`${valuePath} must be positive.`);
    return Number.NaN;
  }

  return number;
}

function readRequiredNonNegativeInteger(value, valuePath, failures) {
  if (!Number.isInteger(value) || value < 0) {
    failures.push(`${valuePath} must be a non-negative integer.`);
    return Number.NaN;
  }

  return value;
}

function readRequiredRatio(value, valuePath, failures) {
  const number = readRequiredFiniteNumber(value, valuePath, failures);

  if (Number.isFinite(number) && (number < 0 || number > 1)) {
    failures.push(`${valuePath} must be between 0 and 1.`);
    return Number.NaN;
  }

  return number;
}

function readOptionalNonNegativeNumber(value, valuePath, failures) {
  if (value === undefined) {
    return undefined;
  }

  return readRequiredNonNegativeNumber(value, valuePath, failures);
}

function readStringArg(name) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  const value = process.argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a path value.`);
  }

  return path.resolve(value);
}

function readStringArgs(name) {
  const values = [];

  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) {
      continue;
    }

    const value = process.argv[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`${name} requires a path value.`);
    }

    values.push(path.resolve(value));
    index += 1;
  }

  return values;
}

function readFirstPositionalArg() {
  const valueOptions = new Set(["--baseline", "--input", "--output"]);

  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];

    if (valueOptions.has(value)) {
      index += 1;
      continue;
    }

    if (!value.startsWith("--")) {
      return path.resolve(value);
    }
  }

  return undefined;
}

function readNumberEnv(name, fallback) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }

  return value;
}

function readBooleanEnv(name, fallback) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  return rawValue === "1" || rawValue.toLowerCase() === "true";
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString("en-US") : String(value);
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : String(value);
}

function formatRatio(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : String(value);
}
