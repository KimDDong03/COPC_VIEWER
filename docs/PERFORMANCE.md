# Performance Notes

`copc-cesium` is still a prototype, so performance claims should be backed by
repeatable browser measurements instead of fixed guarantees.

## Smoothness Benchmark

Run:

```bash
npm run benchmark:smoothness
```

The benchmark builds the basic viewer, opens the Autzen COPC sample in a real
browser, enables `Stream on camera move`, changes the camera-stream point
budget, moves the Cesium camera, and records `requestAnimationFrame` intervals.

The result is written to:

```text
output/smoothness-benchmark/smoothness.json
```

Useful overrides:

```powershell
$env:COPC_SMOOTHNESS_POINT_BUDGETS="2500,5000,10000"
$env:COPC_SMOOTHNESS_REPEATS="5"
npm run benchmark:smoothness
```

## Current Local Result

Measured on 2026-07-01 with:

- Source: Autzen classified sample
- Renderer: `PointPrimitiveCollection`
- Max points / node: 20,000
- Camera steps: 24
- Repeats: 2 per budget

| Camera stream budget | Rendered points | Avg FPS | p95 frame | Max frame | Frames > 50 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2,500 | 2,500 | 60.0 | 16.80 ms | 17.00 ms | 0 |
| 5,000 | 5,000 | 59.9 | 16.80 ms | 33.40 ms | 0 |
| 10,000 | 10,000 | 57.7 | 16.90 ms | 83.40 ms | 2 |
| 20,000 | 20,000 | 50.7 | 33.30 ms | 116.70 ms | 2 |

## Current Default

The basic viewer keeps the camera-stream point budget at 5,000 points by
default. In the current local benchmark it preserved near-60 FPS behavior
without frames over 50 ms.

10,000 points is a useful test budget, but it already showed occasional long
frames in the same run. 20,000 points is currently best treated as a stress
case, not a default.
