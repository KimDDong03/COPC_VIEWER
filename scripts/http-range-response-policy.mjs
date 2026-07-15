export function summarizeRecoveredHttpRangeResponses(
  responses,
  expectedOrigin,
) {
  const normalizedOrigin = new URL(expectedOrigin).origin;
  const successfulResponseIndexesByRequest = new Map();

  responses.forEach((response, index) => {
    if (!isSuccessfulHttpRangeResponse(response, normalizedOrigin)) {
      return;
    }

    const key = createRequestKey(response);
    const indexes = successfulResponseIndexesByRequest.get(key) ?? [];
    indexes.push(index);
    successfulResponseIndexesByRequest.set(key, indexes);
  });

  const invalidResponses = [];
  let recoveredTransientFailureCount = 0;

  responses.forEach((response, index) => {
    if (isSuccessfulHttpRangeResponse(response, normalizedOrigin)) {
      return;
    }

    const laterSuccess =
      isRetriableHttpStatus(response?.status) &&
      (successfulResponseIndexesByRequest.get(createRequestKey(response)) ?? [])
        .some((successIndex) => successIndex > index);

    if (laterSuccess) {
      recoveredTransientFailureCount += 1;
    } else {
      invalidResponses.push(response);
    }
  });

  return {
    passed:
      responses.length > 0 &&
      successfulResponseIndexesByRequest.size > 0 &&
      invalidResponses.length === 0,
    responseCount: responses.length,
    successfulRequestCount: successfulResponseIndexesByRequest.size,
    recoveredTransientFailureCount,
    invalidResponses,
  };
}

function isSuccessfulHttpRangeResponse(response, expectedOrigin) {
  if (
    typeof response?.url !== "string" ||
    new URL(response.url).origin !== expectedOrigin ||
    response.method !== "GET" ||
    typeof response.range !== "string" ||
    response.status !== 206 ||
    typeof response.contentRange !== "string"
  ) {
    return false;
  }

  const requested = /^bytes=(\d+)-(\d+)$/.exec(response.range);
  const received = /^bytes (\d+)-(\d+)\/(?:\d+|\*)$/.exec(
    response.contentRange,
  );

  return (
    requested !== null &&
    received !== null &&
    requested[1] === received[1] &&
    requested[2] === received[2]
  );
}

function isRetriableHttpStatus(status) {
  return status === 429 || (Number.isInteger(status) && status >= 500);
}

function createRequestKey(response) {
  return `${response?.method ?? ""}\n${response?.url ?? ""}\n${response?.range ?? ""}`;
}
