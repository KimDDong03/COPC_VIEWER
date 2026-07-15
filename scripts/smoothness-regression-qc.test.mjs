import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runnerPath = path.join(scriptDir, "smoothness-regression-qc.mjs");
const repoRoot = path.resolve(scriptDir, "..");
const versionedBaselinePath = path.join(
  repoRoot,
  "benchmarks",
  "baselines",
  "smoothness-warm-zoom-detail-rtx3060.json",
);

test("retains prefetch wait timing in the versioned profile contract", () => {
  const source = readFileSync(runnerPath, "utf8");
  const profileContract = source.match(
    /const profileContractFields = \[([\s\S]*?)\];/,
  );

  assert.ok(profileContract, "profileContractFields must be declared");
  assert.match(profileContract[1], /"prefetchWaitTimeoutMilliseconds"/);
});

test("rejects the former one-step baseline approval flag", () => {
  const result = runRunner(["--approve-baseline"]);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /--approve-baseline was replaced by --create-baseline-candidate/,
  );
});

test("requires five sessions for a baseline candidate", () => {
  const result = runRunner([
    "--session-count",
    "3",
    "--create-baseline-candidate",
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Baseline candidates require at least 5/);
});

test("requires explicit reviewed confirmation before candidate installation", () => {
  const result = runRunner([
    "--install-baseline-candidate",
    "candidate.json",
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires --confirm-reviewed-baseline/);
});

test("refuses to treat the versioned baseline itself as a candidate", () => {
  const result = runRunner([
    "--install-baseline-candidate",
    versionedBaselinePath,
    "--confirm-reviewed-baseline",
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /candidate path must differ/);
});

test("rejects arbitrary JSON instead of installing it as a baseline", () => {
  const result = runRunner([
    "--install-baseline-candidate",
    path.join(repoRoot, "package.json"),
    "--confirm-reviewed-baseline",
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /schemaVersion must be 2/);
});

test("rejects a candidate with fewer than five approved sessions", () => {
  const temporaryRoot = mkdtempSync(
    path.join(os.tmpdir(), "copc-baseline-candidate-"),
  );
  const candidatePath = path.join(temporaryRoot, "candidate.json");

  try {
    writeFileSync(
      candidatePath,
      JSON.stringify({
        schemaVersion: 2,
        approval: {
          sourceBenchmark:
            "scripts/smoothness-regression-qc.mjs --create-baseline-candidate",
          sessionCount: 3,
        },
        sessions: [{}, {}, {}],
      }),
    );
    const result = runRunner([
      "--install-baseline-candidate",
      candidatePath,
      "--confirm-reviewed-baseline",
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /sessionCount must be an odd integer of at least 5/);
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
});

test("rejects a baseline candidate with an impossible approval date", () => {
  const temporaryRoot = mkdtempSync(
    path.join(os.tmpdir(), "copc-baseline-date-"),
  );
  const candidatePath = path.join(temporaryRoot, "candidate.json");

  try {
    writeFileSync(
      candidatePath,
      JSON.stringify({
        schemaVersion: 2,
        sessionAggregation: "median-of-session-group-summaries",
        absoluteThresholds: {},
        capture: {
          sessionCount: 5,
          sessionLifecycle: "fresh-browser",
        },
        approval: {
          sourceBenchmark:
            "scripts/smoothness-regression-qc.mjs --create-baseline-candidate",
          sessionCount: 5,
          minimumCurrentSessionCount: 3,
          aggregation: "median-of-session-group-summaries",
          approvedOn: "2026-99-99",
        },
        sessions: [{}, {}, {}, {}, {}],
      }),
    );
    const result = runRunner([
      "--install-baseline-candidate",
      candidatePath,
      "--confirm-reviewed-baseline",
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /approvedOn must be an ISO date/);
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
});

function runRunner(args) {
  return spawnSync(process.execPath, [runnerPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}
