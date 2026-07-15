import type { Plugin } from "vite";

export function configureCesiumForPublicBase(
  cesiumPlugin: Plugin,
  publicBase: string,
): readonly Plugin[];
