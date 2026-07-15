import { describe, expect, it } from "vitest";
import { summarizeRecoveredHttpRangeResponses } from "./http-range-response-policy.mjs";

const origin = "http://localhost:4473";

describe("recovered HTTP range response policy", () => {
it("accepts valid same-origin 206 range responses", () => {
  const summary = summarizeRecoveredHttpRangeResponses(
    [createResponse()],
    origin,
  );

  expect(summary.passed).toBe(true);
  expect(summary.recoveredTransientFailureCount).toBe(0);
});

it("accepts a retriable response only when the same range later succeeds", () => {
  const summary = summarizeRecoveredHttpRangeResponses(
    [createResponse({ status: 503, contentRange: null }), createResponse()],
    origin,
  );

  expect(summary.passed).toBe(true);
  expect(summary.recoveredTransientFailureCount).toBe(1);
});

it("rejects an unrecovered retriable response", () => {
  const summary = summarizeRecoveredHttpRangeResponses(
    [createResponse({ status: 503, contentRange: null })],
    origin,
  );

  expect(summary.passed).toBe(false);
  expect(summary.invalidResponses).toHaveLength(1);
});

it("rejects non-retriable failures even when a later request succeeds", () => {
  const summary = summarizeRecoveredHttpRangeResponses(
    [createResponse({ status: 404, contentRange: null }), createResponse()],
    origin,
  );

  expect(summary.passed).toBe(false);
});

it("rejects mismatched content ranges and origins", () => {
  expect(
    summarizeRecoveredHttpRangeResponses(
      [createResponse({ contentRange: "bytes 1-9/100" })],
      origin,
    ).passed,
  ).toBe(false);
  expect(
    summarizeRecoveredHttpRangeResponses(
      [createResponse({ url: "https://example.com/sample.copc.laz" })],
      origin,
    ).passed,
  ).toBe(false);
});

it("rejects an empty response set", () => {
  expect(summarizeRecoveredHttpRangeResponses([], origin).passed).toBe(false);
});
});

function createResponse(overrides = {}) {
  return {
    contentRange: "bytes 0-9/100",
    method: "GET",
    range: "bytes=0-9",
    status: 206,
    url: `${origin}/sample.copc.laz`,
    ...overrides,
  };
}
