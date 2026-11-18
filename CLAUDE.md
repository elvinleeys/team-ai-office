# CLAUDE.md

조원이 AI와 대화하면 MCP 서버가 작업 상태를 저장하고, Next.js + React Three Fiber로 만든 아이소메트릭 3D 방에서 캐릭터 위치로 상태를 보여주는 팀 현황 서비스다. GitHub App으로 로그인해 저장소를 고르면 그 저장소가 방이 되고, 저장소 협업자가 조원이 된다.

- 요구사항의 기준은 `PRD.md`다. 기능 ID(F1~F15), 마일스톤(M1~M9), 열린 질문을 거기서 확인한다.
- 배경 설명과 용어는 `팀 작업 현황 3D 오피스 기획서.md`에 있다. 기획서는 GitHub 연동 이전 설계이므로, 다른 부분은 PRD를 따른다.
- PRD와 다르게 구현해야 하면 먼저 사용자에게 묻고, 합의되면 PRD도 함께 고친다.

## 현재 상태

- ✅ M1 완료: DB 스키마는 `supabase/migrations/`에 있고 원격 Supabase에 적용됐다. 기존 마이그레이션 파일은 고치지 말고 새 파일로 변경한다.
  - 연결된 프로젝트: ref `xzuksrczpdsnyslpiyiv` (ref는 URL이 아니라 20글자 ID). `supabase login`은 대화형이라 사용자가 별도 터미널에서 실행한다.
  - 원격 적용: `supabase db push --dry-run`으로 먼저 확인한 뒤 `supabase db push --linked`
  - 로컬 적용 (Docker 필요): `supabase start` 후 `supabase db reset`
  - RLS 검사: `supabase/tests/rls_check.sql`. 로컬은 `psql`로 실행한다. 원격은 `supabase db query --linked -f <파일>`로 실행하되, psql 전용 줄(`\set`, `\echo`)을 빼고 `rollback` 전에 `select 'RLS CHECK PASSED'`를 넣은 복사본을 쓴다. 테스트 데이터는 롤백된다.
  - 보안 점검: `supabase db advisors --linked`
- ✅ M2 완료: MCP 서버는 `mcp-server/` (Node 24, TypeScript를 빌드 없이 실행). 명령은 모두 `mcp-server/`에서 실행한다.
  - 환경 변수: `.env` (`.env.example` 참고). secret 키는 `supabase projects api-keys --reveal`로만 실제 값이 나온다.
  - 실행: `npm start` → `http://127.0.0.1:8787/mcp`
  - 타입 검사: `npm run check`
  - 테스트: `npm test` (원격 Supabase에 테스트 데이터를 만들고 지운다). `E2E_CLAUDE=1`이면 `claude -p` 실제 호출까지 검사한다.
  - 인증은 Supabase OAuth 2.1 서버다 (`supabase/config.toml` `[auth.oauth_server]`, 동의 화면 `web/src/app/oauth/consent`). MCP 서버는 토큰 없으면 401 + `WWW-Authenticate`로 `/.well-known/oauth-protected-resource`를 알려 주고, 토큰은 `db.auth.getUser`로 세션까지 확인해 `members.auth_user_id`로 조원을 찾는다. 공개 주소는 `MCP_PUBLIC_URL`(없으면 요청 Host).
  - Claude Code 연결: `claude mcp add team-office --transport http http://127.0.0.1:8787/mcp` 후 Claude Code `/mcp` → team-office → Authenticate (브라우저에서 GitHub 로그인 → 허용).
    - 프로젝트 루트(`office/`)에서 실행한다. local 설정은 폴더별로 저장된다. 다시 등록할 때는 `claude mcp remove team-office -s local` 후 add한다. 같은 이름이 있으면 add가 "already exists"로 거절된다.
  - 수동 호출: `node --env-file=.env test/call.ts <github_login> <tool> '<json>'` (웹에 로그인한 적 있는 조원으로, `test/session.ts`가 secret 키로 세션을 만든다 — 테스트·수동 확인 전용)
  - 수집기 로그인 시험: `node --env-file=.env test/collector-login.ts` (서버가 8787에서 켜져 있어야 함)
  - DB 스키마를 바꾸면 `supabase gen types typescript --linked --schema public > mcp-server/src/database.types.ts`로 타입을 다시 만든다.
  - DB 접근은 `src/db.ts`의 `must`(결과 필수) / `maybe`(maybeSingle) / `check`(쓰기) 헬퍼를 거친다.
- 🟡 M3 진행 중: 웹은 `web/` (Next.js 16.4, App Router, `cacheComponents` 켜짐). 명령은 `web/`에서 실행한다.
  - Next.js 16은 학습 데이터와 다르다. 코드를 쓰기 전에 `web/node_modules/next/dist/docs/`의 해당 문서를 읽는다 (`web/AGENTS.md`). middleware는 `src/proxy.ts`다.
  - `cacheComponents` 때문에 `cookies()`·`searchParams`·`params`를 읽는 컴포넌트는 `<Suspense>` 안에 둔다. 아니면 빌드 오류.
  - 환경 변수: `.env.local` (`.env.example` 참고). GitHub App 값은 `node scripts/create-github-app.mjs`가 채운다.
  - 실행: `npm run dev` → http://localhost:3000 (MCP 서버도 함께 띄운다)
  - 검사: `npx tsc --noEmit`, `npm run lint`, `npm run build`
  - `src/lib/*`는 `server-only`라 Node 스크립트에서 직접 import할 수 없다.
- 🟡 M8 로컬 수집기: `collector/` (Node 22.18+, 의존성 없음). 명령은 `collector/`에서 실행한다.
  - 환경 변수: `.env` (`.env.example` 참고). MCP 로그인은 처음 한 번 `node --env-file=.env collector.ts --login`(Claude Code와 같은 OAuth). 토큰은 `~/.team-office/collector.json`(이 PC에만)에 두고 만료 전에 자동 갱신한다.
  - 실행: `node --env-file=.env collector.ts` (15분 주기, 최소 10분), 1회만: `--once`
  - 테스트: `node collector.test.ts`
  - `five_hour`→MP, `seven_day`→HP. 서버로는 사용률·리셋 시각만 보낸다. 만료된 Claude 토큰은 갱신하지 않는다 (자격 증명 파일은 Claude Code만 고친다).
- 🟡 M9 GitHub Projects 연동·직접 선택 + 디자인 시안 v2: 구현·e2e 완료, 실제 칸반 확인은 남음 (PRD 12장 비고).
  - 칸반 동기화는 `mcp-server/src/sync.ts` 스케줄러가 한다 (`GITHUB_SYNC_SECONDS`, 기본 45·최소 30, 0이면 끔). mcp-server `.env`에 `GITHUB_TOKEN_ENC_KEY`·`GITHUB_APP_CLIENT_ID`·`GITHUB_APP_PRIVATE_KEY`가 필요하다.
  - PAT 암호화 키 `GITHUB_TOKEN_ENC_KEY`(32바이트 base64)는 `web/.env.local`과 `mcp-server/.env`에 같은 값으로 둔다. 바꾸면 저장된 PAT를 다시 등록해야 한다.
  - 암호화 형식은 `mcp-server/src/secret.ts`와 `web/src/lib/secret.ts`가 같다. 한쪽을 바꾸면 둘 다 고친다.
  - **UI 기준은 디자인 시안 v3 `team-office-3d-v3/design-guide.md`다** (0장 빠른 규칙 → 3장 컴포넌트 → 5장 페이지, 끝나면 9장 체크리스트). 페이지 마크업은 `source/mockup/*.dc.html`. 3D 방 좌표·겹침 규칙은 v2와 같다. 스프라이트·방 이미지는 `web/public/v2/`에 복사해 쓴다(v3 이미지와 같은 파일).
  - 이름표 배치 검사: `node src/components/labelLayout.test.ts` (`web/`에서)
- Supabase Auth 설정은 `supabase/config.toml`에 있다. 원격 반영 전 `supabase config diff`로 의도한 항목만 바뀌는지 확인하고 `supabase config push`. GitHub secret은 `env(GITHUB_APP_CLIENT_SECRET)`로 참조하므로 실행 셸에 환경 변수로 넣는다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| 프론트엔드 | Next.js, TypeScript |
| 3D | Three.js, React Three Fiber, drei |
| 인증 | Supabase Auth (GitHub provider), GitHub App |
| MCP 서버 | Node.js, @modelcontextprotocol/sdk (HTTP transport), zod |
| DB | Supabase (PostgreSQL + RLS) |
| 배포 | Vercel (프론트), 별도 서버 (MCP) |

새 의존성은 위 스택으로 해결되지 않을 때만 추가하고, 추가 전에 사용자에게 묻는다.

## 아키텍처 규칙

- **이슈·사용량 쓰기는 MCP 서버만 한다. 상태(직접 선택) 쓰기는 MCP와 웹 서버 액션이 같은 DB 함수 `set_status`·`release_status`로만 한다** (service_role만 실행, statuses·logs를 한 트랜잭션으로). 2026-11-18 M9에서 바꿨다 — Claude Code를 안 쓰는 디자인·기획 조원도 상태를 골라야 해서 (PRD 7장).
- **칸반 카드·동기화 상태는 mcp-server 동기화만 쓴다.** GitHub → 대시보드 단방향이다. 대시보드에서 GitHub로 쓰지 않는다.
- **최종 상태는 DB 뷰 `effective_statuses` 한 곳에서만 계산한다.** (유효한 직접 선택 > status_source가 github이면 칸반 > 기존 값). 웹·MCP는 이 뷰를 읽고, 우선순위를 코드에서 다시 계산하지 않는다.
- **웹의 쓰기는 서버 측 코드만 한다.** 로그인 연결, 방 생성, 협업자 동기화, MCP 연결 승인·해제(사용자 세션으로 Supabase OAuth API 호출), 직접 선택, 캐릭터·파트 선택, 방장 칸반 설정은 Server Action(`web/src/app/actions.ts`)과 Route Handler가 secret 키(`supabaseAdmin()`)로 처리한다. 모든 액션은 로그인과 권한을 다시 확인한다. 브라우저 코드에서 Supabase에 insert/update/delete하지 않는다.
- **브라우저는 로그인 사용자 권한으로 읽기만 한다.** 접근 제어는 RLS에 맡기고, 클라이언트 코드에서 권한을 거르지 않는다.
- **MCP 호출자는 OAuth 액세스 토큰(Supabase 로그인 세션)으로 식별한다.** tool 입력으로 이름이나 member id를 받지 않는다. 호출자가 `repo` 방의 active 조원인지 항상 검사한다.
- **MCP tool은 얇게 유지한다.** 토큰 확인, zod 검증, DB 저장·조회만 한다.
- **상태·구역·좌표는 `web/src/constants/office.ts`(시안 v2 상수) 하나로 관리한다.** 문구 `STATUS_LABEL`, 색 `STATUS_COLOR`, 자리 `WORK_SLOTS`·`ZONE_SLOTS`, 구역 `ZONES`·`ZONE_INFO`. 컴포넌트에 하드코딩하지 않는다.
- **구현 순서는 데이터 → MCP → 화면이다.** 단계마다 동작을 확인한 뒤 다음 단계로 간다 (PRD 12장).

## 보고 언어

- **사용자에게 보내는 모든 보고·설명·질문은 한국어로만 쓴다.** 도구 결과·코드·오류 메시지가 영어여도, 긴 작업 중간 보고여도 예외 없다. 코드 식별자·명령어·고유 명사만 원문 그대로 둔다. (2026-11-18 사용자가 세 번 지적함)

## 진행 표시 규칙

- 작업이 끝나면 PRD 12장 마일스톤 표의 상태 칸과 비고를 바로 갱신한다.
  - ✅ 완료: 완료 기준을 실제 환경에서 확인했을 때만 쓴다.
  - 🟡 진행 중: 일부만 됐거나 임시 환경에서만 확인했을 때. 비고에 끝난 일(✅)과 남은 일(⬜)을 날짜와 함께 적는다.
  - ⬜ 대기: 시작 전.
- 확인하지 않은 작업에 ✅를 붙이지 않는다. 코드를 작성만 하고 실행하지 않았으면 🟡다.
- 작업 완료를 사용자에게 보고할 때도 항목마다 같은 기호(✅ / 🟡 / ⬜)를 붙인다.

## 도메인 규칙

- 저장소 하나 = 방 하나(`rooms`). 한 사람이 여러 방에 속할 수 있다.
- 직접 선택 status는 `coding`, `meeting`, `break`, `done` 4개로 고정한다. 다른 값은 zod와 DB에서 모두 거부한다. `idle`(대기)은 뷰가 계산하는 표시 전용 값이고 logs에만 남는다.

| status | 표시 이름 | 구역 (방 18×14, 시안 v2) |
| --- | --- | --- |
| coding | 작업 중 (DB 값은 coding 유지) | 뒤 왼쪽: 개발 모니터 책상 / 디자인 드로잉 책상 / 기획 화이트보드 (파트별 하위 자리) |
| idle | 대기 | 뒤 오른쪽 대기석 벤치 (출입문 옆) |
| meeting | 회의 중 | 앞 가운데 원형 테이블 |
| break | 휴식 중 | 앞 오른쪽 소파 |
| done | 완료 정리 | 앞 왼쪽 책장 앞 |

- 칸반 열 기본 매핑: Backlog·Ready → idle / In progress → coding / In review → coding + 검토 중 / Done → done(30분) 후 idle. 방별 매핑은 `rooms.github_config.columns`. GitHub 열 이름은 그대로 저장하고 화면만 한국어로.
- 직접 선택 해제 방식: timed(기본 2시간) / pinned(해제할 때까지). 덮어쓰기 중에도 칸반 카드는 저장만 하고 화면은 직접 선택을 유지한다.
- 캐릭터 카드(냥냥 `nyang`·새싹 `sprout`·삐삐 `ppi`·몽글 `mong`)와 파트(dev·design·plan)는 방별로 처음 들어올 때 고른다 (필수, 기본값 없음).

- 상태는 방별·조원별 1행이다. 상태를 바꿀 때는 `statuses`를 갱신하고 `logs`에도 한 줄 남긴다.
- 이슈는 status와 별개다. open 이슈가 있으면 status와 상관없이 `!` 배지를 띄운다.
- HP는 7일 한도, MP는 5시간 한도다. 사람 단위로, 절대값이 아니라 사용률(0~100%)로 저장한다.
- MP가 바닥난 조원은 `break` 구역에 "MP 회복 중"으로 표시한다. 화면 표시만 바꾸고 DB status는 바꾸지 않는다 (`Room`의 `seat()`). MP 리셋 시각이 지나면 원래 구역으로 돌아간다.
- 저장소에서 빠진 협업자는 삭제하지 않고 `room_members.active = false`로 바꾼다. 삭제하면 이력이 사라진다.
- MCP를 연결하지 않았거나 상태가 없는 조원은 흐리게 "미연결"로 표시한다. 가운데 통로(`ZONE_SLOTS.offline`)에 반투명으로 서고, 이름은 "미연결 · 이름들" 묶음 라벨 하나로 보여준다.

## 데이터 모델

`members`, `rooms`, `room_members`, `statuses`, `usage`, `issues`, `logs`, `github_cards`, `room_secrets` 9개 테이블과 뷰 `effective_statuses`다. `room_secrets`(PAT 암호문)는 정책 없음 = 서버만 접근. 필드와 RLS 규칙은 PRD 9장을 따른다. 스키마를 바꾸면 PRD도 같이 고친다.

## GitHub App

- App: `team-office-00e6d3` (https://github.com/apps/team-office-00e6d3). 권한은 Repository `Metadata: read`, Account `Email addresses: read`다. Organization `Projects: read`는 2026-11-18 사용자가 추가를 승인했고 GitHub App 설정 화면에서 아직 추가하지 않았다(조직 칸반용). 다른 권한이 필요해지면 먼저 사용자에게 묻는다.
- 개인 계정 소유 Projects는 App 토큰으로 읽지 못한다(실제 호출 0개). 방장이 방 설정에서 classic PAT(`read:project` 하나만, 등록 시 검사)를 등록한다.
- 저장소 목록은 사용자 토큰으로, 협업자 목록은 installation token으로 조회한다 (PRD 7.1).

## MCP tool

`update_status`(mode: timed 기본 / pinned), `release_status`, `log_done`, `get_team_status`, `get_member_history`, `report_usage`, `report_issue`, `resolve_issue` 8개다. 입력과 동작은 PRD 10장을 따른다.

## 프론트엔드 규칙

- 3D 컴포넌트에는 `'use client'`를 붙인다. SSR 오류가 나면 `next/dynamic`의 `ssr: false`로 불러온다.
- 컴포넌트 이름: `Room`, `Furniture`, `Avatar`, `GaugeBar`, `IssueBoard`, `HistoryPanel`, `CharacterSelect`, `RepoPicker`, `McpPanel`(Claude 연결 안내·연결된 앱 해제), `McpDecision`(허용·취소 결과), `KanbanLinkForm`(방 설정 1·2), 공용 조각 `ui.tsx`(24px 아이콘 `I24`·`Back`·`Cube`·`Notice`)·`CopyCode`. 화면: MCP 연결 허용 `/oauth/consent`, 캐릭터·파트 선택 `/rooms/[id]/character`, 방장 설정 `/rooms/[id]/settings`.
- 스타일은 `web/src/app/office-ui.css`(시안 v3 `styles/office-ui.css` 복사본, 토큰·`.btn`·`.card`·`.seg`·`.choice` 등) 클래스로만 쓴다. 기본 버튼·라디오·어두운 입력칸·다크 배경을 쓰지 않는다. 시안에 없는 것만 `globals.css`에 둔다(3D 이름표는 `.mg`·`.floor-label`처럼 office-ui.css와 겹치지 않는 이름).
- MCP 허용·취소는 페이지를 Claude Code 콜백으로 넘기지 않고 숨은 iframe으로 결과를 전달한 뒤 시안의 "연결됐어요" 화면을 보여준다(실패 대비 직접 여는 링크 포함, 2026-11-18 사용자 결정).
- 카메라는 정사영(orthographic)으로 아이소메트릭 시점을 유지한다.
- 같은 구역에 여러 명이 있으면 작업 구역은 `takeWorkSlot`(파트별 자리, 부족하면 다른 파트 자리), 나머지는 `ZONE_SLOTS[구역]`을 순서대로 배정한다.
- 이름표·말풍선은 시안 v2 `docs/overlap-rules.md`대로 `labelLayout.ts`(순수 함수)가 배치한다. 크기는 `ResizeObserver` 콜백에서만 재고, 계산은 상태·선택·크기가 바뀔 때만 한다. HUD(이슈 보드 버튼·동기화·안내·범례)는 방 구석 고정이고 배치 금지 구역이다.
- 상태·파트·출처는 색만으로 구분하지 않는다 (아이콘 또는 텍스트를 같이 쓴다).
- drei `Html`에는 `portal={방 컨테이너 ref}`를 넘긴다. 기본 부착 위치가 첫 렌더 뒤에 바뀌어서 첫 번째 `Html`이 빈 채로 남는다 (M4에서 구역 라벨 하나가 사라졌다).
- 클릭을 받지 않는 drei `Html`(이름표·라벨)에는 `style={NO_POINTER}`(`pointerEvents: 'none'`)를 넘긴다. `pointerEvents` prop은 `transform` 모드에서만 적용되고, CSS transform으로 옮긴 이름표의 원래 상자가 캐릭터를 덮어 클릭을 가로챈다 (M6에서 캐릭터 클릭이 안 됐다).
- 장기 작업 경고 기준은 `LONG_TASK_MS`(1시간, coding 상태만)다.
- HP·MP 바(`GaugeBar`)는 이름표 2줄째(미니 게이지)와 이력 패널에 붙인다. DB는 쓴 양, 게이지는 남은 양(100 − 사용률)이다. HP는 빨강, MP는 파랑, 남은 양 20% 이하면 깜빡이고 리셋까지 남은 시간을 함께 표시한다. 마우스를 올리면 툴팁으로 "100% 중 몇 % 남음"을 보여준다. 게이지만 `pointer-events: auto`로 마우스를 받고, 리셋 시각이 지난 값은 100% 남음으로 그린다.
- 에셋은 시안 v2 스프라이트(`web/public/v2/`)와 기본 도형을 쓴다. 3D 모델 교체는 2026-11-18 사용자 결정으로 보류했다(대안 없음, 나중에 바뀔 수 있음).
- 방 화면 갱신은 Supabase Realtime(`postgres_changes`, `Room`의 `useRoomData`)으로 받고 30초 폴링을 함께 둔다 (Done 30분·직접 선택 만료·MP 리셋처럼 시간이 지나 바뀌는 상태는 DB 이벤트가 없다). DELETE 이벤트는 RLS가 적용되지 않으므로 INSERT·UPDATE만 구독한다. 구독 테이블을 늘리면 `supabase_realtime` publication에도 추가한다.

## 보안 (반드시 지킬 것)

- 방 데이터는 그 방의 active 조원만 읽을 수 있어야 한다. RLS 정책을 바꾸면 `supabase/tests/rls_check.sql`을 갱신하고 다시 실행한다.
- `~/.claude/.credentials.json`의 토큰은 로컬 수집기 밖으로 보내지 않는다. 서버로는 `{ hp, mp, resets_at }`만 보낸다.
- 방장 GitHub PAT는 `room_secrets`에 AES-256-GCM 암호문(room_id를 AAD로 묶음)으로만 저장한다. 원문·암호문을 브라우저·로그·오류 메시지에 내보내지 않는다. 화면에는 끝 4자리·주인·만료일만 보여준다.
- MCP 토큰은 Supabase OAuth 서버만 발급·보관한다. 웹·MCP 서버는 토큰을 저장하거나 화면·로그에 내보내지 않는다. 수집기 토큰은 그 PC의 `~/.team-office/collector.json`(권한 600)에만 둔다.
- 로그인 후 돌아갈 경로(`login_next` 쿠키)는 같은 사이트 경로(`/`로 시작, `//` 아님)만 허용한다 (open redirect 방지).
- Supabase service_role 키, GitHub App private key·client secret, VAPID 비공개 키는 서버 환경 변수로만 쓰고 커밋하지 않는다. `.env*`는 `.gitignore`에 넣는다. 브라우저 번들에 들어가는 `NEXT_PUBLIC_*`에 비밀 값을 넣지 않는다.
- 사용량 조회 주기는 10분 이상으로 둔다.
- `/api/oauth/usage`는 비공개 API다. 실패해도 동작하도록 `report_usage` 자기 보고 경로를 항상 남겨 둔다.

## 열린 질문

아래 항목은 임의로 정하지 말고 사용자에게 묻는다.

- ~~MCP 서버 배포 위치~~ → 2026-11-18 결정: 웹 Vercel, MCP 서버 Cloudflare (PRD 14장)
- 조원별 Claude 플랜
- 방 생성 권한 (현재 가정: 협업자 누구나)

## 실수로부터 배운 규칙

무언가 의도대로 동작하지 않았다면, 고친 뒤 이 섹션에 규칙을 한 줄 추가해 같은 실수가 반복되지 않게 한다.

- **추가 시점:** 버그를 고쳤을 때, 사용자가 잘못된 동작을 지적했을 때, 같은 오류로 두 번 이상 막혔을 때
- **형식:** `- [YYYY-MM-DD] 규칙 — 이유 (무슨 일이 있었는지 한 줄)`
- 규칙은 "~하지 않는다"보다 "~한다"처럼 바로 따라 할 수 있게 쓴다.
- 이미 있는 규칙과 겹치면 새로 쓰지 말고 기존 규칙을 고친다.
- 위의 다른 섹션에 넣는 게 맞는 규칙이면 그 섹션을 고치고, 여기에는 적지 않는다.
- 규칙을 추가하거나 고쳤으면 사용자에게 알린다.

- [2026-11-17] Supabase secret 키는 `supabase projects api-keys --reveal`로 받는다 — `--reveal` 없이 받은 가려진 값을 `.env`에 넣어 `Invalid API key`가 났다.
- [2026-11-17] supabase-js에서 `.order()`에 쓰는 컬럼은 `.select()`에도 넣는다 — insert 후 `select('id').order('github_id')`가 `column does not exist`로 실패했다.
- [2026-11-17] 같은 Node 프로세스에서 서버를 띄운 테스트는 자식 프로세스를 비동기(`execFile` + `promisify`)로 실행한다 — `execFileSync`가 이벤트 루프를 막아 MCP 서버가 응답하지 못하고 `claude -p`가 연결 시간 초과됐다.
- [2026-11-17] Windows에서 `.exe` 실행 파일은 `shell: true` 없이 실행한다 — shell을 거치면 공백 있는 인자가 쪼개진다.
- [2026-11-17] GitHub App manifest에는 `hook_attributes`를 넣지 않고(localhost URL은 비활성이어도 거부), 이메일 권한 키는 `emails`로 쓴다 — `email_addresses`와 localhost 웹훅 URL 때문에 "Invalid GitHub App configuration"이 났다.
- [2026-11-17] `supabase config push` 전에 `config diff`로 확인하고, 바꿀 의도가 없는 항목은 로컬 값을 원격 값에 맞춘다 — config.toml 기본값이 원격의 MFA·이메일 확인·커넥션 풀 설정을 바꿀 뻔했다.
- [2026-11-17] GitHub 2단계 인증 화면을 거치면 manifest POST 내용이 사라진다. 인증 후 manifest 페이지(http://localhost:3999/)를 다시 연다.
- [2026-11-17] R3F에서 매 프레임 바꾸는 three 객체(카메라·메시 그룹)는 `useRef`로 잡은 JSX 요소(`<group ref>`)나 drei 컴포넌트 props로 다룬다 — React Compiler 린트가 `useThree`·`useMemo`가 돌려준 값을 effect·`useFrame`에서 수정하면 `This value cannot be modified` 오류를 낸다 (M4 카메라, M5 캐릭터에서 두 번 막혔다).
- [2026-11-17] `web/`에서 Supabase auth 등 내부에서 `Date.now()`·`Math.random()`을 쓰는 코드는 `await connection()` 뒤에서 호출한다 (`getMe()`가 이미 한다). 빌드 통과만으로는 못 잡으니, 로그인한 상태로 각 화면을 열어 dev 서버 로그에 `unstable value` 오류가 없는지 본다 — 로그인 후 모든 화면이 사전 렌더링 오류로 갱신되지 않았다.
- [2026-11-17] 테스트용 dev 서버를 끝낼 때는 포트를 잡은 node 프로세스까지 종료하고(`Get-NetTCPConnection -LocalPort <포트>` → `Stop-Process`), 포트가 비었는지 확인한다 — Windows에서 백그라운드 셸만 멈추면 `next dev` 자식 프로세스가 남아, 사용자가 `npm run dev`를 실행했을 때 "Another next dev server is already running"이 났다.
- [2026-11-18] ref 콜백은 렌더마다 새로 만들지 않는다 (`ref={make(key)}` 금지). 측정이 필요하면 안정된 콜백이나 컨테이너에서 `querySelectorAll`로 찾는다 — 새 콜백이 매 렌더 분리(null)→측정→setState를 반복해 "Maximum update depth exceeded"로 방 화면이 멈췄다.
- [2026-11-18] supabase-js로 여러 행을 insert할 때는 모든 행에 같은 키를 넣는다 — 키가 빠진 행은 DB 기본값이 아니라 null로 들어가 not-null 제약에 걸렸다 (e2e `github_cards` 픽스처).
- [2026-11-18] 뷰에서 후보 행 여러 개 중 하나를 고를 때는 열마다 `coalesce(p.x, d.x)` 하지 말고 `case when p.id is not null then p.x else d.x end`로 같은 행에서 가져온다 — 초안 카드(url null)에 최근 Done 이슈의 URL이 섞였다 (`effective_statuses`, 실제 칸반 확인 중 발견).
- [2026-11-18] `supabase db query -o csv`의 큰 정수(installation_id 등)는 지수 표기로 나오니 스크립트 인자로 쓸 때는 `::text`로 캐스팅해 읽는다 — `1.82853999e+08`을 그대로 넘겨 App 토큰 발급이 401이 났다.
- [2026-11-18] PowerShell 5.1에서 한글이 든 인자를 `gh api graphql` 등 외부 명령에 넘길 때는 Bash 도구를 쓴다 — PowerShell이 인코딩을 깨뜨려 GraphQL 파싱 오류가 났다.
- [2026-11-18] Supabase OAuth 동의를 코드로 승인할 때는 `getAuthorizationDetails(id)`를 먼저 부른 뒤 `approveAuthorization`한다 — 바로 승인하면 data가 null로 실패했다 (수집기 로그인 시험).
- [2026-11-18] Bash에서 `node -e "..."`처럼 큰따옴표로 감싼 코드에는 백틱을 넣지 않는다. 긴 치환은 스크립트 파일(quoted heredoc)로 실행한다 — 셸이 백틱을 명령으로 실행해 PRD 문구 일부가 지워졌다. `python`은 이 PC에서 Store 스텁이라 멈추니 쓰지 않는다.
- [2026-11-18] 많이 import되는 파일이나 여러 컴포넌트를 통째로 바꾼 뒤 dev 서버에서 "undefined" 모듈 오류·hydration 불일치가 나면, dev 서버를 재시작하거나 `npm run build` 후 `npx next start -p 3100`으로 확인한다(끝나면 3100 포트 프로세스 종료) — 방 설정 화면이 `STATUS_LABEL` undefined로 500이 났고, v3 디자인 교체 후 캐릭터 선택 화면이 dev 서버에서만 hydration 불일치가 났다(빌드 서버는 정상).
