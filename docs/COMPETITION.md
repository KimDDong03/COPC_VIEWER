# COPC Cesium PointCloud Provider — Gaia3D 2026 과제 근거

[가이아쓰리디 공식 지정과제](https://www.kossa.kr/materials/2026/ossp/tasks-gaia3d.html)의
COPC 데이터 CesiumJS 직접 가시화 요구와 **COPC Cesium PointCloud Provider**
프로젝트(`copc-cesium`)의 현재 구현·검증 근거를 연결한다.

공개 참조 뷰어: <https://kimddong03.github.io/COPC-Cesium-PointCloud-Provider/>

## 한 줄 결과

COPC URL, 브라우저 `File`, `Blob`을 3D Tiles로 사전 변환하지 않고 COPC
옥트리와 byte-range 구조로 읽어, 현재 카메라에 필요한 점군을 CesiumJS에
직접 렌더링하는 재사용 가능 TypeScript 라이브러리다.

## 공모전 범위 경계

범위 안:

- COPC URL/`File`/`Blob`의 정확한 byte-range 읽기.
- COPC hierarchy, octree, LOD, camera/frustum 기반 노드 선택.
- 브라우저 worker, bounded cache, prefetch, priority, cancellation.
- CRS 변환과 Cesium-native point rendering.
- 재사용 API, 참조 예제, 단위·패키지·브라우저·성능 검증.

범위 밖:

- AWS, CloudFront, S3 운영 구성과 데이터 호스팅 제품.
- CDN/edge 서버 또는 backend proxy.
- COPC-to-3D-Tiles 등 사전 변환·pre-tiling 파이프라인.
- 외부 전달 인프라를 라이브러리 성능 우위로 설명하는 주장.

공개 COPC URL은 시험 입력이다. GitHub Pages는 정적 예제 접근 수단이며
라이브러리의 런타임 의존성이나 성능 근거가 아니다.

## 요구사항 대응표

| 과제 방향 | 현재 구현 | 반복 검증 |
| --- | --- | --- |
| COPC 직접 가시화 | `CopcSource`, `CopcPointCloudLayer`, URL/`File`/`Blob` | `npm run smoke:example:file` |
| 옥트리·LOD | camera/frustum hierarchy 확장, complete/mixed-depth bounded selection | smoothness 브라우저 gate |
| 필요한 구간만 읽기 | 엄격한 HTTP `206` Range getter와 `Blob.slice()` | 단위 테스트, `npm run live:copc-range` |
| 부드러운 브라우저 렌더링 | worker decode/geometry, cache, priority, prefetch, safe terminal swap | cold/contest/regression gate |
| CesiumJS 라이브러리 | `copc-cesium`, `/core`, `/cesium` typed ESM entry | `npm run smoke:package` |
| 다른 앱 재사용 | 저수준 source/layer/renderer와 고수준 camera stream 분리 | consumer type check/build/browser smoke |
| 공개SW 품질 | MIT, CI, CodeQL, Notice, SPDX SBOM, release provenance | product/release/contest QC |

## 구현 구조

```text
COPC URL / File / Blob
  -> exact half-open range getter
  -> metadata + bounded hierarchy
  -> camera/frustum/LOD frontier
  -> additive ancestor closure
  -> bounded worker decode + coordinate/geometry preparation
  -> Cesium-native primitive
  -> terminal composition and evidence
```

- `src/core`: Cesium 비의존 COPC source, hierarchy, range, sample, cache,
  traversal planning.
- `src/cesium`: 좌표 변환, renderer, layer, workers, camera stream, quality,
  telemetry.
- `examples/basic-viewer`: 데모 UI와 application-owned movement/retention/
  benchmark 정책.

세부 계약은 중복 기술하지 않고 다음 문서를 기준으로 한다.

- [API guide](API.md)
- [Architecture](ARCHITECTURE.md)
- [Sample provenance](DATASETS.md)
- [Performance and evidence](PERFORMANCE.md)

## 재현 절차

Node.js 22와 `packageManager`에 선언된 npm 버전을 사용한다.

```powershell
npm ci
npm run dev
```

<http://localhost:3000>에서 원격 preset, Custom URL, 로컬 COPC를 확인한다.
최종 장비 근거는 깨끗한 worktree에서 생성한다.

```powershell
npm run smoke:example:install-browser
npm run qc:contest-device
npm run evidence:contest:check
```

GitHub CI는 deterministic product gate를, 별도 browser workflow는 실제
원격 Range와 URL/파일/package 흐름을 검증한다. GitHub Pages는 예제 build와
asset 경로를 검증해 배포한다. 실제 GPU 성능 주장은 목표 장비에서 생성한
clean-source evidence만 사용한다.

## 증거 산출물

`output/`은 Git에서 제외되며 주요 산출물은 다음과 같다.

| 경로 | 의미 |
| --- | --- |
| `output/qc/qc-status.json` | 실행 mode, 단계 결과, 실패 분류, source evidence |
| `output/live-copc-range/live-copc-range.json` | 실제 `206`, `Content-Range`, 길이, `LASF` 검사 |
| `output/renderer-benchmark/renderers.json` | 실제 WebGL adapter 기반 renderer 반복 측정 |
| `output/smoothness-benchmark/*.json` | frame, response, LOD, coverage, hierarchy, cache/worker/Range 근거 |
| `output/quality-ab/*` | 고정 pose 품질 비교 JSON·스크린샷·image metric |
| `output/package-smoke/*` | 설치 tarball/checksum과 consumer type/build/browser 결과 |
| `output/playwright/*.png` | Autzen, Millsite, package, 최종 기능 화면 |
| `output/contest-evidence/contest-evidence-manifest.json` | 동일 source 상태에 묶인 필수 산출물 크기·SHA-256·상태 인덱스 |

매니페스트는 실패를 통과로 바꾸지 않는다. 누락, 실패, source mismatch,
생성 뒤 변경이 있으면 생성 또는 재검사가 실패한다. 영상·보고서의 수치는
같은 제출 커밋과 장비에서 생성한 최종 JSON에서만 가져온다.

## 검증 경계

- `qc:product`: 코드·라이선스·SBOM·build의 deterministic 근거.
- `qc:release`: hosted runner의 기능 근거이며 workstation FPS 근거가 아님.
- `qc:contest-device`: live source와 실제 browser/GPU를 포함한 목표 장비 근거.
- `evidence:contest:check`: 기존 근거의 byte와 source 상태가 유지됐는지 재검사.

공개 소스 장애는 성능 판정을 만들지 않는다. 도달 가능한 소스의 Range/COPC
계약 위반은 실패다. 서로 다른 GPU·browser contract·source fingerprint의
숫자를 한 비교표에 섞지 않는다.

## 라이선스와 데이터

- 자체 소스: [MIT](../LICENSE)
- 제3자 구성요소: [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)
- SPDX SBOM: [sbom.spdx.json](sbom.spdx.json)
- 샘플 데이터: [DATASETS.md](DATASETS.md)
- 보안 신고: [SECURITY.md](../SECURITY.md)

Autzen은 문서화된 CC BY 4.0 조건과 attribution을 따른다. Millsite는 공개
도메인 USGS 3DEP collection과 point count/Z bounds가 일치하는
Hobu-hosted COPC라는 한정된 출처 설명을 사용한다. byte-for-byte 원본
관계는 단정하지 않으며 저장소·npm 패키지에 데이터 byte를 포함하지 않는다.

## 제한사항

- 현재 package/API는 pre-1.0이다.
- 외부 datum grid가 필요한 CRS는 application-provided transform이 필요하다.
- browser frame interval과 CPU-side submission timing은 전용 GPU profiler가
  아니다.
- 편집, 비-COPC format, backend/hosting, 사전 변환은 지원 범위가 아니다.
- 더 많은 COPC producer, CRS, browser, network, hardware 검증이 필요하다.
