/**
 * Chromium can emit this driver-level performance advisory when Cesium reads
 * pixels in a headless Linux WebGL context. It does not describe a page error,
 * context loss, or failed draw. Keep the allow-list deliberately exact so new
 * application and WebGL warnings remain fatal in browser smoke tests.
 */
export function isExpectedNonFatalWebGlDriverWarning(type, text) {
  return (
    type === "warning" &&
    /^\[\.WebGL-[^\]]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/.test(
      text,
    )
  );
}
