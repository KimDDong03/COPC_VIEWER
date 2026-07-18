import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRunEvidence } from "./run-evidence.mjs";

export const DEFAULT_RANGE_START = 0;
export const DEFAULT_RANGE_END_INCLUSIVE = 65_535;
export const DEFAULT_REPEATS = 3;
export const MAX_RANGE_BYTE_LENGTH = 2 * 1024 * 1024;
export const DEFAULT_OUTPUT_PATH = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  "output",
  "deployed-edge-range-qc",
  "deployed-edge-range-result.json",
);

const requiredExposedHeaders = [
  "content-range",
  "etag",
  "accept-ranges",
  "content-length",
  "x-cache",
  "age",
];

export class DeployedEdgeRangeQcError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "DeployedEdgeRangeQcError";
  }
}

export async function runDeployedEdgeRangeQc(options = {}) {
  const url = options.url ?? process.env.COPC_DEPLOYED_EDGE_URL;
  const outputPath = path.resolve(options.outputPath ?? DEFAULT_OUTPUT_PATH);
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  const runEvidence = options.runEvidence ?? await createRunEvidence();
  const generatedAt = options.generatedAt ?? new Date();
  const failures = [];
  const responses = [];
  let range = null;
  let repeats = null;
  let cloudFrontMode = "generic-cdn";
  let origin = null;
  let expectedHost = null;
  let preflight = null;

  try {
    range = normalizeRange({
      start: options.rangeStart ?? DEFAULT_RANGE_START,
      endInclusive: options.rangeEndInclusive ?? DEFAULT_RANGE_END_INCLUSIVE,
    });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  try {
    repeats = normalizeRepeats(options.repeats ?? DEFAULT_REPEATS);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  try {
    cloudFrontMode = normalizeCloudFrontMode(options.cloudFrontMode);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  if (url === undefined || url === "") {
    const result = createResult({
      generatedAt,
      url: null,
      range,
      repeats,
      origin,
      expectedHost,
      cloudFrontMode,
      runEvidence,
      preflight,
      responses,
      failures: [
        ...failures,
        "No deployed edge URL was provided by --url or COPC_DEPLOYED_EDGE_URL.",
      ],
      verdict: "skipped",
    });
    await writeJsonAtomic(outputPath, result);
    return result;
  }

  let parsedUrl;
  try {
    parsedUrl = validateUrl(url);
  } catch (error) {
    failures.push(error.message);
  }

  try {
    origin = validateOrigin(options.origin ?? process.env.COPC_DEPLOYED_EDGE_ORIGIN);
  } catch (error) {
    failures.push(error.message);
  }

  try {
    expectedHost = validateExpectedHost(
      options.expectedHost ?? process.env.COPC_DEPLOYED_EDGE_EXPECTED_HOST,
      { required: cloudFrontMode === "cloudfront" },
    );
    if (
      parsedUrl !== undefined &&
      expectedHost !== null &&
      parsedUrl.hostname.toLowerCase() !== expectedHost
    ) {
      failures.push(
        `Deployed edge URL hostname (${parsedUrl.hostname}) does not match expected host (${expectedHost}).`,
      );
    }
  } catch (error) {
    failures.push(error.message);
  }

  if (typeof fetchImplementation !== "function") {
    failures.push("A fetch implementation is required.");
  }

  if (failures.length === 0 && range !== null && repeats !== null) {
    const preflightStartedAt = performance.now();
    preflight = await fetchAndValidatePreflight({
      fetchImplementation,
      url: parsedUrl.toString(),
      origin,
      range,
      startedAt: preflightStartedAt,
    });
    failures.push(...preflight.failures.map((failure) => `preflight: ${failure}`));
  }

  if (failures.length === 0 && range !== null && repeats !== null) {
    let ifRangeValidator = null;
    for (let repeat = 1; repeat <= repeats; repeat += 1) {
      const startedAt = performance.now();
      try {
        const entry = await fetchAndValidateRepeat({
          fetchImplementation,
          url: parsedUrl.toString(),
          origin,
          range,
          repeat,
          ifRangeValidator,
          startedAt,
        });
        responses.push(entry);
        if (ifRangeValidator === null && isStrongEtag(entry.response?.etag)) {
          ifRangeValidator = entry.response.etag;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`repeat ${repeat}: ${message}`);
        responses.push({
          repeat,
          status: "failed",
          durationMilliseconds: performance.now() - startedAt,
          error: message,
        });
        break;
      }
    }
  }

  if (range !== null) {
    failures.push(...validateCrossRepeatInvariants(responses, range));
  }
  if (options.cloudFrontMode === undefined) {
    cloudFrontMode = detectCloudFrontMode(responses);
  }
  if (
    cloudFrontMode === "cloudfront" &&
    expectedHost === null &&
    options.cloudFrontMode === undefined
  ) {
    failures.push(
      "CloudFront mode requires --expected-host or COPC_DEPLOYED_EDGE_EXPECTED_HOST.",
    );
  }
  if (cloudFrontMode === "cloudfront" && responses.length > 0) {
    failures.push(...validateCloudFrontHit(responses));
  }

  const result = createResult({
    generatedAt,
    url: parsedUrl?.toString() ?? url,
    origin,
    expectedHost,
    range,
    repeats,
    cloudFrontMode,
    runEvidence,
    preflight,
    responses,
    failures,
    verdict: failures.length === 0 ? "passed" : "failed",
  });
  await writeJsonAtomic(outputPath, result);
  return result;
}

export function parseCliArgs(argv = process.argv.slice(2), environment = process.env) {
  const positionalArguments = readPositionalArgs(argv);
  if (positionalArguments.length > 3) {
    throw new Error(
      "At most three positional arguments are allowed: deployed URL, viewer origin, and expected host.",
    );
  }
  const urlArgument = readStringArg(argv, "--url");
  const originArgument = readStringArg(argv, "--origin");
  const expectedHostArgument = readStringArg(argv, "--expected-host");
  if (
    positionalArguments.length > 0 &&
    (
      urlArgument !== undefined ||
      originArgument !== undefined ||
      expectedHostArgument !== undefined
    )
  ) {
    throw new Error(
      "Do not mix positional deployment arguments with --url, --origin, or --expected-host.",
    );
  }

  return {
    url: urlArgument ?? positionalArguments[0] ?? environment.COPC_DEPLOYED_EDGE_URL,
    origin: originArgument ?? positionalArguments[1] ?? environment.COPC_DEPLOYED_EDGE_ORIGIN,
    expectedHost: expectedHostArgument ??
      positionalArguments[2] ??
      environment.COPC_DEPLOYED_EDGE_EXPECTED_HOST,
    outputPath: readStringArg(argv, "--output") ?? DEFAULT_OUTPUT_PATH,
    repeats: readOptionalIntegerArg(argv, "--repeats"),
    rangeStart: readOptionalIntegerArg(argv, "--range-start"),
    rangeEndInclusive: readOptionalIntegerArg(argv, "--range-end"),
    cloudFrontMode: readFlag(argv, "--cloudfront") ? "cloudfront" : undefined,
  };
}

function validateUrl(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new DeployedEdgeRangeQcError("Deployed edge URL is invalid.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new DeployedEdgeRangeQcError("Deployed edge URL must use HTTPS.");
  }
  if (parsedUrl.username !== "" || parsedUrl.password !== "") {
    throw new DeployedEdgeRangeQcError("Deployed edge URL must not include credentials.");
  }
  if (parsedUrl.port !== "") {
    throw new DeployedEdgeRangeQcError("Deployed edge URL must use the default HTTPS port.");
  }
  if (parsedUrl.hash !== "") {
    throw new DeployedEdgeRangeQcError("Deployed edge URL must not include a fragment.");
  }
  if (parsedUrl.search !== "") {
    throw new DeployedEdgeRangeQcError(
      "Deployed edge URL must use an immutable path without a query string.",
    );
  }

  return parsedUrl;
}

function validateOrigin(origin) {
  if (origin === undefined || origin === "") {
    throw new DeployedEdgeRangeQcError(
      "A deployed edge viewer origin is required by --origin or COPC_DEPLOYED_EDGE_ORIGIN.",
    );
  }

  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new DeployedEdgeRangeQcError("Deployed edge viewer origin is invalid.");
  }

  if (parsedOrigin.protocol !== "https:" && parsedOrigin.protocol !== "http:") {
    throw new DeployedEdgeRangeQcError("Deployed edge viewer origin must use HTTP or HTTPS.");
  }
  if (parsedOrigin.username !== "" || parsedOrigin.password !== "") {
    throw new DeployedEdgeRangeQcError("Deployed edge viewer origin must not include credentials.");
  }
  if (
    parsedOrigin.pathname !== "/" ||
    parsedOrigin.search !== "" ||
    parsedOrigin.hash !== ""
  ) {
    throw new DeployedEdgeRangeQcError(
      "Deployed edge viewer origin must be origin-only, for example https://viewer.example.com.",
    );
  }

  return parsedOrigin.origin;
}

function validateExpectedHost(expectedHost, { required }) {
  if (expectedHost === undefined || expectedHost === "") {
    if (required) {
      throw new DeployedEdgeRangeQcError(
        "CloudFront mode requires --expected-host or COPC_DEPLOYED_EDGE_EXPECTED_HOST.",
      );
    }
    return null;
  }
  if (!/^[A-Za-z0-9.-]+$/.test(expectedHost)) {
    throw new DeployedEdgeRangeQcError(
      "Expected host must be a hostname without a scheme, path, port, or wildcard.",
    );
  }

  let parsedHost;
  try {
    parsedHost = new URL(`https://${expectedHost}`);
  } catch {
    throw new DeployedEdgeRangeQcError("Expected host is invalid.");
  }
  if (parsedHost.hostname.toLowerCase() !== expectedHost.toLowerCase()) {
    throw new DeployedEdgeRangeQcError("Expected host must use its canonical ASCII hostname.");
  }
  return parsedHost.hostname.toLowerCase();
}

function normalizeRange({ start, endInclusive }) {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(endInclusive) ||
    start < 0 ||
    endInclusive < start
  ) {
    throw new TypeError("Range bounds must be safe non-negative integers with start <= end.");
  }

  const byteLength = endInclusive - start + 1;
  if (byteLength > MAX_RANGE_BYTE_LENGTH) {
    throw new TypeError("Range byte length must not exceed 2 MiB.");
  }

  return {
    start,
    endInclusive,
    byteLength,
    header: `bytes=${start}-${endInclusive}`,
  };
}

function normalizeRepeats(repeats) {
  if (!Number.isSafeInteger(repeats) || repeats < 2 || repeats > 5) {
    throw new TypeError("repeats must be a safe integer between 2 and 5.");
  }
  return repeats;
}

async function readResponseBodyCapped(response, maximumBytes) {
  if (response.body === null) {
    return { bytes: new Uint8Array(), capped: false };
  }
  if (typeof response.body.getReader !== "function") {
    throw new DeployedEdgeRangeQcError(
      "A streaming response body is required for bounded deployed-edge QC reads.",
    );
  }

  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;
  let capped = false;
  try {
    while (byteLength < maximumBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new DeployedEdgeRangeQcError("Response body chunks must be Uint8Array values.");
      }

      const remaining = maximumBytes - byteLength;
      if (value.byteLength >= remaining) {
        chunks.push(value.subarray(0, remaining));
        byteLength += remaining;
        capped = true;
        await reader.cancel("deployed-edge QC response body cap reached");
        break;
      }
      chunks.push(value);
      byteLength += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, capped };
}

async function fetchAndValidateRepeat({
  fetchImplementation,
  url,
  origin,
  expectedHost,
  range,
  repeat,
  ifRangeValidator,
  startedAt,
}) {
  const requestHeaders = {
    Range: range.header,
    Origin: origin,
  };
  if (ifRangeValidator !== null) {
    requestHeaders["If-Range"] = ifRangeValidator;
  }

  const response = await fetchImplementation(url, {
    method: "GET",
    redirect: "error",
    credentials: "omit",
    headers: requestHeaders,
  });
  const headers = normalizeHeaders(response.headers);
  const bodyRead = await readResponseBodyCapped(response, range.byteLength + 1);
  const failures = validateSingleResponse({
    response,
    headers,
    body: bodyRead.bytes,
    bodyReadCapped: bodyRead.capped,
    range,
    origin,
    expectedHost,
  });
  const sha256 = bodyRead.capped || bodyRead.bytes.byteLength !== range.byteLength
    ? null
    : createHash("sha256").update(bodyRead.bytes).digest("hex");

  return {
    repeat,
    status: failures.length === 0 ? "passed" : "failed",
    durationMilliseconds: performance.now() - startedAt,
    request: {
      method: "GET",
      range: range.header,
      ifRange: ifRangeValidator,
      origin,
      credentials: "omit",
      redirect: "error",
    },
    response: {
      status: response.status,
      contentRange: headers.get("content-range") ?? null,
      contentLength: headers.get("content-length") ?? null,
      acceptRanges: headers.get("accept-ranges") ?? null,
      etag: headers.get("etag") ?? null,
      total: parseContentRange(headers.get("content-range"))?.total ?? null,
      bodyByteLength: bodyRead.bytes.byteLength,
      bodyReadCapped: bodyRead.capped,
      bodySha256: sha256,
      cors: {
        accessControlAllowOrigin: headers.get("access-control-allow-origin") ?? null,
        accessControlExposeHeaders: headers.get("access-control-expose-headers") ?? null,
      },
      edgeLedger: {
        xCache: headers.get("x-cache") ?? null,
        age: headers.get("age") ?? null,
        via: headers.get("via") ?? null,
        xAmzCfPop: headers.get("x-amz-cf-pop") ?? null,
      },
    },
    failures,
  };
}

async function fetchAndValidatePreflight({
  fetchImplementation,
  url,
  origin,
  range,
  startedAt,
}) {
  try {
    const response = await fetchImplementation(url, {
      method: "OPTIONS",
      redirect: "error",
      credentials: "omit",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Range, If-Range, If-None-Match",
      },
    });
    const headers = normalizeHeaders(response.headers);
    const failures = validatePreflightResponse({ response, headers, origin });

    return {
      status: failures.length === 0 ? "passed" : "failed",
      durationMilliseconds: performance.now() - startedAt,
      request: {
        method: "OPTIONS",
        origin,
        accessControlRequestMethod: "GET",
        accessControlRequestHeaders: "Range, If-Range, If-None-Match",
        credentials: "omit",
        redirect: "error",
      },
      response: {
        status: response.status,
        accessControlAllowOrigin: headers.get("access-control-allow-origin") ?? null,
        accessControlAllowMethods: headers.get("access-control-allow-methods") ?? null,
        accessControlAllowHeaders: headers.get("access-control-allow-headers") ?? null,
        accessControlMaxAge: headers.get("access-control-max-age") ?? null,
      },
      range: range.header,
      failures,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      durationMilliseconds: performance.now() - startedAt,
      request: {
        method: "OPTIONS",
        origin,
        accessControlRequestMethod: "GET",
        accessControlRequestHeaders: "Range, If-Range, If-None-Match",
        credentials: "omit",
        redirect: "error",
      },
      response: null,
      range: range.header,
      failures: [message],
    };
  }
}

function validatePreflightResponse({ response, headers, origin }) {
  const failures = [];
  if (response.status !== 200 && response.status !== 204) {
    failures.push(`Expected CORS preflight HTTP 200 or 204, received ${response.status}.`);
  }
  validateAllowedCorsOrigin(headers, origin, failures);

  const allowedMethods = parseCommaHeader(headers.get("access-control-allow-methods"));
  if (!allowedMethods.has("get")) {
    failures.push("Access-Control-Allow-Methods must include GET.");
  }

  const allowedHeaders = parseCommaHeader(headers.get("access-control-allow-headers"));
  for (const requiredHeader of ["range", "if-range", "if-none-match"]) {
    if (!allowedHeaders.has(requiredHeader)) {
      failures.push(`Access-Control-Allow-Headers must include ${requiredHeader}.`);
    }
  }

  return failures;
}

function validateSingleResponse({
  response,
  headers,
  body,
  bodyReadCapped,
  range,
  origin,
}) {
  const failures = [];

  if (response.status !== 206) {
    failures.push(`Expected HTTP 206, received ${response.status}.`);
  }

  const parsedContentRange = parseContentRange(headers.get("content-range"));
  if (parsedContentRange === null) {
    failures.push("Content-Range must use bytes start-end/total.");
  } else {
    if (
      parsedContentRange.start !== range.start ||
      parsedContentRange.end !== range.endInclusive
    ) {
      failures.push(
        `Content-Range must be bytes ${range.start}-${range.endInclusive}/total.`,
      );
    }
    if (parsedContentRange.total <= range.endInclusive) {
      failures.push("Content-Range total must exceed the requested range end.");
    }
  }

  if (headers.get("content-length") !== String(range.byteLength)) {
    failures.push(`Content-Length must be ${range.byteLength}.`);
  }
  if (bodyReadCapped) {
    failures.push(
      `Body exceeded the requested ${range.byteLength} bytes; the QC read was capped.`,
    );
  } else if (body.byteLength !== range.byteLength) {
    failures.push(`Body length must be ${range.byteLength} bytes.`);
  }
  if (headers.get("accept-ranges")?.toLowerCase() !== "bytes") {
    failures.push("Accept-Ranges must be bytes.");
  }
  if (!isStrongEtag(headers.get("etag"))) {
    failures.push("ETag must be a strong validator.");
  }
  validateAllowedCorsOrigin(headers, origin, failures);

  const exposedHeaders = parseCommaHeader(headers.get("access-control-expose-headers"));
  for (const requiredHeader of requiredExposedHeaders) {
    if (!exposedHeaders.has(requiredHeader)) {
      failures.push(`Access-Control-Expose-Headers must include ${requiredHeader}.`);
    }
  }

  return failures;
}

function validateAllowedCorsOrigin(headers, origin, failures) {
  const allowedOrigin = headers.get("access-control-allow-origin");
  if (allowedOrigin !== "*" && allowedOrigin !== origin) {
    failures.push(
      `Access-Control-Allow-Origin must be * or the requested origin (${origin}).`,
    );
  }
}

function validateCrossRepeatInvariants(responses, range) {
  const failures = responses.flatMap((entry) =>
    entry.failures?.map((failure) => `repeat ${entry.repeat}: ${failure}`) ?? [],
  );
  const passed = responses.filter((entry) => entry.status === "passed");
  if (passed.length !== responses.length || passed.length === 0) {
    return failures;
  }

  const first = passed[0].response;
  for (const entry of passed.slice(1)) {
    if (entry.response.total !== first.total) {
      failures.push(`repeat ${entry.repeat}: total changed from ${first.total} to ${entry.response.total}.`);
    }
    if (entry.response.etag !== first.etag) {
      failures.push(`repeat ${entry.repeat}: ETag changed from ${first.etag} to ${entry.response.etag}.`);
    }
    if (entry.response.bodySha256 !== first.bodySha256) {
      failures.push(`repeat ${entry.repeat}: body SHA-256 changed.`);
    }
  }

  if (first.contentRange !== `bytes ${range.start}-${range.endInclusive}/${first.total}`) {
    failures.push("Content-Range did not remain exact after total parsing.");
  }

  return failures;
}

function detectCloudFrontMode(responses) {
  return responses.some((entry) => {
    const ledger = entry.response?.edgeLedger;
    return ledger?.xAmzCfPop !== null ||
      /cloudfront/i.test(ledger?.via ?? "") ||
      /cloudfront/i.test(ledger?.xCache ?? "");
  })
    ? "cloudfront"
    : "generic-cdn";
}

function normalizeCloudFrontMode(value) {
  if (value === true || value === "cloudfront") {
    return "cloudfront";
  }
  if (value === false || value === undefined || value === "generic-cdn") {
    return "generic-cdn";
  }
  throw new TypeError("cloudFrontMode must be cloudfront or generic-cdn.");
}

function validateCloudFrontHit(responses) {
  const hasCloudFrontIdentity = responses.some((entry) => {
    const ledger = entry.response?.edgeLedger;
    return /cloudfront/i.test(ledger?.via ?? "") ||
      /from cloudfront/i.test(ledger?.xCache ?? "") ||
      typeof ledger?.xAmzCfPop === "string" && ledger.xAmzCfPop.trim() !== "";
  });
  const hasRepeatHit = responses
    .filter((entry) => entry.repeat > 1)
    .some((entry) => /^(?:refresh)?hit from cloudfront$/i.test(
      entry.response?.edgeLedger?.xCache?.trim() ?? "",
    ));

  const failures = [];
  if (!hasCloudFrontIdentity) {
    failures.push("CloudFront mode requires CloudFront response identity evidence.");
  }
  if (!hasRepeatHit) {
    failures.push("CloudFront mode requires at least one repeated request X-Cache: Hit from cloudfront.");
  }
  return failures;
}

function createResult({
  generatedAt,
  url,
  origin,
  expectedHost,
  range,
  repeats,
  cloudFrontMode,
  runEvidence,
  preflight,
  responses,
  failures,
  verdict,
}) {
  return {
    schema: "copc-viewer.deployed-edge-range-qc",
    schemaVersion: 2,
    generatedAt: generatedAt.toISOString(),
    verdict,
    url,
    origin,
    expectedHost,
    range,
    repeats,
    cloudFrontMode,
    failures,
    runEvidence,
    preflight,
    responses,
  };
}

async function writeJsonAtomic(outputPath, value) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, outputPath);
}

function parseContentRange(header) {
  if (typeof header !== "string") {
    return null;
  }

  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header);
  if (match === null) {
    return null;
  }

  const start = Number.parseInt(match[1], 10);
  const end = Number.parseInt(match[2], 10);
  const total = Number.parseInt(match[3], 10);

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(total) ||
    start > end ||
    end >= total
  ) {
    return null;
  }

  return { start, end, total };
}

function normalizeHeaders(headers) {
  const normalized = new Map();
  for (const [name, value] of headers.entries()) {
    normalized.set(name.toLowerCase(), value);
  }
  return normalized;
}

function parseCommaHeader(header) {
  return new Set(
    String(header ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isStrongEtag(etag) {
  return typeof etag === "string" && /^"(?:[^"\\]|\\.)*"$/.test(etag);
}

function readStringArg(argv, name) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== name) {
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${name} requires a value.`);
    }
    values.push(value);
    index += 1;
  }
  if (values.length > 1) {
    throw new Error(`${name} may be provided only once.`);
  }
  return values[0];
}

function readOptionalIntegerArg(argv, name) {
  const rawValue = readStringArg(argv, name);
  if (rawValue === undefined) {
    return undefined;
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer.`);
  }
  return value;
}

function readFlag(argv, name) {
  return argv.includes(name);
}

function readPositionalArgs(argv) {
  const valueOptions = new Set([
    "--url",
    "--origin",
    "--expected-host",
    "--output",
    "--repeats",
    "--range-start",
    "--range-end",
  ]);
  const flagOptions = new Set(["--cloudfront"]);
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (valueOptions.has(argument)) {
      index += 1;
      continue;
    }
    if (flagOptions.has(argument)) continue;
    if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}.`);
    }
    positionals.push(argument);
  }

  return positionals;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;

if (invokedPath === fileURLToPath(import.meta.url)) {
  let outputPath = DEFAULT_OUTPUT_PATH;
  try {
    const options = parseCliArgs();
    outputPath = path.resolve(options.outputPath ?? DEFAULT_OUTPUT_PATH);
    const result = await runDeployedEdgeRangeQc(options);
    console.log(`Deployed edge range QC written: ${outputPath}`);
    if (result.verdict === "skipped") {
      console.error("No deployed edge URL was provided; no network request was made.");
      process.exitCode = 2;
    } else if (result.verdict !== "passed") {
      console.error("Deployed edge range QC failed.");
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeJsonAtomic(outputPath, createResult({
      generatedAt: new Date(),
      url: null,
      origin: null,
      expectedHost: null,
      range: null,
      repeats: null,
      cloudFrontMode: "generic-cdn",
      runEvidence: await createRunEvidence(),
      preflight: null,
      responses: [],
      failures: [message],
      verdict: "failed",
    }));
    console.error(message);
    process.exitCode = 1;
  }
}
