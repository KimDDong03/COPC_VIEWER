import type { Getter } from "copc";
import {
  createCachedRangeGetter,
  type CopcRangeGetterCacheOptions,
} from "./createCachedRangeGetter";

const MAX_RANGE_REQUEST_ATTEMPTS = 3;
const RANGE_REQUEST_RETRY_DELAY_MILLISECONDS = 75;
const DEFAULT_MAX_RANGE_BYTE_LENGTH = 256 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const MAX_TIMER_DELAY_MILLISECONDS = 2_147_483_647;

export interface CopcHttpRangeGetterOptions
  extends CopcRangeGetterCacheOptions {
  /** Maximum number of bytes accepted in one half-open range request. */
  readonly maxRangeByteLength?: number;
  /** Per-attempt HTTP deadline. The default is 30 seconds. */
  readonly requestTimeoutMilliseconds?: number;
  /** Optional lifetime signal combined with the per-request timeout signal. */
  readonly signal?: AbortSignal;
}

class RetriableCopcRangeRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetriableCopcRangeRequestError";
  }
}

export function createHttpRangeGetter(
  url: string,
  options: CopcHttpRangeGetterOptions = {},
): Getter {
  const parsedUrl = createHttpUrl(url);
  const maxRangeByteLength = readPositiveSafeIntegerOption(
    "maxRangeByteLength",
    options.maxRangeByteLength,
    DEFAULT_MAX_RANGE_BYTE_LENGTH,
  );
  const requestTimeoutMilliseconds = readPositiveSafeIntegerOption(
    "requestTimeoutMilliseconds",
    options.requestTimeoutMilliseconds,
    DEFAULT_REQUEST_TIMEOUT_MILLISECONDS,
    MAX_TIMER_DELAY_MILLISECONDS,
  );

  return createCachedRangeGetter(async (begin: number, end: number) => {
    const byteLength = validateByteRange(begin, end, maxRangeByteLength);

    if (byteLength === 0) {
      return new Uint8Array();
    }

    return fetchRangeWithRetries(
      parsedUrl,
      begin,
      end,
      requestTimeoutMilliseconds,
      options.signal,
    );
  }, options);
}

async function fetchRangeWithRetries(
  parsedUrl: URL,
  begin: number,
  end: number,
  requestTimeoutMilliseconds: number,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  let lastError: unknown;

  throwIfAborted(signal);

  for (let attempt = 1; attempt <= MAX_RANGE_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return await fetchRange(
        parsedUrl,
        begin,
        end,
        requestTimeoutMilliseconds,
        signal,
      );
    } catch (error) {
      lastError = error;

      if (
        attempt === MAX_RANGE_REQUEST_ATTEMPTS ||
        !isRetriableRangeRequestError(error)
      ) {
        throw error;
      }

      await delayRangeRequestRetry(attempt, signal);
    }
  }

  throw lastError;
}

async function fetchRange(
  parsedUrl: URL,
  begin: number,
  end: number,
  requestTimeoutMilliseconds: number,
  callerSignal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const abortContext = createRequestAbortContext(
    callerSignal,
    requestTimeoutMilliseconds,
  );

  try {
    throwIfRequestAborted(abortContext, callerSignal);

    const response = await fetch(parsedUrl.toString(), {
      headers: {
        Range: `bytes=${begin}-${end - 1}`,
      },
      signal: abortContext.signal,
    });

    throwIfRequestAborted(abortContext, callerSignal);

    if (!response.ok) {
      if (isRetriableHttpStatus(response.status)) {
        throw new RetriableCopcRangeRequestError(
          `COPC range request failed with HTTP ${response.status}.`,
        );
      }

      throw new Error(`COPC range request failed with HTTP ${response.status}.`);
    }

    if (response.status !== 206) {
      throw new Error("COPC source must support HTTP range requests.");
    }

    const contentRange = response.headers.get("Content-Range");

    if (contentRange !== null) {
      validateContentRange(contentRange, begin, end);
    }

    const expectedByteLength = end - begin;
    const bytes = await readExactRangeResponseBody(
      response,
      expectedByteLength,
    );

    throwIfRequestAborted(abortContext, callerSignal);
    return bytes;
  } catch (error) {
    if (abortContext.abortSource === "caller") {
      throw createAbortError(callerSignal);
    }

    if (abortContext.abortSource === "timeout") {
      throw new CopcRangeRequestTimeoutError(requestTimeoutMilliseconds);
    }

    throw error;
  } finally {
    abortContext.cleanup();
  }
}

class CopcRangeRequestTimeoutError extends Error {
  constructor(timeoutMilliseconds: number) {
    super(
      `COPC range request timed out after ${timeoutMilliseconds} milliseconds.`,
    );
    this.name = "CopcRangeRequestTimeoutError";
  }
}

interface RequestAbortContext {
  readonly signal: AbortSignal;
  readonly abortSource: "caller" | "timeout" | undefined;
  readonly cleanup: () => void;
}

function createRequestAbortContext(
  callerSignal: AbortSignal | undefined,
  timeoutMilliseconds: number,
): RequestAbortContext {
  const controller = new AbortController();
  let abortSource: "caller" | "timeout" | undefined;
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

  const abortForCaller = (): void => {
    if (abortSource !== undefined) {
      return;
    }

    abortSource = "caller";
    controller.abort(callerSignal?.reason);
  };
  const abortForTimeout = (): void => {
    if (abortSource !== undefined) {
      return;
    }

    abortSource = "timeout";
    controller.abort(new CopcRangeRequestTimeoutError(timeoutMilliseconds));
  };

  if (callerSignal?.aborted) {
    abortForCaller();
  } else {
    callerSignal?.addEventListener("abort", abortForCaller, { once: true });
    timeoutId = globalThis.setTimeout(abortForTimeout, timeoutMilliseconds);
  }

  return {
    signal: controller.signal,
    get abortSource() {
      return abortSource;
    },
    cleanup: () => {
      if (timeoutId !== undefined) {
        globalThis.clearTimeout(timeoutId);
      }

      callerSignal?.removeEventListener("abort", abortForCaller);
    },
  };
}

function throwIfRequestAborted(
  context: RequestAbortContext,
  callerSignal: AbortSignal | undefined,
): void {
  if (context.abortSource === "caller") {
    throw createAbortError(callerSignal);
  }

  if (context.abortSource === "timeout") {
    throw context.signal.reason;
  }
}

async function readExactRangeResponseBody(
  response: Response,
  expectedByteLength: number,
): Promise<Uint8Array> {
  if (!response.body) {
    throw createBodyLengthMismatchError(expectedByteLength, 0);
  }

  const bytes = new Uint8Array(expectedByteLength);
  const reader = response.body.getReader();
  let receivedByteLength = 0;
  let completed = false;

  try {
    while (true) {
      const chunk = await reader.read();

      if (chunk.done) {
        completed = true;
        break;
      }

      const nextByteLength = receivedByteLength + chunk.value.byteLength;

      if (nextByteLength > expectedByteLength) {
        throw createBodyLengthMismatchError(
          expectedByteLength,
          nextByteLength,
        );
      }

      bytes.set(chunk.value, receivedByteLength);
      receivedByteLength = nextByteLength;
    }
  } finally {
    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }

    reader.releaseLock();
  }

  if (receivedByteLength !== expectedByteLength) {
    throw createBodyLengthMismatchError(
      expectedByteLength,
      receivedByteLength,
    );
  }

  return bytes;
}

function createBodyLengthMismatchError(
  expectedByteLength: number,
  receivedByteLength: number,
): Error {
  return new Error(
    `COPC range response body length mismatch: expected ${expectedByteLength} bytes, received ${receivedByteLength}.`,
  );
}

function validateContentRange(
  contentRange: string,
  begin: number,
  end: number,
): void {
  const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(contentRange);

  if (!match) {
    throw new Error(
      `COPC range response has malformed Content-Range: ${contentRange}.`,
    );
  }

  const responseBegin = Number(match[1]);
  const responseEnd = Number(match[2]);

  if (
    !Number.isSafeInteger(responseBegin) ||
    !Number.isSafeInteger(responseEnd)
  ) {
    throw new Error(
      `COPC range response has malformed Content-Range: ${contentRange}.`,
    );
  }

  const expectedEnd = end - 1;

  if (responseBegin !== begin || responseEnd !== expectedEnd) {
    throw new Error(
      `COPC range response Content-Range mismatch: expected bytes ${begin}-${expectedEnd}, received bytes ${responseBegin}-${responseEnd}.`,
    );
  }

  const completeLength = match[3];

  if (
    completeLength !== "*" &&
    BigInt(completeLength) <= BigInt(responseEnd)
  ) {
    throw new Error(
      `COPC range response has malformed Content-Range: ${contentRange}.`,
    );
  }
}

function createHttpUrl(url: string): URL {
  const baseUrl =
    typeof globalThis.location?.href === "string"
      ? globalThis.location.href
      : undefined;
  const parsedUrl = baseUrl ? new URL(url, baseUrl) : new URL(url);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS COPC URLs are supported.");
  }

  return parsedUrl;
}

function isRetriableRangeRequestError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    error instanceof RetriableCopcRangeRequestError
  );
}

function isRetriableHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function delayRangeRequestRetry(
  attempt: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const finish = (): void => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const abort = (): void => {
      globalThis.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abort);
      reject(createAbortError(signal));
    };
    const timeoutId = globalThis.setTimeout(
      finish,
      RANGE_REQUEST_RETRY_DELAY_MILLISECONDS * attempt,
    );

    signal?.addEventListener("abort", abort, { once: true });
  });
}

function validateByteRange(
  begin: number,
  end: number,
  maxRangeByteLength: number,
): number {
  if (
    !Number.isSafeInteger(begin) ||
    !Number.isSafeInteger(end) ||
    begin < 0 ||
    end < begin
  ) {
    throw new Error(`Invalid byte range: ${begin}-${end}`);
  }

  const byteLength = end - begin;

  if (byteLength > maxRangeByteLength) {
    throw new Error(
      `COPC byte range length ${byteLength} exceeds the configured maximum of ${maxRangeByteLength} bytes.`,
    );
  }

  return byteLength;
}

function readPositiveSafeIntegerOption(
  name: string,
  value: number | undefined,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const resolved = value ?? fallback;

  if (
    !Number.isSafeInteger(resolved) ||
    resolved <= 0 ||
    resolved > maximum
  ) {
    throw new Error(
      `${name} must be a positive integer no greater than ${maximum}.`,
    );
  }

  return resolved;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createAbortError(signal);
  }
}

function createAbortError(signal: AbortSignal | undefined): Error {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }

  return new DOMException("The operation was aborted.", "AbortError");
}
