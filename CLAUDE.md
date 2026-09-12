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
