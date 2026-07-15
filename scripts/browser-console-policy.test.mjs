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
});
