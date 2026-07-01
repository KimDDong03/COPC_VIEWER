import { defineConfig, type ProxyOptions } from "vite";
import cesium from "vite-plugin-cesium";

export default defineConfig({
  plugins: [cesium()],
  server: {
    proxy: createCopcSampleProxy(),
  },
  preview: {
    proxy: createCopcSampleProxy(),
  },
  resolve: {
    alias: [
      {
        find: "copc-cesium/cesium",
        replacement: filePathFromUrl(
          new URL("./src/cesium/index.ts", import.meta.url),
        ),
      },
      {
        find: "copc-cesium/core",
        replacement: filePathFromUrl(
          new URL("./src/core/index.ts", import.meta.url),
        ),
      },
      {
        find: "copc-cesium",
        replacement: filePathFromUrl(new URL("./src/index.ts", import.meta.url)),
      },
    ],
  },
});

function createCopcSampleProxy(): Record<string, string | ProxyOptions> {
  return {
    "/copc-samples": {
      target: "https://s3.amazonaws.com",
      changeOrigin: true,
      rewrite: (path: string) =>
        path.replace(/^\/copc-samples/, "/hobu-lidar"),
    },
  };
}

function filePathFromUrl(url: URL): string {
  return decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:\/)/, "$1");
}
