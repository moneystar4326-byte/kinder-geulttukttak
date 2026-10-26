# 어린이집 글뚝딱 — 어린이집 블로그 작가 (Windows 설치형)

어린이집 원장님 · 선생님이 오늘 있었던 놀이 · 생활을 한 줄 적거나 말로 넣으면, 학부모가 읽을 네이버 블로그 글(제목 후보 3개 · 본문 공백 제외 1,500자 이상)과 카드뉴스 3장을 만들고, 직접 로그인한 네이버 블로그 편집기에 초안을 넣는 프로그램. **최종 저장 · 발행은 사용자가 직접** 누른다.

- 기획안: `D:\어린이집글뚝딱\어린이집글뚝딱_기획안_v0.1.md` (v0.1) · 기획안 페이지(v0.2, 2026-10-27)
- **태권 글뚝딱(`D:\글뚝딱버전2`)에서 2026-10-27 완전히 떼어 낸 독립 프로젝트.** 코드를 같이 쓰지 않음. git 기록은 태권 글뚝딱 2.2.7까지 이어받음.
- 두 앱에 같은 부분(네이버 블로그 입력 `src/main/services/browser-draft/`, OpenAI 연결, 카드 합성 등)을 고칠 때는 **양쪽을 따로 고침** (한쪽에서 고친 뒤 다른 쪽에 같은 수정을 옮김).

## 실행 · 빌드

Node.js 20 이상 (개발 PC: Node 25.6, npm 11.9).

```bash
npm ci
npm run build     # out/ 에 메인 · 화면 빌드
npm start         # 앱 실행 (VS Code 터미널이면 아래 주의)
npm test          # 단위 + 통합 시험
npm run lint      # 타입 검사
npm run dist      # Windows 설치파일 → release/어린이집글뚝딱-설치-1.0.0.exe
```

- **VS Code 안 터미널 주의**: VS Code 가 `ELECTRON_RUN_AS_NODE=1` 을 넣어 두어 `npm start` 가 멈춤. `env -u ELECTRON_RUN_AS_NODE npm start` (Git Bash) 또는 일반 터미널에서 실행. 설치본 사용자에게는 해당 없음. `npm ci` 뒤 electron 실행 파일이 없으면 `node node_modules/electron/install.js`.
- 시험 때 데이터 폴더를 따로 쓰려면 `GTD_DATA_DIR=폴더`.

## 무엇이 태권 글뚝딱과 다른가 (기획안 v0.2)

- **글쓴이**: 원장님 · 선생님 목록(어린이집 정보) → 글마다 "누가 쓰는 글인가요?" (원장님은 어린이집 시점, 선생님은 "저희 ○○반" 시점), 글 끝 글쓴이 한 줄(선택)
- **글 종류 이름**: 놀이 · 활동 이야기 / 성장 이야기 / 행사 안내 / 입소 안내 / 보육 정보 (저장 값은 예전 이름 그대로 — `src/shared/daycare.ts` 의 `kindLabel`)
- **글 규칙**: 영유아 개인정보, 입소 약속 · 보육료 · 진단 · 발달 효과 금지, 영아에게 맞는 말. 흐름 다듬기 · 사실 점검(4단계)에 어린이집 확인 항목을 더함
- **코드 점검**: 메모 속 아이 이름(이름 글자 · 성씨로만 판단), 사실에 없는 금액(숫자로 비교), 입소 약속 · 진단 표현, 체크하지 않은 서비스
- **카드뉴스**: 어린이집 카드 역할, 제목과 답 맞추기 + 만든 뒤 한 번 더 점검, 재료가 한 줄뿐이면 질문 제목 금지, 카드 문구의 아이 이름은 "한 친구"로
- **그림**: 영유아 나이(영아 · 유아), 원복 · 교실 참고 사진, 장면이 바깥이면 바깥 · 실내 낱말이 있으면 교실, 안전한 장면, 얼굴은 그림체로
- **제목 머리말**: 500m 안 아파트 기준 `[롯데낙천대아파트 어린이집]`, 소재 동 이름은 세 편에 한 번
- **디자인**: 강조색 한 줄 장식, 굵은 본문 글꼴 제목, 기본 색 #3E8E6E · #F2A541
- **자료 분리**: 자료 폴더 `%APPDATA%\어린이집 글뚝딱`, 위치 파일 `%APPDATA%\어린이집글뚝딱-자료위치.txt`, appId `kr.ddalkak.geulttukttak-daycare`, 백업 표시 `geulttukttak-daycare` → 태권 글뚝딱과 한 PC에 같이 깔아도 안 섞임

## 구조

Electron 44.9 (Chromium · Node 24.22) + React 19 + TypeScript + SQLite(`node:sqlite`, Electron 내장) + playwright-core 1.64.

```text
src/shared/daycare.ts             앱 이름 · 말 · 글 종류 이름 · 나이 판단 · 글쓴이
src/main/index.ts                 앱 시작 · 창 보안 · gtd-asset:// (자산 미리보기)
src/main/ipc/                     화면 ↔ 메인 통로 (zod 로 입력 검사, 키 원문은 화면으로 안 보냄)
src/main/db/                      SQLite 스키마 · 마이그레이션(user_version) · 저장소
src/main/credentials/             API 키 보관 (Electron safeStorage = Windows DPAPI, secrets.bin)
src/main/article.ts               글 생성 (초안 → 분량 보완 최대 2회 → 흐름 다듬기 → 사실 점검 → 버전 저장)
src/main/jobs/                    작업 실행 (중복 클릭 잠금 · 멈추기 · 재실행 시 interrupted)
src/main/backup.ts                TXT · Markdown · PNG · ZIP 내보내기, 백업 · 복원
src/main/services/openai/         글 · 이미지 어댑터, 지시문(prompts.ts), 그림 지시문(image-prompt.ts), 시험용 샘플(demo.ts)
src/main/services/naver-keywords/ 검색광고 키워드 도구 (서명 · 원문 보존 정규화)
src/main/services/nearby/         카카오 로컬로 주변 아파트 · 학교 · 역 이름 (선택)
src/main/services/card-renderer/  카드 HTML 틀 · 넘침 검사 · Electron 화면 밖 창으로 PNG
src/main/services/browser-draft/  네이버 전용 브라우저 · 편집기 조작(선택자는 editor.ts 에만)
src/main/license/                 홈페이지 이용권 (product=daycare)
src/preload/                      정해 둔 채널만 여는 통로
src/renderer/                     화면 (새 글 · 이력 · 어린이집 정보 · 설정 · 글 편집 · 카드), guide/ = 설치 도우미 대본
resources/fonts/                  카드 폰트 (OFL) + 라이선스 원문
tests/{unit,integration}/         시험, tests/fixtures/mock-editor.html = 모의 네이버 편집기
docs/음성안내-대본.json           안내 음성 녹음용 대본 (녹음 전)
```

데이터 폴더(`%APPDATA%\어린이집 글뚝딱`): `app.db` / `assets/`(카드 배경 · 합성본 · 로고 · 참고 사진) / `secrets.bin`(암호화된 키) / `browser-profile/`(네이버 전용 로그인) / `logs/`.

### 보안 메모
- 화면 창: nodeIntegration 끔 · contextIsolation · sandbox · CSP, 앱 밖 이동 · 새 창 · webview 막음. 외부 링크는 공식 주소 허용 목록만.
- 키: 등록 · 마스킹 보기 · 교체 · 삭제만. DB · 일반 설정 · 백업 · 로그에 원문 없음 (시험으로 확인).
- **한계**: safeStorage(DPAPI)는 평문으로 파일에 남지 않게 하는 것이고, 같은 Windows 계정의 사람 · 프로그램에게서 숨기는 절대 보호가 아님.
- 실제 아이 사진은 이미지 API로 보내지 않음 (원복 · 교실 참고 사진은 아이 얼굴이 없는 것만 쓰도록 화면에서 안내).

## 상태 (2026-10-27)

- 시험: 단위 · 통합 99개 통과 (`npm test`), 카드 실제 렌더링(크롬 · 엣지) 넘침 없음
- 실제 확인: 설치판 실행 · 화면 · 요요유치원 예시 설정, OpenAI 연결, 실제 AI로 글 · 카드 문구 생성(요요유치원 소풍 글)
- 아직 안 해 본 것: 실제 AI 그림 카드, 네이버 블로그 입력(시험용 블로그), 깨끗한 PC 설치 · 제거, 파일럿 어린이집 사용

## 남은 일

1. **홈페이지 서버**: 이용권에 `product` 넣기(지금은 같은 계정으로 두 앱을 다 씀), 어린이집 글뚝딱 최신 버전 알림(지금 `LATEST_FOR_DAYCARE = false` 로 꺼 둠 — `src/main/ipc/index.ts`)
2. **GPT 검토**: 강점 목록(`src/shared/strengths.ts`, 초안) · 글 규칙의 법 근거
3. **안내 음성**: 대본(`docs/음성안내-대본.json`) 녹음 → `src/renderer/public/voice/` (지금은 글자만)
4. **아이콘**: 지금은 태권 글뚝딱과 같은 그림 (`build/icon.png`)
5. **코드 서명 안 됨** → 설치할 때 Windows SmartScreen 경고가 뜰 수 있음

## API 설정 가이드

### OpenAI
1. platform.openai.com 로그인 → 결제 수단 · 크레딧 확인.
2. API keys → Create new secret key → 복사.
3. [설정] → OpenAI API 키 붙여넣기 → 저장 → [연결 확인].
4. 이미지 모델 권한 오류가 나면 카드는 [템플릿]으로 만들 수 있음.

### 네이버 검색광고 (선택)
1. searchad.naver.com 광고주 가입 · 로그인.
2. [도구] → [API 사용 관리] → 라이선스 발급 → **액세스 라이선스(API Key)**, **비밀키(Secret Key)** 복사.
3. **Customer ID**: SA API 사용 관리 화면 오른쪽 위 [검색광고 Key?] 를 누르면 나오는 숫자 (주소창의 광고 계정 번호와 다름).
4. [설정]에 셋 다 저장 → [연결 확인]. 없으면 새 글 화면에서 키워드를 직접 적으면 됨.

### 카카오 로컬 (선택, 제목 앞 아파트 · 동네 이름)
1. developers.kakao.com → 내 애플리케이션 → 앱 만들기 → 앱 키의 **REST API 키**.
2. [설정]에 저장 → [어린이집 정보]에 상세 주소 저장 → [카카오로 주변 찾기].

### 네이버 블로그
1. [어린이집 정보]에 블로그 주소(`https://blog.naver.com/아이디`).
2. [설정] → [브라우저 열기 · 로그인] → 열린 창에서 직접 로그인(2단계 인증도 직접).
3. 글 화면 → [네이버에 초안 입력] → 네이버 창에서 확인 → 직접 저장 · 발행.

## 확인 기록 (공식 문서, 태권 글뚝딱 때 확인)

| 날짜 | 문서 | 확인한 것 |
|---|---|---|
| 2026-10-18 | https://github.com/naver/searchad-apidoc (python-sample/signaturehelper.py) | 서명 = base64(HMAC-SHA256(secret, "timestamp.method.uri")) |
| 2026-10-18 | https://developers.openai.com/api/docs/models | gpt-6.1-sol(지능 · 비용 균형), gpt-image-2.5-flare |
| 2026-10-18 | https://developers.openai.com/api/docs/guides/image-generation | 1024x1536 세로 지원, 응답 data[0].b64_json |
| 2026-10-18 | https://developers.openai.com/api/docs/guides/structured-outputs | Responses API `text.format = { type: 'json_schema', name, schema, strict: true }` |

## 라이선스

사용한 라이브러리 · 폰트: [LICENSES.md](LICENSES.md).
