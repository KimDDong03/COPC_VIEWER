import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LIVE_COPC_SAMPLE_URLS } from "../config/live-copc-sources.mjs";
import { probeLiveCopcRangeSource } from "./live-copc-range-check.mjs";
import { createRunEvidence } from "./run-evidence.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const defaultOutputPath = path.join(
  repoRoot,
  "output",
  "live-copc-range",
  "live-copc-range.json",
);
const defaultSources = [
  {
    id: "autzen-classified",
    url: LIVE_COPC_SAMPLE_URLS.autzenClassified,
  },
  {
    id: "millsite-reservoir",
    url: LIVE_COPC_SAMPLE_URLS.millsiteReservoir,
  },
];

const sources = readSources();
const timeoutMilliseconds = readPositiveIntegerArg("--timeout-ms", 15_000);
const outputPath = path.resolve(
  repoRoot,
  readStringArg("--output") ?? defaultOutputPath,
);
const results = [];
const runEvidence = await createRunEvidence({ repoRoot });

for (const source of sources) {
  console.log(`Probing live COPC HTTP Range source: ${source.id}`);
  const result = await probeLiveCopcRangeSource({
    ...source,
    timeoutMilliseconds,
  });
  results.push(result);

  if (result.status === "passed") {
    console.log(
      `- verified HTTP 206 ${result.response.contentRange}, ${result.response.fileSignature}, ${result.durationMilliseconds.toFixed(1)} ms`,
    );
  } else {
    console.error(`- ${result.classification}: ${result.error}`);
  }
}

const classification = classifyReport(results);
const report = {
  schema: "copc-viewer.live-copc-range-evidence",
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status:
    classification === "live-range-verified"
      ? "passed"
      : classification === "external-source-unavailable"
        ? "unavailable"
        : "failed",
  classification,
  timeoutMilliseconds,
  runEvidence,
  results,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Live COPC range evidence written: ${outputPath}`);

if (classification === "external-source-unavailable") {
  console.error(
    "Live COPC evidence is unavailable because an external source or network request failed; this is not classified as a product regression.",
  );
  process.exitCode = 2;
} else if (classification !== "live-range-verified") {
  console.error(
    "A live COPC source violated the required HTTP Range/COPC source contract.",
  );
  process.exitCode = 1;
}

function classifyReport(sourceResults) {
  if (
    sourceResults.some(
      (result) => result.classification === "live-source-contract-failure",
    )
  ) {
    return "live-source-contract-failure";
  }

  if (
    sourceResults.some(
      (result) => result.classification === "external-source-unavailable",
    )
  ) {
    return "external-source-unavailable";
  }

  return "live-range-verified";
}

function readSources() {
  const values = readStringArgs("--source");

  if (values.length === 0) {
    return defaultSources;
  }

  const seenIds = new Set();

  return values.map((value) => {
    const separatorIndex = value.indexOf("=");

    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      throw new Error('--source must use the form "id=https://example.test/file.copc.laz".');
    }

    const source = {
      id: value.slice(0, separatorIndex),
      url: value.slice(separatorIndex + 1),
    };

    if (seenIds.has(source.id)) {
      throw new Error(`Duplicate live COPC source id: ${source.id}.`);
    }

    seenIds.add(source.id);
    return source;
  });
}

function readPositiveIntegerArg(name, fallback) {
  const rawValue = readStringArg(name);

  if (rawValue === undefined) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer.`);
  }

  return value;
}

function readStringArgs(name) {
  const values = [];

  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) {
      continue;
    }

    const value = process.argv[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`${name} requires a value.`);
    }

    values.push(value);
    index += 1;
  }

  return values;
}

function readStringArg(name) {
  const values = readStringArgs(name);

  if (values.length > 1) {
    throw new Error(`${name} may be provided only once.`);
  }

  return values[0];
}
