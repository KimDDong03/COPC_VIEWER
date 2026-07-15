# 3분 시연 구성안

실제 녹화는 제출 커밋과 최종 QC 산출물로 진행한다. 아래 시간은 상한이며,
네트워크 대기나 설치 장면은 미리 편집해 기능·근거가 화면에 남도록 한다.

| 시간 | 화면 | 핵심 설명과 근거 |
| --- | --- | --- |
| 0:00–0:20 | Cesium 지구와 프로젝트 제목 | “COPC를 3D Tiles로 미리 변환하지 않고 CesiumJS에서 직접 Range-read하는 TypeScript 라이브러리”라고 범위를 한 문장으로 설명 |
| 0:20–0:40 | `core -> cesium -> app` 구조 | COPC 로딩·계층·worker와 Cesium 렌더링·camera controller가 분리된 구조, npm 재사용 API 강조 |
| 0:40–1:05 | Autzen 프리셋 | 실제 색상/분류 점군, camera move의 coverage-first/detail refinement, 상태 패널의 노드·깊이·예산 표시 |
| 1:05–1:35 | Millsite 프리셋 | USGS 3DEP 컬렉션과 점 수·높이 범위가 일치하는 Hobu 호스팅 374,609,447점 COPC, HTTP 206, compound WKT의 EPSG:6341 자동 감지, 고지대에서도 cloud-top 상대 높이로 close LOD가 선택됨을 표시 |
| 1:35–1:55 | 로컬 파일 또는 Custom URL | 같은 레이어 API가 URL과 `File`/`Blob`을 처리하고 수동 proj4 override도 지원함을 짧게 시연 |
| 1:55–2:25 | 성능 JSON/상태 | 실제 WebGL adapter, 60 FPS, p95 frame, 최초 응답, current-view coverage, cold/warm 차이를 최종 산출물 수치로 제시 |
| 2:25–2:45 | 패키지와 품질 근거 | 소비자 설치 smoke, 3개 export entry, 전체 테스트 통과, SBOM/Notice 변조 방지, CI/CodeQL 표시 |
| 2:45–3:00 | 장점·한계·마무리 | 변환 파이프라인 없이 직접 사용, Cesium-native, 공개SW 재현성을 요약하고 pre-1.0 API·추가 기기 검증 한계를 정직하게 언급 |

## 녹화 원칙

- 모든 숫자는 최종 `output/renderer-benchmark` 또는
  `output/smoothness-benchmark` JSON에서 복사한다.
- GPU 이름은 “RTX 3060”이라고 가정하지 말고 JSON의
  `browserGraphics.renderer`를 화면에 표시한다.
- Millsite 데이터는 `docs/DATASETS.md`의 출처 한정 문구를 사용한다.
- “모든 브라우저·모든 GPU에서 보장”처럼 검증 범위를 넘는 표현을 피한다.
- 네트워크 속도는 프로젝트 성능과 분리해 설명하고, 실패 장면을 잘라내는 대신
  재현 가능한 명령과 JSON을 근거로 남긴다.
- 자막은 기능명보다 사용자 이점과 검증 결과를 우선한다.

## 녹화 전 화면 준비

1. 브라우저 확대 100%, 1080p 이상, 상태 패널 글자가 읽히는 레이아웃을 사용한다.
2. 개발자 도구의 오류가 없는지 확인하고 알림·개인 탭·토큰을 숨긴다.
3. Autzen, Millsite, 로컬 파일 경로를 순서대로 미리 열어 네트워크 캐시 편향을
   설명하거나 초기화한다.
4. 최종 커밋 SHA와 `npm run qc:contest-device` 성공 로그를 별도 캡처한다.
5. 2분 50초 안에 끝나는 예비본을 만든 뒤, 공식 제한과 코덱·파일 크기를
   제출 페이지에서 다시 확인한다.
