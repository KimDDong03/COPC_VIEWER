import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { LIVE_COPC_SAMPLE_URLS } from "../config/live-copc-sources.mjs";
import {
  classifyLiveCopcExecutionFailure,
  probeLiveCopcRangeSource,
} from "./live-copc-range-check.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

test("keeps runtime live-sample URLs on one shared source contract", () => {
  assert.equal(
    LIVE_COPC_SAMPLE_URLS.autzenClassified,
    "https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz",
  );
  assert.equal(
    LIVE_COPC_SAMPLE_URLS.millsiteReservoir,
    "https://s3.amazonaws.com/hobu-lidar/millsite.copc.laz",
  );

  for (const relativePath of [
    "benchmark-smoothness.mjs",
    "live-copc-range-qc.mjs",
    "smoothness-regression-qc.mjs",
    "smoke-example.mjs",
    path.join("..", "examples", "basic-viewer", "src", "sampleCopcSources.ts"),
  ]) {
    const source = readFileSync(path.resolve(scriptDir, relativePath), "utf8");
    assert.doesNotMatch(
      source,
      /https:\/\/s3\.amazonaws\.com\/hobu-lidar\/(?:autzen-classified|millsite)\.copc\.laz/,
      `${relativePath} must import the shared live COPC source contract`,
    );
  }
});

test("accepts one strict COPC HTTP 206 range response", async () => {
  const bytes = new Uint8Array(64);
  bytes.set([0x4c, 0x41, 0x53, 0x46]);
  const result = await probeLiveCopcRangeSource({
    id: "fixture",
    url: "https://example.test/fixture.copc.laz",
    fetchImplementation: async (_url, init) => {
      assert.equal(init.headers.Range, "bytes=0-63");
      return new Response(bytes, {
        status: 206,
        headers: { "Content-Range": "bytes 0-63/1024" },
      });
    },
  });

  assert.equal(result.status, "passed");
  assert.equal(result.classification, "live-range-verified");
  assert.equal(result.response.fileSignature, "LASF");
});

test("classifies a timeout as external source availability, not regression", async () => {
  const result = await probeLiveCopcRangeSource({
    id: "fixture",
    url: "https://example.test/fixture.copc.laz",
    timeoutMilliseconds: 10,
    fetchImplementation: async (_url, init) =>
      await new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), {
          once: true,
        });
      }),
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.classification, "external-source-unavailable");
  assert.match(result.error, /timed out after 10 milliseconds/);
});

test("classifies a non-206 response as a live source contract failure", async () => {
  const result = await probeLiveCopcRangeSource({
    id: "fixture",
    url: "https://example.test/fixture.copc.laz",
    fetchImplementation: async () => new Response(new Uint8Array(64)),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.classification, "live-source-contract-failure");
  assert.match(result.error, /expected 206 Partial Content/);
});

test("separates live network failures from real performance assertions", () => {
  assert.equal(
    classifyLiveCopcExecutionFailure(
      "Failed to load COPC: COPC range request timed out after 30000 milliseconds.",
    ),
    "external-source-unavailable",
  );
  assert.equal(
    classifyLiveCopcExecutionFailure(
      "Smoothness benchmark assertion failed with 2 issue(s).",
    ),
    "performance-regression",
  );
  assert.equal(
    classifyLiveCopcExecutionFailure("Unexpected renderer invariant failure"),
    "benchmark-execution-failure",
  );
  assert.equal(
    classifyLiveCopcExecutionFailure("TypeError: Failed to fetch"),
    "benchmark-execution-failure",
    "ambiguous fetch failures stay blocking unless exact range/network evidence is present",
  );
});
