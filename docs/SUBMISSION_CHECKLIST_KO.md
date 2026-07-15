# KOSSA 2026 출품 체크리스트

이 문서는 코드 완료와 참가자가 직접 해야 하는 외부 제출 작업을 분리한다.
기준 일정과 규정 링크는 [COMPETITION.md](COMPETITION.md)를 따른다. 7월 23일
오리엔테이션에서 세부 평가표가 공개되면 이 체크리스트를 다시 대조한다.

## 1. 참가 접수

- [ ] 2026년 7월 17일 18:00 이전에 참가 접수와 개발계획서 제출을 모두
  완료했다.
- [ ] 지정과제에서 GAIA3D 과제를 정확히 선택했다.
- [ ] 팀원, 소속, 역할, 기여율, 정부지원 이력을 실제 정보로 확인했다.
- [ ] 중복수혜, 대리개발, 저작권 관련 신고 항목을 참가자가 검토했다.
- [ ] 대회 진행 중 동일 프로젝트로 다른 정부지원 사업의 수상 또는 지원금
  수혜 사실을 알게 되면 인지일로부터 7일 이내에 주최 측에 신고할 담당자와
  기록 절차를 정했다.

## 2. 제출 커밋 고정

- [ ] 제출용 브랜치와 커밋 SHA를 기록했다.
- [ ] 공개 저장소를 로그아웃 상태에서도 읽을 수 있다.
- [ ] 깨끗한 clone에서 Node 22와 지정 npm 버전으로 `npm ci`가 통과한다.
- [ ] 출품 장비에서 `npm run qc:contest-device`가 통과한다.
- [ ] 깨끗한 Git worktree에서 생성된
  `output/contest-evidence/contest-evidence-manifest.json`을 보존하고
  `npm run evidence:contest:check`가 통과한다.
- [ ] `output/`의 최종 JSON·PNG·패키지 산출물을 별도 제출 폴더에 보존했다.
- [ ] 과거 샘플·스크린샷이 섞이지 않도록 clean clone의 최종 QC 산출물만
  제출 폴더에 복사했다.
- [ ] `git status`, 태그, 패키지 버전, `CHANGELOG.md`가 서로 일치한다.

## 3. 기능 근거

- [ ] 원격 Autzen 프리셋의 RGB/분류 렌더링을 시연했다.
- [ ] Millsite 대용량 COPC의 Range 요청, WKT 자동 CRS, camera LOD를 시연했다.
- [ ] 로컬 `File`/`Blob` 입력과 Custom URL + proj4 경로를 시연했다.
- [ ] coverage가 먼저 표시되고 detail이 이어지는 동작을 보여 줬다.
- [ ] 실제 WebGL renderer, FPS, p95 frame, 최초 응답, coverage를 JSON과 함께 제시했다.
- [ ] npm tarball을 임시 소비자 프로젝트에서 import/build한 근거를 제시했다.

## 4. 라이선스와 데이터

- [ ] 루트 MIT `LICENSE`와 소스 공개 범위를 확인했다.
- [ ] `npm run license:evidence:self-test`가 통과했다.
- [ ] `THIRD_PARTY_NOTICES.md`와 `docs/sbom.spdx.json`이 제출 lockfile과 일치한다.
- [ ] `docs/DATASETS.md`의 Autzen CC BY 4.0 표시와 기여자 표기를 보고서·영상에 반영했다.
- [ ] Millsite는 USGS 원본과 점 수·높이 범위가 일치하는 Hobu 호스팅 COPC라는
  근거 수준을 그대로 설명하고, byte-for-byte 원본 관계를 단정하지 않았다.
- [ ] 가능하면 Hobu의 서면 출처 확인을 보존하거나 공식 USGS 입력에서 COPC를
  재현한 절차·도구 버전·해시로 교체했다.
- [ ] 제출물에 비밀키, 사설 URL, 개인 데이터, 재배포 금지 데이터가 없다.

## 5. 결과보고서와 3분 영상

- [ ] [공식 결과보고서 양식 ZIP](https://api.osscontest.kr/static/uploads/46414fba-c473-4dae-b595-7214d635b494.zip)을
  사용했다.
- [ ] 결과보고서를 `HWP`/`HWPX` 또는 `DOC`/`DOCX` 편집본 1개와 같은
  내용의 PDF 1개, 총 2개 파일로 준비했다.
- [ ] 결과보고서 본문은 5페이지 이내로 작성하고, 맑은고딕 본문 10pt와
  양식의 용지 여백을 유지했으며, 제출본에서 작성 안내 페이지와 회색
  가이드 문구를 삭제했다.
- [ ] 두 보고서 파일의 기본 이름을
  `2026 오픈소스 개발자대회 결과보고서_접수번호(팀명)`으로 맞췄다.
- [ ] 문제, 과제 적합성, 구조, 핵심 구현, 성능, 검증, 라이선스, 한계를 근거와 연결했다.
- [ ] 팀원별 실제 역할과 기여율을 Git 이력과 모순 없이 작성했다.
- [ ] 붙임1에 라이브러리명, 버전, 라이선스, 공식 저장소 URL, 사용 목적을
  담은 사람이 읽을 수 있는 SBOM 표를 작성하고 `docs/sbom.spdx.json` 및
  제출 lockfile과 대조했다.
- [ ] 붙임2 AI 모델 활용 명세의 해당 여부를 확인했다. 현재 런타임에
  탑재·적용한 AI 모델은 없음을 명확히 구분하고, 개발 중 사용한 코딩·디버깅
  보조 AI 도구와 사용 범위, 사람이 검토·이해한 범위를 정직하게 작성했다.
- [ ] 정부 지원사업 참여 이력이 있으면 완료·진행·결과 대기 중인 이력을
  빠짐없이 적은 `출품작 중복수혜 여부 확인서`를 작성·서명해 함께 제출했다.
- [ ] 시연영상을 YouTube에 업로드하고 결과보고서에 공개 접근 가능한 URL을
  기재했으며, 별도 영상 파일을 제출물로 준비하지 않았다.
- [ ] 영상 길이가 3분을 넘지 않고 1080p에서 코드·상태·수치가 읽힌다.
- [ ] 네트워크 장애에 대비한 캡처와 로컬 파일 시연 예비본을 준비했다.
- [ ] 영상 속 수치가 같은 제출 커밋의 최종 JSON과 일치한다.

## 6. 저장소 운영

- [ ] GitHub Private vulnerability reporting을 활성화하고 외부 계정으로 확인했다.
- [ ] CI, Example Browser Smoke, CodeQL의 제출 커밋 실행이 모두 성공했다.
- [ ] Dependabot 설정과 `SECURITY.md`의 링크가 실제 저장소에서 동작한다.
- [ ] 수상 시 공개 저장소를 5년간 유지할 담당자와 백업 계획을 정했다.

## 제출 직전 명령

```powershell
npm ci
npm run license:evidence:self-test
npm audit
npm run qc:contest-device
npm run evidence:contest:check
git diff --check
git status --short
```

`qc:contest-device`는 마지막에 매니페스트 생성과 검사를 모두 실행하므로
다음 줄의 `evidence:contest:check`는 제출 직전 바이트가 그대로인지 확인하는
의도적인 재검사다. 이 절차는 변경 사항이 없는 clean worktree에서 실행한다.
명령 출력, 최종 커밋 SHA, 실제 GPU 이름, 실행 시각을 함께 보존한다. 외부
서비스 설정과 접수 완료 여부는 자동화된 저장소 QC가 대신 증명하지 못한다.
