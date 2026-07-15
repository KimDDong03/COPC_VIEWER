/**
 * Keep vite-plugin-cesium's filesystem copy rooted at `outDir/cesium` while
 * allowing Vite's generated browser URLs to use a repository Pages base.
 *
 * vite-plugin-cesium otherwise joins Vite's `base` into both the public URL and
 * the copy destination, which duplicates a repository path inside a Pages
 * artifact. The wrapped config hook sees `/` only during a production build;
 * Vite itself retains the configured public base for application assets.
 */
export function configureCesiumForPublicBase(cesiumPlugin, publicBase) {
  const configHook = cesiumPlugin.config;

  if (typeof configHook !== "function") {
    throw new Error("vite-plugin-cesium must expose a function config hook.");
  }

  const wrappedCesiumPlugin = {
    ...cesiumPlugin,
    config(config, environment) {
      const pluginConfig =
        environment.command === "build" && publicBase !== "/"
          ? { ...config, base: "/" }
          : config;

      return configHook.call(this, pluginConfig, environment);
    },
  };

  const publicCesiumUrlPlugin = {
    name: "cesium-public-base-url",
    apply: "build",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        if (publicBase === "/") {
          return html;
        }

        const rootCesiumUrl = "/cesium/";

        if (!html.includes(rootCesiumUrl)) {
          throw new Error(
            "vite-plugin-cesium did not inject the expected root Cesium URL.",
          );
        }

        return html.replaceAll(rootCesiumUrl, `${publicBase}cesium/`);
      },
    },
  };

  return [wrappedCesiumPlugin, publicCesiumUrlPlugin];
}
