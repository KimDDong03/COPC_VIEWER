import { createLazPerf } from "laz-perf";
import lazPerfWasmUrl from "laz-perf/lib/web/laz-perf.wasm?url";

let lazPerfPromise: ReturnType<typeof createLazPerf> | undefined;

export function getSharedLazPerf(): ReturnType<typeof createLazPerf> {
  lazPerfPromise ??= createLazPerf({
    locateFile(path: string) {
      return path.endsWith(".wasm") ? lazPerfWasmUrl : path;
    },
  });

  return lazPerfPromise;
}
