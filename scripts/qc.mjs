import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyLiveCopcExecutionFailure } from "./live-copc-range-check.mjs";
import { createRunEvidence } from "./run-evidence.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const statusPath = path.join(repoRoot, "output", "qc", "qc-status.json");
const isWindows = process.platform === "win32";
const npmCommand = "npm";
const omitWarmZoomDetail = process.argv.includes("--omit-warm-zoom-detail");
const productOnly = process.argv.includes("--product-only");
const liveOnly = process.argv.includes("--live-only");
const listOnly = process.argv.includes("--list");

if (productOnly && liveOnly) {
  throw new Error("--product-only and --live-only cannot be used together.");
}

const productSteps = [
  ["Unit tests", npmCommand, ["test"]],
  ["License and SPDX evidence", npmCommand, ["run", "license:evidence:self-test"]],
  ["Library and example build", npmCommand, ["run", "build"]],
  ["Whitespace check", "git", ["diff", "--check"]],
];
const liveEvidenceSteps = [
  ["Live COPC HTTP Range evidence", npmCommand, ["run", "live:copc-range"]],
  [
    "Cold detail camera-stream smoothness QC",
    npmCommand,
    ["run", "benchmark:smoothness:cold-detail"],
  ],
  ["Renderer benchmark", npmCommand, ["run", "benchmark:renderers"]],
  [
    "Contest camera-stream smoothness QC",
    npmCommand,
    ["run", "benchmark:smoothness:contest"],
  ],
  [
    "Warm zoom camera-stream smoothness QC",
    npmCommand,
    ["run", "benchmark:smoothness:warm-zoom-detail"],
  ],
  ["Package consumer smoke", npmCommand, ["run", "smoke:package"]],
  ["Browser example smoke", npmCommand, ["run", "smoke:example"]],
  ["Browser local-file smoke", npmCommand, ["run", "smoke:example:file"]],
].filter(
  ([label]) =>
    !omitWarmZoomDetail || label !== "Warm zoom camera-stream smoothness QC",
);
const groups = [
  { id: "product", label: "Deterministic product gate", steps: productSteps },
  { id: "live", label: "Live external COPC evidence", steps: liveEvidenceSteps },
].filter(({ id }) => {
  if (productOnly) {
    return id === "product";
  }

  if (liveOnly) {
    return id === "live";
  }

  return true;
});

if (listOnly) {
  console.log(
    JSON.stringify(
      {
        mode: productOnly ? "product-only" : liveOnly ? "live-only" : "full",
        groups: groups.map(({ id, label, steps }) => ({
          id,
          label,
          steps: steps.map(([stepLabel]) => stepLabel),
        })),
      },
      null,
      2,
    ),
  );
} else {
  await runQc();
}

async function runQc() {
  const startedAt = new Date().toISOString();
  const runEvidence = await createRunEvidence({ repoRoot });
  const outcomes = [];

  for (const group of groups) {
    console.log(`\n## ${group.label} ##`);

    for (const [label, command, args] of group.steps) {
      console.log(`\n== ${label} ==`);
      const result = await run(command, args);
      outcomes.push({
        group: group.id,
        label,
        status: result.status === 0 ? "passed" : "failed",
        exitCode: result.status,
        durationMilliseconds: result.durationMilliseconds,
      });

      if (result.status === 0) {
        continue;
      }

      const classification = classifyStepFailure(group.id, label, result);
      const status =
        classification === "external-source-unavailable"
          ? "unavailable"
          : "failed";
      await writeStatus({
        startedAt,
        status,
        classification,
        failedGroup: group.id,
        failedStep: label,
        exitCode: classification === "external-source-unavailable" ? 2 : 1,
        runEvidence,
        outcomes,
      });
      console.error(
        [
          `QC ${status}: ${classification}.`,
          `Failed step: ${label}.`,
          classification === "external-source-unavailable"
            ? "The external COPC host or network was unavailable; deterministic product checks are reported separately and this is not a code-regression verdict."
            : group.id === "live"
              ? "The live source was reachable, so this remains a blocking live-evidence failure."
              : "A deterministic product check failed.",
          `Classification evidence: ${statusPath}`,
        ].join("\n"),
      );
      process.exitCode =
        classification === "external-source-unavailable" ? 2 : 1;
      return;
    }
  }

  const classification = productOnly
    ? "product-gate-passed"
    : liveOnly
      ? "live-evidence-passed"
      : "full-qc-passed";
  await writeStatus({
    startedAt,
    status: "passed",
    classification,
    exitCode: 0,
    runEvidence,
    outcomes,
  });
  console.log(
    productOnly
      ? "\nDeterministic product QC passed."
      : liveOnly
        ? "\nLive external COPC evidence passed."
        : "\nQC passed: deterministic product gate and live external COPC evidence both passed.",
  );
}

function classifyStepFailure(groupId, label, result) {
  if (groupId === "product") {
    return "product-regression";
  }

  if (label === "Live COPC HTTP Range evidence") {
    return result.status === 2
      ? "external-source-unavailable"
      : "live-source-contract-failure";
  }

  return classifyLiveCopcExecutionFailure(result.output);
}

function run(command, args) {
  const startedAt = performance.now();

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      shell: isWindows,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    let settled = false;
    const retainOutput = (chunk, destination) => {
      const text = chunk.toString();
      destination.write(text);
      output = `${output}${text}`.slice(-1024 * 1024);
    };

    child.stdout.on("data", (chunk) => retainOutput(chunk, process.stdout));
    child.stderr.on("data", (chunk) => retainOutput(chunk, process.stderr));
    child.once("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      const errorText = error instanceof Error ? error.stack ?? error.message : String(error);
      process.stderr.write(`${errorText}\n`);
      resolve({
        status: 1,
        output: `${output}\n${errorText}`,
        durationMilliseconds: performance.now() - startedAt,
      });
    });
    child.once("close", (status) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve({
        status: status ?? 1,
        output,
        durationMilliseconds: performance.now() - startedAt,
      });
    });
  });
}

async function writeStatus(fields) {
  await mkdir(path.dirname(statusPath), { recursive: true });
  await writeFile(
    statusPath,
    `${JSON.stringify(
      {
        schema: "copc-viewer.qc-status",
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        mode: productOnly ? "product-only" : liveOnly ? "live-only" : "full",
        ...fields,
      },
      null,
      2,
    )}\n`,
  );
}
