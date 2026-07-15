import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isExpectedNonFatalWebGlDriverWarning } from "./browser-console-policy.mjs";

describe("browser console policy", () => {
  const linuxReadPixelsWarning =
    "[.WebGL-0xdc4000f2600]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels";

  it("allows only the known headless WebGL ReadPixels performance advisory", () => {
    expect(
      isExpectedNonFatalWebGlDriverWarning(
        "warning",
        linuxReadPixelsWarning,
      ),
    ).toBe(true);
    expect(
      isExpectedNonFatalWebGlDriverWarning(
        "warning",
        `${linuxReadPixelsWarning} (this message will no longer repeat)`,
      ),
    ).toBe(true);
  });

  it("keeps errors and unrelated WebGL or application warnings fatal", () => {
    expect(
      isExpectedNonFatalWebGlDriverWarning("error", linuxReadPixelsWarning),
    ).toBe(false);
    expect(
      isExpectedNonFatalWebGlDriverWarning(
        "warning",
        "[.WebGL-1]GL Driver Message (OpenGL, Performance, OTHER, High): GPU stall due to ReadPixels",
      ),
    ).toBe(false);
    expect(
      isExpectedNonFatalWebGlDriverWarning(
        "warning",
        "COPC worker failed to decode a node.",
      ),
    ).toBe(false);
  });

  it("applies the same narrow warning policy in both browser smoke entrypoints", () => {
    for (const relativePath of ["smoke-example.mjs", "smoke-package.mjs"]) {
      const source = readFileSync(
        fileURLToPath(new URL(relativePath, import.meta.url)),
        "utf8",
      );

      expect(source).toMatch(
        /import \{ isExpectedNonFatalWebGlDriverWarning \} from "\.\/browser-console-policy\.mjs";/,
      );
      expect(source).toMatch(
        /if \(isExpectedNonFatalWebGlDriverWarning\(type, text\)\) \{\s+ignoredConsoleWarnings\.push/,
      );
      expect(source).toMatch(
        /if \(type === "error" \|\| type === "warning"\) \{\s+consoleProblems\.push/,
      );
    }
  });
});
