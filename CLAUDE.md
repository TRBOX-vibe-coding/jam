# 홀릭잼(HOLIC GEM) 작업 규칙

기획·개발 주체는 **티알박스(TRBOX)**. 대외 문서 명의는 항상 티알박스로 쓴다.

## 커밋과 푸시 — 반드시 지킬 것

**작업 단위가 끝날 때마다 커밋하고 origin까지 민다. 물어보지 않는다.**

- 한 가지 일을 끝내면 그 자리에서 커밋한다. 여러 작업을 몰아서 한 번에 커밋하지 않는다.
- 커밋한 뒤에는 바로 푸시한다. 로컬에만 쌓아두지 않는다.
- 배포까지 한 작업이면 배포 전에 커밋을 끝내둔다.
- 턴을 끝내기 전에 `git status`가 깨끗하고 미푸시 커밋이 없는지 확인한다.

```bash
git add -A && git commit -F - && git pull --rebase origin master && git push origin HEAD:master
```

로컬 브랜치 이름이 무엇이든 푸시 대상은 `origin master`다. 저장소는
`TRBOX-vibe-coding/jam`.

커밋 메시지는 한국어 평서문 한 줄로 시작하고(`~한다.`), 왜 그렇게 했는지를 본문에 적는다.
Git Bash에서는 `-m @'...'@`(PowerShell 문법)이 통하지 않는다. `-F -`와 heredoc을 쓴다.

## 보고

작업이 끝나면 **"✅ 작업 끝났습니다"**를 명시한다. 진행 중이면 진행 중이라고 명시한다.
대표 공유용 문서에는 시연 주소, "남은 것", "완료" 표기를 넣지 않는다.

## 저장소 구조

| 경로 | 내용 |
|---|---|
| `packages/db` | Prisma 스키마, Postgres(5433) |
| `apps/api` | NestJS API(4000) |
| `apps/mobile` | Expo 유저 앱(웹 배포) |
| `apps/admin` | 본사 관리자 웹 |
| `apps/partner` | 점주(사장님) 웹 |

## 개발 환경

```bash
cd packages/db && npm run dev:db      # DB
cd apps/api && npm run start:dev      # API (감시 모드 아님 — 코드 고치면 반드시 재시작)
```

`prisma db push`는 API를 내린 뒤에 한다(포트 4000 점유).
스키마를 바꾸면 `npx prisma generate`까지 해야 API가 새 필드를 안다.

## 시연 서버 (이 PC 본체에서 돈다 — 2026-11-17부터)

시연 사이트 세 곳(유저 앱·본사·점주)의 DB·API·터널은 **이 PC 본체**에서 작업 스케줄러 작업 `HolicGem-Demo-Keeper`가 창 없이 돌린다.
90초마다 꺼진 것을 다시 켜고, 3시간마다 `demo:refresh`를 돌리며, 2027-01-01에 스스로 지워진다. 설치·끄기·고치기: `tools/demo-host/README.md`.

- **클로드의 Bash·PowerShell 도구는 보호된 임시 공간에서 돈다.** 거기서 켠 서버는 작업이 끝나면 같이 꺼지고, `%LOCALAPPDATA%` 아래에 만든 파일은 이 PC에 남지 않는다(이 PC의 `AppData\Local`에는 홀릭잼 파일이 없다). 그래서 "서버가 어제 꺼져 화면이 비었다"가 반복됐다. 서버를 켜거나 고칠 때는 **이 PC의 터미널 패널**(`run_in_terminal`)로 한다 — 한 줄·영문 경로만 되므로 긴 것은 scratchpad에 스크립트를 써 두고 실행한다.
- 상태 확인: 바깥 주소 세 곳의 `/api/home`이 200인지, `C:\Users\<나>\holicgem-demo-run\keeper.log`. 꺼져 있으면 터미널에서 `schtasks /run /tn HolicGem-Demo-Keeper`.
- 터미널 패널의 PowerShell은 `npx.ps1`을 막는다 → `npx.cmd`로 쓴다.
- DB 백업·되돌리기: `cd packages/db && npm run demo:backup -- <폴더>` / `npm run demo:restore -- <폴더>`.

### 시연 데이터 날짜 맞추기

시드는 '시드한 날' 기준으로 날짜를 만들어서, 며칠 지나면 DROP이 마감되고 오늘 판매·사용이 비고 기획전이 끝나고 예약 시간대가 사라진다.

```bash
cd packages/db && npm run demo:refresh   # 시연 데이터를 지금 날짜에 맞게 다시 채운다 (몇 번 돌려도 된다; 지킴이가 3시간마다 돌린다)
cd packages/db && npm run demo:check     # 날짜별로 빈 곳이 없는지 읽기만 해서 보여 준다
```

`demo:refresh`가 하는 일 (실서비스 DB에는 돌리지 않는다):

- `refresh-demo.ts` — DROP 다시 열기 · 승인 대기 기간 연장 · 예약 시간대 · 시연 손님 예약·여행 · 오늘 티켓 판매
- `demo-live.ts` — **2026-12-31(`DEMO_UNTIL`)까지** 비지 않게 채운다. 12월을 넘겨 쓰려면 이 날짜를 바꾸고 다시 돌린다.
  - 기획전·기획전 상품·광고·딸린 쿠폰 기한을 12/31까지, 12/24·12/31 날짜 있는 티켓, 예약 시간대·예약을 날마다
  - **지난달 1일부터 오늘까지** 가입·잼 구매·이용권 구매·사용·딜 사용·잼 화면 조회·서프홀릭 판매/사용을 날짜별로 (앱과 같은 API로 만든 뒤 시각을 과거로 되돌린다)
  - 정산(정산일마다 생긴 것은 오래된 순으로 지급 완료·확정·정산 예정) · 감사 로그
  - 이미 채워진 날은 건드리지 않고 모자란 만큼만 더한다. API가 꺼져 있으면 구매·예약·사용은 건너뛴다.
- 시각을 되돌리는 SQL은 `"createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC')`처럼 비교해야 한다. DB 시간대가 한국(Asia/Seoul)이고 컬럼은 UTC 벽시계 값이라, Date를 그냥 넘기면 9시간 어긋나 한 건도 못 찾는다.

### 로컬 개발 화면 (에이젠테이션용)

에이젠테이션(화면을 클릭해 수정 메모를 남기는 도구)은 **이 PC에서 띄운 개발 화면에서만** 붙는다. 배포 주소에서는 안 붙는다.

```bash
cd apps/mobile && npx.cmd expo start --port 8081   # 유저 앱 → http://localhost:8081 (에이젠테이션 메모 서버는 localhost:4747)
```

- `apps/mobile/.env`의 `EXPO_PUBLIC_API_URL=/api`는 배포본용 상대 주소라 개발 서버에서는 HTML이 돌아와 목록이 `{}`로 캐시된다. 개발 화면은 `.env.development.local`(git에서 빠짐)에 `EXPO_PUBLIC_API_URL=http://localhost:4000`을 둔다.
- 브라우저 캐시에 `{}`가 박혀 `(drops ?? []).slice is not a function`이 나면 `localStorage`의 `hg_cache_drops:ko` 한 칸만 지운다.

## 빌드와 배포

```bash
# 앱
cd apps/mobile && MSYS_NO_PATHCONV=1 EXPO_PUBLIC_API_URL=/api npx expo export --platform web --clear
cp pages-worker.js dist/_worker.js
npx wrangler pages deploy dist --project-name jam --branch master --commit-dirty=true

# 관리자 / 점주 (project-name만 다름)
cd apps/admin && rm -rf .next out && MSYS_NO_PATHCONV=1 NEXT_PUBLIC_API_URL=/api npx next build
cp public/_worker.js out/_worker.js
npx wrangler pages deploy out --project-name holicgem-admin --branch master --commit-dirty=true
```

- `MSYS_NO_PATHCONV=1`을 빼면 Git Bash가 `/api`를 윈도우 경로로 바꿔버린다.
- expo export는 환경변수가 바뀌면 `--clear`가 필수다.
- 프런트 셋 다 `/api` 상대경로로 호출하고, 각 배포의 `_worker.js`가 터널로 프록시한다.
  터널 주소를 바꿀 때는 세 파일(`apps/mobile/pages-worker.js`,
  `apps/admin/public/_worker.js`, `apps/partner/public/_worker.js`)을 함께 고친다.

## 코드를 고칠 때

- 파일마다 줄바꿈이 CRLF와 LF로 섞여 있다. 줄 단위로 편집할 때 원본 줄바꿈을 보존한다.
- 화면에 보이는 변경은 배포 후 실제 화면으로 확인한다. 타입 검사만으로 끝내지 않는다.
- 더미 데이터는 사진까지 포함해 풍성하게 넣는다. 빈 화면을 보여주지 않는다.
