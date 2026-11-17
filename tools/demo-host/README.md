# 시연 서버 (이 PC에서 돌린다)

홀릭잼 시연 사이트 세 곳(유저 앱·본사·점주)이 보여 주는 데이터는 **이 PC에서 도는 DB·API**에서 옵니다.
인터넷 주소는 cloudflared 터널을 거쳐 이 PC의 `localhost:4000`(API)로 들어옵니다.
그래서 PC나 서버가 꺼지면 사이트는 열려도 화면이 빕니다.

## 어떻게 켜져 있나

| 파일 | 하는 일 |
|---|---|
| `install.ps1` | 처음 한 번(또는 스크립트를 고친 뒤) 돌린다. `C:\Users\<나>\holicgem-demo-run`에 스크립트를 복사하고 작업 스케줄러에 등록한다 |
| `keeper.ps1` | 작업 스케줄러가 창 없이 돌린다. 90초마다 DB·API·터널·사이트를 보고 꺼진 것만 다시 켠다. 3시간마다 `demo:refresh`. 2027-01-01에 스스로 지운다 |
| `start-demo.ps1` | 꺼진 것만 켜고, 터널 주소가 바뀌면 세 사이트에 새 주소를 다시 배포한다 |
| `stop-demo.ps1` | 지킴이와 DB·API·터널을 끈다(`-Uninstall`을 주면 작업 스케줄러 등록까지 지운다) |

기록은 `C:\Users\<나>\holicgem-demo-run`의 `keeper.log`, `start-demo.log`, `db.log`, `api.log`.

## 끄고 싶을 때

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:Users<나>holicgem-demo-runstop-demo.ps1 -Uninstall
```

(서버만 잠깐 끄려면 `-Uninstall` 없이. 이 경우 다음에 로그인하면 다시 켜진다.)

## 알아 둘 것

- **클로드의 Bash·PowerShell 도구는 보호된 임시 공간에서 돈다.** 거기서 켠 서버는 작업이 끝나면 같이 꺼지고, `%LOCALAPPDATA%`에 만든 파일은 이 PC에 남지 않는다. 서버는 반드시 이 PC의 터미널 패널(`run_in_terminal`)이나 작업 스케줄러로 켠다.
- DB 파일은 `%LOCALAPPDATA%\holicgem-pgdata`(이 PC)에 있다. 백업·되돌리기: `cd packages/db && npm run demo:backup -- <폴더>` / `npm run demo:restore -- <폴더>`.
- **창이 뜨지 않는다**: 지킴이는 `conhost --headless`로, DB·API·터널은 CREATE_NO_WINDOW로 띄운다. 윈도우 터미널이 기본 터미널이면 `Start-Process -WindowStyle Hidden`만으로는 검은 창이 뜬다.
- 다른 cloudflared(예: `TrboxRemote` 서비스)는 건드리지 않는다. `start-demo.ps1`은 `tunnel --url http://localhost:4000`으로 띄운 것만 다룬다.
