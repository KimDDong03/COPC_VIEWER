import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outputRoot = path.join(repoRoot, "output");
const benchmarkRoot = path.join(outputRoot, "smoothness-benchmark");
const benchmarkFlowPath = path.join(benchmarkRoot, "smoothness-benchmark-flow.mjs");
const benchmarkResultPath = path.join(benchmarkRoot, "smoothness.json");
const isWindows = process.platform === "win32";
const npmCommand = "npm";
const npxCommand = "npx";
const playwrightCliPackage = "@playwright/cli@0.1.14";
const benchmarkStreamPointBudgets = readPositiveIntegerListEnv(
  "COPC_SMOOTHNESS_POINT_BUDGETS",
  [2_500, 5_000, 10_000, 20_000],
);
const benchmarkMaxPointCountPerNode = readPositiveIntegerEnv(
  "COPC_SMOOTHNESS_POINT_COUNT",
  Math.max(...benchmarkStreamPointBudgets),
);
const benchmarkRepeats = readPositiveIntegerEnv("COPC_SMOOTHNESS_REPEATS", 2);
const benchmarkDurationMilliseconds = readPositiveIntegerEnv(
  "COPC_SMOOTHNESS_DURATION_MS",
  3000,
);
const benchmarkCameraSteps = readPositiveIntegerEnv(
  "COPC_SMOOTHNESS_CAMERA_STEPS",
  24,
);
const benchmarkMoveMeters = readPositiveIntegerEnv(
  "COPC_SMOOTHNESS_MOVE_METERS",
  25,
);

if (benchmarkMaxPointCountPerNode < Math.max(...benchmarkStreamPointBudgets)) {
  throw new Error(
    "COPC_SMOOTHNESS_POINT_COUNT must be greater than or equal to every COPC_SMOOTHNESS_POINT_BUDGETS value.",
  );
}

function readPositiveIntegerEnv(name, fallback) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function readPositiveIntegerListEnv(name, fallback) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const values = rawValue
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => value !== 0);

  if (
    values.length === 0 ||
    values.some((value) => !Number.isSafeInteger(value) || value <= 0)
  ) {
    throw new Error(`${name} must be a comma-separated list of positive integers.`);
  }

  return [...new Set(values)];
}

function assertInside(parent, target) {
  const relative = path.relative(parent, target);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to operate outside ${parent}: ${target}`);
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: isWindows,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function runPlaywrightCli(args) {
  const result = spawnSync(
    npxCommand,
    ["--yes", "--package", playwrightCliPackage, "playwright-cli", ...args],
    {
      cwd: repoRoot,
      encoding: "utf8",
      shell: isWindows,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `playwright-cli ${args.join(" ")} failed with exit code ${result.status}`,
    );
  }

  if (`${result.stdout}\n${result.stderr}`.includes("### Error")) {
    throw new Error(`playwright-cli ${args.join(" ")} reported an error`);
  }

  return `${result.stdout}\n${result.stderr}`;
}

function extractPlaywrightResult(output) {
  const marker = "### Result";
  const markerIndex = output.lastIndexOf(marker);

  if (markerIndex === -1) {
    throw new Error("Could not find Playwright result output.");
  }

  const outputAfterMarker = output.slice(markerIndex + marker.length);
  const jsonStart = outputAfterMarker.search(/[\[{]/);

  if (jsonStart === -1) {
    throw new Error("Could not find Playwright result JSON.");
  }

  const jsonText = outputAfterMarker.slice(jsonStart);
  let depth = 0;
  let isInsideString = false;
  let isEscaped = false;

  for (let index = 0; index < jsonText.length; index += 1) {
    const character = jsonText[index];

    if (isInsideString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (character === "\\") {
        isEscaped = true;
      } else if (character === "\"") {
        isInsideString = false;
      }

      continue;
    }

    if (character === "\"") {
      isInsideString = true;
      continue;
    }

    if (character === "{" || character === "[") {
      depth += 1;
      continue;
    }

    if (character === "}" || character === "]") {
      depth -= 1;

      if (depth === 0) {
        return JSON.parse(jsonText.slice(0, index + 1));
      }
    }
  }

  throw new Error("Could not parse complete Playwright result JSON.");
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No available preview port found from ${startPort}.`);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "localhost");
  });
}

async function waitForServer(url, serverProcess, serverOutput) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(
        `Example preview server exited early with code ${serverProcess.exitCode}.\n${serverOutput.join("")}`,
      );
    }

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1_000),
      });

      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the Vite preview server starts listening.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for example preview server: ${url}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stopServer(serverProcess) {
  if (!serverProcess.pid || serverProcess.exitCode !== null) {
    return;
  }

  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }

  serverProcess.kill("SIGTERM");
}

function createSmoothnessFlow(
  baseUrl,
  maxPointCountPerNode,
  streamPointBudgets,
  repeatCount,
  durationMilliseconds,
  cameraSteps,
  moveMeters,
) {
  return `async (page) => {
  const maxPointCountPerNode = ${JSON.stringify(maxPointCountPerNode)};
  const streamPointBudgets = ${JSON.stringify(streamPointBudgets)};
  const repeatCount = ${JSON.stringify(repeatCount)};
  const durationMilliseconds = ${JSON.stringify(durationMilliseconds)};
  const cameraSteps = ${JSON.stringify(cameraSteps)};
  const moveMeters = ${JSON.stringify(moveMeters)};
  const failures = [];
  const consoleProblems = [];
  const pageErrors = [];
  const results = [];

  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleProblems.push(\`\${message.type()}: \${message.text()}\`);
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  async function metadataValue(label) {
    return page.evaluate((targetLabel) => {
      const rows = [...document.querySelectorAll("#copc-metadata dt")];
      return rows.find((row) => row.textContent === targetLabel)
        ?.nextElementSibling?.textContent;
    }, label);
  }

  async function waitForRenderedStatus() {
    try {
      await page.waitForFunction(
        () => document.querySelector("#copc-status")?.textContent?.includes("Rendered "),
        undefined,
        { timeout: 120_000 },
      );
    } catch (error) {
      const currentStatus = await page.locator("#copc-status").textContent();
      throw new Error(
        \`Timed out waiting for a rendered status. Current status: "\${currentStatus}". \${error.message}\`,
      );
    }
  }

  async function waitForCameraStreamStatus() {
    try {
      await page.waitForFunction(
        () => document.querySelector("#copc-status")?.textContent?.includes("Camera stream rendered"),
        undefined,
        { timeout: 120_000 },
      );
    } catch (error) {
      const currentStatus = await page.locator("#copc-status").textContent();
      throw new Error(
        \`Timed out waiting for a camera stream render. Current status: "\${currentStatus}". \${error.message}\`,
      );
    }
  }

  async function prepareViewer(initialStreamPointBudget) {
    await page.evaluate(({ maxPointCountPerNode, initialStreamPointBudget }) => {
      const rendererSelect = document.querySelector("#copc-renderer-select");
      const maxPointCountInput = document.querySelector("#copc-max-point-count");
      const streamPointBudgetInput = document.querySelector(
        "#copc-camera-stream-point-budget",
      );
      const form = document.querySelector("#copc-form");
      const status = document.querySelector("#copc-status");

      if (!(rendererSelect instanceof HTMLSelectElement)) {
        throw new Error("Renderer select was not found.");
      }

      if (!(maxPointCountInput instanceof HTMLInputElement)) {
        throw new Error("Max point count input was not found.");
      }

      if (!(streamPointBudgetInput instanceof HTMLInputElement)) {
        throw new Error("Camera stream point budget input was not found.");
      }

      if (!(form instanceof HTMLFormElement)) {
        throw new Error("COPC form was not found.");
      }

      rendererSelect.value = "primitive";
      maxPointCountInput.value = String(maxPointCountPerNode);
      streamPointBudgetInput.value = String(initialStreamPointBudget);

      if (status) {
        status.textContent = "Smoothness benchmark render pending...";
      }

      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }, { maxPointCountPerNode, initialStreamPointBudget });
    await waitForRenderedStatus();

    await page.evaluate(() => {
      const checkbox = document.querySelector("#copc-auto-stream");

      if (!(checkbox instanceof HTMLInputElement)) {
        throw new Error("Stream on camera move checkbox was not found.");
      }

      if (checkbox.disabled) {
        throw new Error("Stream on camera move is disabled.");
      }

      if (!checkbox.checked) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await waitForCameraStreamStatus();
  }

  async function setStreamPointBudget(streamPointBudget) {
    await page.evaluate((streamPointBudget) => {
      const input = document.querySelector("#copc-camera-stream-point-budget");

      if (!(input instanceof HTMLInputElement)) {
        throw new Error("Camera stream point budget input was not found.");
      }

      input.value = String(streamPointBudget);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, streamPointBudget);
    await waitForCameraStreamStatus();
  }

  function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function percentile(values, ratio) {
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
    return sorted[index] ?? 0;
  }

  function summarizeFrames(frameDeltas) {
    return {
      frameCount: frameDeltas.length,
      averageFrameMilliseconds: average(frameDeltas),
      medianFrameMilliseconds: percentile(frameDeltas, 0.5),
      p95FrameMilliseconds: percentile(frameDeltas, 0.95),
      maxFrameMilliseconds: Math.max(...frameDeltas),
      estimatedAverageFps: 1000 / average(frameDeltas),
      frameDeltasOver50Milliseconds: frameDeltas.filter((delta) => delta > 50).length,
      frameDeltasOver100Milliseconds: frameDeltas.filter((delta) => delta > 100).length,
    };
  }

  function parseCameraStreamPointCount(statusText) {
    const match = statusText.match(/Camera stream rendered ([\\d,]+) points/);

    if (!match) {
      return undefined;
    }

    return Number(match[1].replaceAll(",", ""));
  }

  async function measureSmoothness(streamPointBudget, runIndex) {
    const measurement = await page.evaluate(
      async ({ durationMilliseconds, cameraSteps, moveMeters }) => {
        const benchmark = window.__copcBasicViewerBenchmark;

        if (!benchmark) {
          throw new Error("Basic viewer benchmark API was not installed.");
        }

        const frameDeltas = [];
        let previousFrameTimestamp;
        let isRunning = true;

        function onFrame(timestamp) {
          if (previousFrameTimestamp !== undefined) {
            frameDeltas.push(timestamp - previousFrameTimestamp);
          }

          previousFrameTimestamp = timestamp;

          if (isRunning) {
            window.requestAnimationFrame(onFrame);
          }
        }

        window.requestAnimationFrame(onFrame);
        const startedAt = performance.now();
        const status = await benchmark.moveCameraForSmoothness({
          steps: cameraSteps,
          durationMilliseconds,
          moveMeters,
        });
        const completedAt = performance.now();
        await new Promise((resolve) => {
          window.requestAnimationFrame(() => {
            isRunning = false;
            resolve(undefined);
          });
        });

        return {
          measuredDurationMilliseconds: completedAt - startedAt,
          frameDeltas,
          status,
        };
      },
      { durationMilliseconds, cameraSteps, moveMeters },
    );

    if (measurement.frameDeltas.length < Math.max(10, cameraSteps / 2)) {
      failures.push(
        \`run \${runIndex} collected only \${measurement.frameDeltas.length} frames during camera movement.\`,
      );
    }

    if (!measurement.status.status.includes("Camera stream rendered")) {
      failures.push(
        \`run \${runIndex} ended with unexpected status: \${measurement.status.status}\`,
      );
    }

    if (!measurement.status.rendererTiming || measurement.status.rendererTiming.includes("Not rendered")) {
      failures.push(\`run \${runIndex} did not expose renderer timing after camera movement.\`);
    }

    const renderedPointCount = parseCameraStreamPointCount(measurement.status.status);

    if (renderedPointCount === undefined) {
      failures.push(\`run \${runIndex} did not report a camera stream point count.\`);
    } else if (renderedPointCount > streamPointBudget) {
      failures.push(
        \`run \${runIndex} rendered \${renderedPointCount} points with a \${streamPointBudget} point budget.\`,
      );
    }

    return {
      runIndex,
      streamPointBudget,
      renderedPointCount,
      ...measurement,
      summary: summarizeFrames(measurement.frameDeltas),
    };
  }

  await page.goto(${JSON.stringify(baseUrl)}, { waitUntil: "domcontentloaded" });
  await waitForRenderedStatus();
  await prepareViewer(streamPointBudgets[0]);

  for (const streamPointBudget of streamPointBudgets) {
    await setStreamPointBudget(streamPointBudget);

    for (let runIndex = 1; runIndex <= repeatCount; runIndex += 1) {
      results.push(await measureSmoothness(streamPointBudget, runIndex));
    }
  }

  if (consoleProblems.length > 0 || pageErrors.length > 0) {
    failures.push(
      [
        ...consoleProblems.map((message) => \`console \${message}\`),
        ...pageErrors.map((message) => \`pageerror: \${message}\`),
      ].join("\\n"),
    );
  }

  if (failures.length > 0) {
    throw new Error(failures.join("\\n"));
  }

  return {
    maxPointCountPerNode,
    streamPointBudgets,
    repeatCount,
    durationMilliseconds,
    cameraSteps,
    moveMeters,
    sourcePreset: await metadataValue("Source preset"),
    pointRenderer: await metadataValue("Point renderer"),
    coordinateTransform: await metadataValue("Coordinate transform"),
    results,
  };
}
`;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function printBenchmarkSummary(result) {
  console.log("Smoothness benchmark summary:");

  console.log(
    `- ${result.maxPointCountPerNode.toLocaleString()} max points / node, ${result.cameraSteps.toLocaleString()} camera steps`,
  );

  for (const streamPointBudget of result.streamPointBudgets) {
    const runs = result.results.filter(
      (run) => run.streamPointBudget === streamPointBudget,
    );
    const averageFps = average(runs.map((run) => run.summary.estimatedAverageFps));
    const averageP95 = average(runs.map((run) => run.summary.p95FrameMilliseconds));
    const maxFrame = Math.max(...runs.map((run) => run.summary.maxFrameMilliseconds));
    const over50 = runs.reduce(
      (sum, run) => sum + run.summary.frameDeltasOver50Milliseconds,
      0,
    );
    const renderedPoints = runs.map((run) => run.renderedPointCount ?? 0);

    console.log(
      [
        `- ${streamPointBudget.toLocaleString()} point stream budget`,
        `${runs.length.toLocaleString()} runs`,
        `${Math.min(...renderedPoints).toLocaleString()}-${Math.max(...renderedPoints).toLocaleString()} rendered pts`,
        `avg ${averageFps.toFixed(1)} fps`,
        `p95 ${averageP95.toFixed(2)} ms`,
        `max ${maxFrame.toFixed(2)} ms`,
        `${over50.toLocaleString()} frames > 50 ms`,
      ].join(", "),
    );
  }
}

await mkdir(outputRoot, { recursive: true });
assertInside(outputRoot, benchmarkRoot);
await rm(benchmarkRoot, { recursive: true, force: true });
await mkdir(benchmarkRoot, { recursive: true });

console.log("Building example...");
run(npmCommand, ["run", "build:example"], repoRoot);

const port = await findAvailablePort(4373);
const baseUrl = `http://localhost:${port}`;
const serverOutput = [];
const serverProcess = spawn(
  npxCommand,
  [
    "vite",
    "preview",
    "examples/basic-viewer",
    "--config",
    "vite.config.ts",
    "--host",
    "localhost",
    "--port",
    String(port),
    "--strictPort",
    "--outDir",
    "../../dist/example",
  ],
  {
    cwd: repoRoot,
    shell: isWindows,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

serverProcess.stdout.on("data", (data) => {
  serverOutput.push(data.toString());
});
serverProcess.stderr.on("data", (data) => {
  serverOutput.push(data.toString());
});

try {
  console.log(`Starting example preview at ${baseUrl}...`);
  await waitForServer(baseUrl, serverProcess, serverOutput);

  await writeFile(
    benchmarkFlowPath,
    createSmoothnessFlow(
      baseUrl,
      benchmarkMaxPointCountPerNode,
      benchmarkStreamPointBudgets,
      benchmarkRepeats,
      benchmarkDurationMilliseconds,
      benchmarkCameraSteps,
      benchmarkMoveMeters,
    ),
  );

  console.log(
    [
      "Running smoothness benchmark:",
      `${benchmarkMaxPointCountPerNode.toLocaleString()} max points / node,`,
      `${benchmarkStreamPointBudgets
        .map((value) => value.toLocaleString())
        .join("/")} stream budgets,`,
      `${benchmarkRepeats.toLocaleString()} repeats,`,
      `${benchmarkCameraSteps.toLocaleString()} camera steps`,
    ].join(" "),
  );
  runPlaywrightCli(["open", "about:blank"]);
  const output = runPlaywrightCli(["run-code", "--filename", benchmarkFlowPath]);
  const result = extractPlaywrightResult(output);
  await writeFile(benchmarkResultPath, `${JSON.stringify(result, null, 2)}\n`);
  printBenchmarkSummary(result);
  console.log(`Smoothness benchmark result written: ${benchmarkResultPath}`);
} finally {
  try {
    runPlaywrightCli(["close"]);
  } catch {
    // The browser may already be closed if startup failed.
  }
  stopServer(serverProcess);
}
