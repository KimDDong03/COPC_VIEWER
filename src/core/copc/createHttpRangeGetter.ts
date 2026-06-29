import type { Getter } from "copc";

export function createHttpRangeGetter(url: string): Getter {
  const parsedUrl = new URL(url);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS COPC URLs are supported in this prototype.");
  }

  return async (begin: number, end: number): Promise<Uint8Array> => {
    if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || begin < 0 || end <= begin) {
      throw new Error(`Invalid byte range: ${begin}-${end}`);
    }

    const response = await fetch(parsedUrl.toString(), {
      headers: {
        Range: `bytes=${begin}-${end - 1}`,
      },
    });

    if (!response.ok) {
      throw new Error(`COPC range request failed with HTTP ${response.status}.`);
    }

    if (response.status !== 206) {
      throw new Error("COPC source must support HTTP range requests.");
    }

    return new Uint8Array(await response.arrayBuffer());
  };
}
