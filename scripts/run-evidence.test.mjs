import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import {
  createRunEvidence,
  RUN_EVIDENCE_SCHEMA,
  validateBrowserEnvironment,
  validateRunEvidence,
  validateRunEvidenceSourceState,
} from "./run-evidence.mjs";

// This integration case starts 21 Git processes. Process startup and antivirus
// contention on Windows can exceed 20 seconds while the full suite runs in
// parallel, even though the same assertions complete in seconds in isolation.
const gitHeavyIntegrationTimeout = 60_000;

test("captures deterministic Git, runtime, and npm lifecycle evidence", async () => {
  const repository = await createRepository();

  try {
    const options = {
      repoRoot: repository,
      generatedAt: new Date("2026-07-10T03:04:05.678Z"),
      environment: {
        npm_lifecycle_event: "benchmark:smoothness",
        npm_lifecycle_script: "node scripts/benchmark-smoothness.mjs",
        npm_package_name: "copc-viewer",
        npm_package_version: "0.2.0",
        npm_config_user_agent: "npm/11.4.2 node/v22.17.0 win32 x64",
      },
    };
    const first = await createRunEvidence(options);
    const second = await createRunEvidence(options);

    assert.equal(first.schema, RUN_EVIDENCE_SCHEMA);
    assert.equal(first.generatedAt, "2026-07-10T03:04:05.678Z");
    assert.equal(first.git.worktreeState, "clean");
    assert.equal(first.git.fingerprint.value, second.git.fingerprint.value);
    assert.equal(first.git.fingerprint.untrackedFileCount, 0);
    assert.equal(first.runtime.npm.lifecycleEvent, "benchmark:smoothness");
    assert.deepEqual(validateRunEvidence(first), []);

    await writeFile(path.join(repository, "tracked.txt"), "changed\n");
    await writeFile(path.join(repository, "z-untracked.txt"), "z\n");
    await writeFile(path.join(repository, "a-untracked.txt"), "a\n");
    const changed = await createRunEvidence(options);

    assert.equal(changed.git.worktreeState, "dirty");
    assert.notEqual(
      changed.git.fingerprint.value,
      first.git.fingerprint.value,
    );
    assert.equal(changed.git.fingerprint.untrackedFileCount, 2);
    assert.equal(changed.git.fingerprint.untrackedContentByteLength, 4);

    await writeFile(path.join(repository, "ignored.txt"), "ignored\n");
    await mkdir(path.join(repository, "output"), { recursive: true });
    await writeFile(path.join(repository, "output", "result.json"), "{}\n");
    await mkdir(path.join(repository, "benchmarks", "baselines"), {
      recursive: true,
    });
    await writeFile(
      path.join(repository, "benchmarks", "baselines", "approved.json"),
      "{}\n",
    );
    const excluded = await createRunEvidence(options);

    assert.equal(
      excluded.git.fingerprint.value,
      changed.git.fingerprint.value,
    );
    assert.equal(excluded.git.fingerprint.untrackedFileCount, 2);
  } finally {
    await rm(repository, { force: true, recursive: true });
  }
}, gitHeavyIntegrationTimeout);

test("rejects malformed evidence fields", async () => {
  const repository = await createRepository();

  try {
    const evidence = await createRunEvidence({ repoRoot: repository });
    evidence.generatedAt = "2026-07-10";
    evidence.git.headSha = "not-a-sha";
    evidence.git.fingerprint.value = "bad";
    evidence.runtime.npm.lifecycleEvent = 7;
    const failures = validateRunEvidence(evidence, "benchmark.runEvidence");

    assert.match(
      failures.join("\n"),
      /benchmark\.runEvidence\.generatedAt must be a valid UTC ISO-8601 timestamp/,
    );
    assert.match(failures.join("\n"), /headSha must be a lowercase Git object ID/);
    assert.match(failures.join("\n"), /fingerprint\.value must be a lowercase SHA-256/);
    assert.match(failures.join("\n"), /npm\.lifecycleEvent must be a non-empty string or null/);
  } finally {
    await rm(repository, { force: true, recursive: true });
  }
}, 20_000);

test("validates browser user-agent and version evidence", () => {
  assert.deepEqual(
    validateBrowserEnvironment({
      userAgent: "Mozilla/5.0 Chrome/141.0.7390.76 Safari/537.36",
      version: "141.0.7390.76",
    }),
    [],
  );
  assert.match(
    validateBrowserEnvironment(
      { userAgent: "", version: "latest" },
      "benchmark.browserEnvironment",
    ).join("\n"),
    /benchmark\.browserEnvironment\.userAgent must be a non-empty string/,
  );
  assert.match(
    validateBrowserEnvironment({ userAgent: "agent", version: "latest" }).join(
      "\n",
    ),
    /version must be a browser version string/,
  );
});

test("detects source-state drift between evidence capture and artifact creation", async () => {
  const repository = await createRepository();

  try {
    const captured = await createRunEvidence({ repoRoot: repository });
    const unchanged = structuredClone(captured);
    unchanged.generatedAt = new Date(
      Date.parse(captured.generatedAt) + 1_000,
    ).toISOString();

    assert.deepEqual(
      validateRunEvidenceSourceState(captured, unchanged),
      [],
    );

    const changed = structuredClone(unchanged);
    changed.git.headSha = "a".repeat(40);
    changed.git.worktreeState = "dirty";
    changed.git.fingerprint.value = "b".repeat(64);
    const failures = validateRunEvidenceSourceState(
      captured,
      changed,
      "packageSmoke.sourceState",
    ).join("\n");

    assert.match(failures, /packageSmoke\.sourceState\.git\.headSha changed/);
    assert.match(failures, /packageSmoke\.sourceState\.git\.worktreeState changed/);
    assert.match(failures, /packageSmoke\.sourceState\.git\.fingerprint\.value changed/);
  } finally {
    await rm(repository, { force: true, recursive: true });
  }
}, 20_000);

test("rejects implausibly old and future run timestamps", async () => {
  const repository = await createRepository();

  try {
    const evidence = await createRunEvidence({ repoRoot: repository });

    evidence.generatedAt = "1970-01-01T00:00:00.000Z";
    assert.match(
      validateRunEvidence(evidence).join("\n"),
      /must not be earlier than 2020-01-01/,
    );

    evidence.generatedAt = new Date(Date.now() + 10 * 60 * 1_000).toISOString();
    assert.match(
      validateRunEvidence(evidence).join("\n"),
      /must not be more than 5 minutes in the future/,
    );
  } finally {
    await rm(repository, { force: true, recursive: true });
  }
}, 20_000);

async function createRepository() {
  const repository = await mkdtemp(path.join(os.tmpdir(), "copc-run-evidence-"));

  runGit(repository, ["init"]);
  runGit(repository, ["config", "user.email", "test@example.com"]);
  runGit(repository, ["config", "user.name", "COPC test"]);
  await writeFile(path.join(repository, ".gitignore"), "ignored.txt\n");
  await writeFile(path.join(repository, "tracked.txt"), "initial\n");
  runGit(repository, ["add", ".gitignore", "tracked.txt"]);
  runGit(repository, ["commit", "-m", "initial"]);

  return repository;
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });

  assert.equal(result.status, 0, result.stderr);
}
