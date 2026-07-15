const rangeBegin = 0;
const rangeEndInclusive = 63;
const expectedByteLength = rangeEndInclusive - rangeBegin + 1;

export class LiveCopcRangeError extends Error {
  constructor(message, classification, options = {}) {
    super(message, options);
    this.name = "LiveCopcRangeError";
    this.classification = classification;
  }
}

export async function probeLiveCopcRangeSource({
  id,
  url,
  timeoutMilliseconds = 15_000,
  fetchImplementation = globalThis.fetch,
}) {
  validateSource(id, url);

  if (!Number.isSafeInteger(timeoutMilliseconds) || timeoutMilliseconds <= 0) {
    throw new Error("timeoutMilliseconds must be a positive safe integer.");
  }

  if (typeof fetchImplementation !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutError = new Error(
    `Live COPC range probe timed out after ${timeoutMilliseconds} milliseconds.`,
  );
  timeoutError.name = "TimeoutError";
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort(timeoutError);
  }, timeoutMilliseconds);

  try {
    let response;

    try {
      response = await fetchImplementation(url, {
        headers: {
          Range: `bytes=${rangeBegin}-${rangeEndInclusive}`,
        },
        redirect: "follow",
        signal: controller.signal,
      });
    } catch (error) {
      throw toLiveSourceAvailabilityError(error, id, url);
    }

    if (!response.ok) {
      const classification = isAvailabilityStatus(response.status)
        ? "external-source-unavailable"
        : "live-source-contract-failure";

      throw new LiveCopcRangeError(
        `${id} live COPC range probe returned HTTP ${response.status}.`,
        classification,
      );
    }

    if (response.status !== 206) {
      throw new LiveCopcRangeError(
        `${id} live COPC source returned HTTP ${response.status}; expected 206 Partial Content.`,
        "live-source-contract-failure",
      );
    }

    const contentRange = response.headers.get("content-range");
    const completeByteLength = validateContentRange(contentRange, id);
    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.byteLength !== expectedByteLength) {
      throw new LiveCopcRangeError(
        `${id} live COPC range body was ${bytes.byteLength} bytes; expected ${expectedByteLength}.`,
        "live-source-contract-failure",
      );
    }

    if (
      bytes[0] !== 0x4c ||
      bytes[1] !== 0x41 ||
      bytes[2] !== 0x53 ||
      bytes[3] !== 0x46
    ) {
      throw new LiveCopcRangeError(
        `${id} live COPC range did not begin with the LASF file signature.`,
        "live-source-contract-failure",
      );
    }

    return {
      id,
      url,
      status: "passed",
      classification: "live-range-verified",
      durationMilliseconds: performance.now() - startedAt,
      request: {
        method: "GET",
        range: `bytes=${rangeBegin}-${rangeEndInclusive}`,
      },
      response: {
        status: response.status,
        contentRange,
        byteLength: bytes.byteLength,
        completeByteLength,
        fileSignature: "LASF",
      },
    };
  } catch (error) {
    const liveError =
      error instanceof LiveCopcRangeError
        ? error
        : toLiveSourceAvailabilityError(error, id, url);

    return {
      id,
      url,
      status:
        liveError.classification === "external-source-unavailable"
          ? "unavailable"
          : "failed",
      classification: liveError.classification,
      durationMilliseconds: performance.now() - startedAt,
      error: liveError.message,
    };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export function classifyLiveCopcExecutionFailure(output) {
  const text = String(output ?? "");

  if (
    /COPC range request timed out after \d+ milliseconds/i.test(text) ||
    /Live COPC range probe timed out after \d+ milliseconds/i.test(text) ||
    /net::ERR_(?:CONNECTION|INTERNET|NAME_NOT_RESOLVED|NETWORK_CHANGED|TIMED_OUT)/i.test(
      text,
    ) ||
    /COPC range request failed with HTTP (?:408|425|429|5\d\d)\b/i.test(text)
  ) {
    return "external-source-unavailable";
  }

  if (/Smoothness (?:benchmark|regression) assertion failed/i.test(text)) {
    return "performance-regression";
  }

  return "benchmark-execution-failure";
}

function validateSource(id, url) {
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error("Live COPC source id must be a non-empty string.");
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`${id} live COPC source URL is invalid.`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`${id} live COPC source must use HTTP or HTTPS.`);
  }
}

function validateContentRange(contentRange, id) {
  const match = /^bytes 0-63\/(\d+)$/i.exec(contentRange ?? "");

  if (!match) {
    throw new LiveCopcRangeError(
      `${id} live COPC source returned an invalid Content-Range header: ${contentRange ?? "<missing>"}.`,
      "live-source-contract-failure",
    );
  }

  const completeByteLength = Number(match[1]);

  if (!Number.isSafeInteger(completeByteLength) || completeByteLength <= 64) {
    throw new LiveCopcRangeError(
      `${id} live COPC source returned an invalid complete byte length in Content-Range: ${match[1]}.`,
      "live-source-contract-failure",
    );
  }

  return completeByteLength;
}

function isAvailabilityStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function toLiveSourceAvailabilityError(error, id, url) {
  const causeMessage = error instanceof Error ? error.message : String(error);

  return new LiveCopcRangeError(
    `${id} live COPC source is unavailable at ${url}: ${causeMessage}`,
    "external-source-unavailable",
    { cause: error },
  );
}
