export function createCesiumPointGeometryWorker(): Worker {
  if (typeof Worker === "undefined") {
    throw new Error("Web Workers are not available in this environment.");
  }

  return new Worker(new URL("./CesiumPointGeometryWorker.ts", import.meta.url), {
    name: "cesium-point-geometry-worker",
    type: "module",
  });
}
