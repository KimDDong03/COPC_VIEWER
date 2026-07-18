import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RANGE_END_INCLUSIVE,
  DEFAULT_RANGE_START,
  parseCliArgs,
  runDeployedEdgeRangeQc,
} from "./deployed-edge-range-qc.mjs";

const sourceBytes = Uint8Array.from({ length: 256 * 1024 }, (_, index) => index % 251);
const runEvidence = {
  schema: "test.run-evidence",
  schemaVersion: 1,
};

describe("deployed edge range QC", () => {
  it("verifies CORS preflight, repeated 206 range responses, and atomic JSON output", async () => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "copc-edge-qc-"));
    try {
      const outputPath = path.join(temporaryDirectory, "result.json");
      const fetchLog = [];
      const result = await runDeployedEdgeRangeQc({
        url: "https://cdn.example/copc/millsite.copc.laz",
        origin: "https://viewer.example",
        outputPath,
        repeats: 3,
        fetchImplementation: createFetch({ fetchLog }),
        runEvidence,
      });
      const written = JSON.parse(await readFile(outputPath, "utf8"));

      expect(result.verdict).toBe("passed");
      expect(result.failures).toEqual([]);
      expect(written.schema).toBe("copc-viewer.deployed-edge-range-qc");
      expect(written.origin).toBe("https://viewer.example");
      expect(written.preflight).toMatchObject({
        status: "passed",
        request: {
          method: "OPTIONS",
          origin: "https://viewer.example",
          accessControlRequestMethod: "GET",
          accessControlRequestHeaders: "Range, If-Range, If-None-Match",
        },
      });
      expect(written.range).toMatchObject({
        start: DEFAULT_RANGE_START,
        endInclusive: DEFAULT_RANGE_END_INCLUSIVE,
        byteLength: 65_536,
        header: "bytes=0-65535",
      });
      expect(written.responses).toHaveLength(3);
      expect(new Set(written.responses.map((entry) => entry.response.bodySha256)).size).toBe(1);
      expect(fetchLog).toEqual([
        { url: "https://cdn.example/copc/millsite.copc.laz", method: "OPTIONS", origin: "https://viewer.example", range: undefined, credentials: "omit", redirect: "error" },
        { url: "https://cdn.example/copc/millsite.copc.laz", method: "GET", origin: "https://viewer.example", range: "bytes=0-65535", credentials: "omit", redirect: "error" },
        { url: "https://cdn.example/copc/millsite.copc.laz", method: "GET", origin: "https://viewer.example", range: "bytes=0-65535", credentials: "omit", redirect: "error" },
        { url: "https://cdn.example/copc/millsite.copc.laz", method: "GET", origin: "https://viewer.example", range: "bytes=0-65535", credentials: "omit", redirect: "error" },
      ]);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("skips network execution when no URL is provided", async () => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "copc-edge-qc-"));
    try {
      const outputPath = path.join(temporaryDirectory, "result.json");
      let fetchCalled = false;
      const result = await runDeployedEdgeRangeQc({
        url: "",
        outputPath,
        fetchImplementation: () => {
          fetchCalled = true;
          throw new Error("should not fetch");
        },
        runEvidence,
      });

      expect(fetchCalled).toBe(false);
      expect(result.verdict).toBe("skipped");
      expect(result.failures).toContain("No deployed edge URL was provided by --url or COPC_DEPLOYED_EDGE_URL.");
      expect(JSON.parse(await readFile(outputPath, "utf8")).verdict).toBe("skipped");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("rejects invalid URLs, origins, ranges, repeat counts, and writes failed artifacts", async () => {
    await expect(runDeployedEdgeRangeQc({
      url: "http://cdn.example/file.copc.laz",
      origin: "https://viewer.example",
      outputPath: tempOutputPath(),
      fetchImplementation: createFetch(),
      runEvidence,
    })).resolves.toMatchObject({
      verdict: "failed",
      failures: [expect.stringMatching(/HTTPS/)],
    });

    await expect(runDeployedEdgeRangeQc({
      url: "https://user:pass@cdn.example/file.copc.laz",
      origin: "https://viewer.example",
      outputPath: tempOutputPath(),
      fetchImplementation: createFetch(),
      runEvidence,
    })).resolves.toMatchObject({
      verdict: "failed",
      failures: [expect.stringMatching(/credentials/)],
    });

    await expect(runDeployedEdgeRangeQc({
      url: "https://cdn.example/file.copc.laz#v1",
      origin: "https://viewer.example",
      outputPath: tempOutputPath(),
      fetchImplementation: createFetch(),
      runEvidence,
    })).resolves.toMatchObject({
      verdict: "failed",
      failures: [expect.stringMatching(/fragment/)],
    });

    await expect(runDeployedEdgeRangeQc({
      url: "https://cdn.example/file.copc.laz?version=v1",
      origin: "https://viewer.example",
      outputPath: tempOutputPath(),
      fetchImplementation: createFetch(),
      runEvidence,
    })).resolves.toMatchObject({
      verdict: "failed",
      failures: [expect.stringMatching(/query string/)],
    });

    await expect(runDeployedEdgeRangeQc({
      url: "https://cdn.example/file.copc.laz",
      outputPath: tempOutputPath(),
      fetchImplementation: createFetch(),
      runEvidence,
    })).resolves.toMatchObject({
      verdict: "failed",
      failures: [expect.stringMatching(/viewer origin is required/)],
    });

    await expect(runDeployedEdgeRangeQc({
      url: "https://cdn.example/file.copc.laz",
      origin: "https://viewer.example/app",
      outputPath: tempOutputPath(),
      fetchImplementation: createFetch(),
      runEvidence,
    })).resolves.toMatchObject({
      verdict: "failed",
      failures: [expect.stringMatching(/origin-only/)],
    });

    const oversizedOutputPath = tempOutputPath();
    await expect(runDeployedEdgeRangeQc({
      url: "https://cdn.example/file.copc.laz",
      origin: "https://viewer.example",
      outputPath: oversizedOutputPath,
      rangeEndInclusive: 2 * 1024 * 1024,
      fetchImplementation: createFetch(),
      runEvidence,
    })).resolves.toMatchObject({
      verdict: "failed",
      failures: [expect.stringMatching(/2 MiB/)],
    });
    expect(JSON.parse(await readFile(oversizedOutputPath, "utf8")).verdict).toBe("failed");

    const repeatsOutputPath = tempOutputPath();
    await expect(runDeployedEdgeRangeQc({
      url: "https://cdn.example/file.copc.laz",
      origin: "https://viewer.example",
      outputPath: repeatsOutputPath,
      repeats: 6,
      fetchImplementation: createFetch(),
      runEvidence,
    })).resolves.toMatchObject({
      verdict: "failed",
      failures: [expect.stringMatching(/between 2 and 5/)],
    });
    expect(JSON.parse(await readFile(repeatsOutputPath, "utf8")).verdict).toBe("failed");
  });

  it("reports CORS preflight contract failures before GET repeats", async () => {
    const fetchLog = [];
    const result = await runDeployedEdgeRangeQc({
      url: "https://cdn.example/file.copc.laz",
      origin: "https://viewer.example",
      outputPath: tempOutputPath(),
      repeats: 2,
      fetchImplementation: createFetch({
        fetchLog,
        preflightStatus: 403,
        preflightHeaders: {
          "Access-Control-Allow-Origin": "https://other.example",
          "Access-Control-Allow-Methods": "HEAD",
          "Access-Control-Allow-Headers": "Range",
        },
      }),
      runEvidence,
    });

    expect(result.verdict).toBe("failed");
    expect(result.responses).toEqual([]);
    expect(fetchLog).toHaveLength(1);
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/preflight: Expected CORS preflight/),
      expect.stringMatching(/preflight: Access-Control-Allow-Origin/),
      expect.stringMatching(/preflight: Access-Control-Allow-Methods must include GET/),
      expect.stringMatching(/preflight: Access-Control-Allow-Headers must include if-range/),
      expect.stringMatching(/preflight: Access-Control-Allow-Headers must include if-none-match/),
    ]));
  });

  it("reports bad response status, range headers, weak etag, CORS exposure, and body length", async () => {
    const result = await runDeployedEdgeRangeQc({
      url: "https://cdn.example/file.copc.laz",
      origin: "https://viewer.example",
      outputPath: tempOutputPath(),
      repeats: 2,
      fetchImplementation: createFetch({
        status: 200,
        headers: {
          "Content-Range": "bytes 0-65534/262144",
          "Content-Length": "65535",
          "Accept-Ranges": "none",
          ETag: "W/\"v1\"",
          "Access-Control-Allow-Origin": "https://other.example",
          "Access-Control-Expose-Headers": "Content-Range, ETag",
        },
        body: sourceBytes.slice(0, 65_535),
      }),
      runEvidence,
    });

    expect(result.verdict).toBe("failed");
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/Expected HTTP 206/),
      expect.stringMatching(/Content-Range must be bytes 0-65535/),
      expect.stringMatching(/Content-Length must be 65536/),
      expect.stringMatching(/Body length must be 65536/),
      expect.stringMatching(/Accept-Ranges must be bytes/),
      expect.stringMatching(/strong validator/),
      expect.stringMatching(/Access-Control-Allow-Origin/),
      expect.stringMatching(/accept-ranges/),
      expect.stringMatching(/content-length/),
      expect.stringMatching(/x-cache/),
      expect.stringMatching(/age/),
    ]));
  });

  it("fails when repeated responses change total, etag, or body SHA", async () => {
    let repeat = 0;
    const result = await runDeployedEdgeRangeQc({
      url: "https://cdn.example/file.copc.laz",
      origin: "https://viewer.example",
      outputPath: tempOutputPath(),
      repeats: 3,
      fetchImplementation: createFetch({
        getResponseFactory: () => {
          repeat += 1;
          const body = sourceBytes.slice(0, 65_536);
          if (repeat === 3) body[0] = 99;
          return rangeResponse({
            body,
            total: repeat === 2 ? sourceBytes.byteLength + 1 : sourceBytes.byteLength,
            etag: repeat === 2 ? '"v2"' : '"v1"',
          });
        },
      }),
      runEvidence,
    });

    expect(result.verdict).toBe("failed");
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/total changed/),
      expect.stringMatching(/ETag changed/),
      expect.stringMatching(/body SHA-256 changed/),
    ]));
  });

  it("requires a repeat HIT in CloudFront mode and records edge headers", async () => {
    const missingHit = await runDeployedEdgeRangeQc({
      url: "https://cdn.example/file.copc.laz",
      origin: "https://viewer.example",
      outputPath: tempOutputPath(),
      repeats: 2,
      cloudFrontMode: "cloudfront",
      fetchImplementation: createFetch({
        edgeLedger: { xCache: "Miss from cloudfront", via: "1.1 cloudfront", xAmzCfPop: "ICN57-P1", age: "0" },
      }),
      runEvidence,
    });
    expect(missingHit.verdict).toBe("failed");
    expect(missingHit.failures).toContain("CloudFront mode requires at least one repeated request x-cache HIT.");
    expect(missingHit.responses[0].response.edgeLedger).toMatchObject({
      xCache: "Miss from cloudfront",
      via: "1.1 cloudfront",
      xAmzCfPop: "ICN57-P1",
      age: "0",
    });

    let repeat = 0;
    const passed = await runDeployedEdgeRangeQc({
      url: "https://cdn.example/file.copc.laz",
      origin: "https://viewer.example",
      outputPath: tempOutputPath(),
      repeats: 3,
      cloudFrontMode: "cloudfront",
      fetchImplementation: createFetch({
        getResponseFactory: () => {
          repeat += 1;
          return rangeResponse({
            edgeLedger: {
              xCache: repeat === 1 ? "Miss from cloudfront" : "Hit from cloudfront",
              via: "1.1 cloudfront",
              xAmzCfPop: "ICN57-P1",
              age: String(repeat - 1),
            },
          });
        },
      }),
      runEvidence,
    });

    expect(passed.verdict).toBe("passed");
    expect(passed.cloudFrontMode).toBe("cloudfront");
  });

  it("parses CLI URL, origin, output, repeat, range, and CloudFront options", () => {
    expect(parseCliArgs([
      "--url",
      "https://cdn.example/file.copc.laz",
      "--origin",
      "https://viewer.example",
      "--output",
      "custom.json",
      "--repeats",
      "5",
      "--range-start",
      "4",
      "--range-end",
      "12",
      "--cloudfront",
    ], {})).toMatchObject({
      url: "https://cdn.example/file.copc.laz",
      origin: "https://viewer.example",
      outputPath: "custom.json",
      repeats: 5,
      rangeStart: 4,
      rangeEndInclusive: 12,
      cloudFrontMode: "cloudfront",
    });
  });
});

function createFetch({
  fetchLog = [],
  status,
  headers,
  body,
  edgeLedger,
  preflightStatus,
  preflightHeaders,
  getResponseFactory,
} = {}) {
  return async (url, init = {}) => {
    fetchLog.push({
      url,
      method: init.method,
      origin: init.headers?.Origin,
      range: init.headers?.Range,
      credentials: init.credentials,
      redirect: init.redirect,
    });
    if (init.method === "OPTIONS") {
      return preflightResponse({ status: preflightStatus, headers: preflightHeaders });
    }
    if (getResponseFactory) {
      return getResponseFactory();
    }
    return rangeResponse({ status, headers, body, edgeLedger });
  };
}

function preflightResponse({
  status = 204,
  headers = {},
} = {}) {
  return new Response(null, {
    status,
    headers: new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, If-Range, If-None-Match",
      "Access-Control-Max-Age": "600",
      ...headers,
    }),
  });
}

function rangeResponse({
  status = 206,
  total = sourceBytes.byteLength,
  etag = '"v1"',
  headers = {},
  body = sourceBytes.slice(0, 65_536),
  edgeLedger = { xCache: "Hit from test-cache", age: "4", via: "1.1 test-cdn", xAmzCfPop: null },
} = {}) {
  const responseHeaders = new Headers({
    "Content-Range": `bytes 0-65535/${total}`,
    "Content-Length": String(body.byteLength),
    "Accept-Ranges": "bytes",
    ETag: etag,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Content-Range, ETag, Accept-Ranges, Content-Length, X-Cache, Age",
    ...headers,
  });

  if (edgeLedger.xCache !== null) responseHeaders.set("X-Cache", edgeLedger.xCache);
  if (edgeLedger.age !== null) responseHeaders.set("Age", edgeLedger.age);
  if (edgeLedger.via !== null) responseHeaders.set("Via", edgeLedger.via);
  if (edgeLedger.xAmzCfPop !== null) responseHeaders.set("X-Amz-Cf-Pop", edgeLedger.xAmzCfPop);

  return new Response(body, {
    status,
    headers: responseHeaders,
  });
}

function tempOutputPath() {
  return path.join(os.tmpdir(), `copc-edge-qc-${process.pid}-${Date.now()}-${Math.random()}.json`);
}
