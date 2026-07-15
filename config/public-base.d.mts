export const DEFAULT_COPC_VIEWER_PUBLIC_BASE: "/";

export function normalizeCopcViewerPublicBase(value: string | undefined): string;

export function readCopcViewerPublicBase(
  environment?: Readonly<Record<string, string | undefined>>,
): string;
