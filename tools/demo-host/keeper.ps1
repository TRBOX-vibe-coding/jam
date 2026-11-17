# 홀릭잼 시연 서버 지킴이 — 윈도우 작업 스케줄러('HolicGem-Demo-Keeper')가 창 없이 돌린다.
# 90초마다 DB·API·터널·세 사이트 연결을 보고, 꺼진 게 있으면 start-demo.ps1로 다시 켠다
# (터널 주소가 바뀌면 앱·본사·점주 세 사이트에 새 주소를 다시 배포한다).
# 3시간마다 demo:refresh로 DROP·오늘 판매/사용·예약을 지금 날짜에 맞춘다.
# 2027년 1월 1일이 되면 스스로 작업을 지우고 끝난다.
# 끄기: Unregister-ScheduledTask -TaskName HolicGem-Demo-Keeper -Confirm:$false  (그 뒤 keeper.ps1을 돌리는 PowerShell 프로세스 종료)
# 기록: 이 파일이 있는 폴더(C:\Users\<나>\holicgem-demo-run)의 keeper.log
$tools = $PSScriptRoot
$root = 'C:\projects\홀릭잼\holicgem'
$log = Join-Path $tools 'keeper.log'
$taskName = 'HolicGem-Demo-Keeper'
$until = [datetime]'2027-01-01'
function Say($m) { Add-Content -Path $log -Value "$(Get-Date -Format 'MM-dd HH:mm:ss') $m" -Encoding UTF8 }
function Up($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
function Ok($url) { try { (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15).StatusCode -eq 200 } catch { $false } }

# 한 번에 하나만 돈다
try { $mutex = New-Object System.Threading.Mutex($false, 'Global\HolicGemDemoKeeper') } catch { $mutex = New-Object System.Threading.Mutex($false, 'Local\HolicGemDemoKeeper') }
if (-not $mutex.WaitOne(0)) { exit }

if ((Get-Date) -ge $until) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue; exit }
Say "시작 (PID $PID)"

$lastFix = [datetime]::MinValue
$lastRefresh = [datetime]::MinValue
while ((Get-Date) -lt $until) {
  try {
    $url = Get-Content (Join-Path $tools 'tunnel-url.txt') -ErrorAction SilentlyContinue
    $db = Up 5433
    $api = Ok 'http://localhost:4000/home'
    $tun = [bool]$url -and (Ok "$url/home")
    $site = Ok 'https://jam-5dw.pages.dev/api/home'
    if (-not ($db -and $api -and $tun -and $site)) {
      # 같은 고장으로 너무 자주 다시 켜지 않게 8분은 쉰다
      if (((Get-Date) - $lastFix).TotalMinutes -ge 8) {
        Say "점검 실패(DB $db · API $api · 터널 $tun · 사이트 $site) → 다시 켭니다"
        $lastFix = Get-Date
        & (Join-Path $tools 'start-demo.ps1')   # 끝에서 demo:refresh까지 한다
        $lastRefresh = Get-Date
        Say '다시 켜기 끝'
      }
    } elseif (((Get-Date) - $lastRefresh).TotalHours -ge 3) {
      Push-Location "$root\packages\db"
      $null = cmd /c 'npm run demo:refresh 2>&1'
      $code = $LASTEXITCODE
      Pop-Location
      $lastRefresh = Get-Date
      Say "데이터 맞춤 (종료 코드 $code)"
    }
  } catch { Say "오류: $($_.Exception.Message)" }
  Start-Sleep -Seconds 90
}
Say '끝 — 2026년 12월 31일이 지나 스스로 지웁니다'
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
