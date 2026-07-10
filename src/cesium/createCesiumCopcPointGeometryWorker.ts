export function createCesiumCopcPointGeometryWorker(): Worker {
  return new Worker(
    new URL("./CesiumCopcPointGeometryWorker.ts", import.meta.url),
    {
      type: "module",
    },
  );
}
