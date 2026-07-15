export const DEFAULT_COPC_VIEWER_PUBLIC_BASE = "/";

/**
 * Normalize the deployment base used by the example Vite build.
 *
 * The value is deliberately limited to an absolute URL pathname. This keeps
 * local and CI builds on `/` while allowing a Pages build such as
 * `/COPC_VIEWER/` without accepting origins, query strings, or traversal.
 */
export function normalizeCopcViewerPublicBase(value) {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_COPC_VIEWER_PUBLIC_BASE;
  }

  const base = value.trim();

  if (
    !base.startsWith("/") ||
    !base.endsWith("/") ||
    base.includes("//") ||
    base.includes("\\") ||
    base.includes("?") ||
    base.includes("#")
  ) {
    throw new Error(
      "COPC_VIEWER_PUBLIC_BASE must be an absolute pathname that starts and ends with '/'.",
    );
  }

  const segments = base.split("/").filter(Boolean);

  if (
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        !/^[A-Za-z0-9._~-]+$/.test(segment),
    )
  ) {
    throw new Error(
      "COPC_VIEWER_PUBLIC_BASE contains an unsupported or unsafe path segment.",
    );
  }

  return base;
}

export function readCopcViewerPublicBase(environment = process.env) {
  return normalizeCopcViewerPublicBase(environment.COPC_VIEWER_PUBLIC_BASE);
}
