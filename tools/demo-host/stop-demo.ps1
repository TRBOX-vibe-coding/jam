# 시연 서버 끄기 — 지킴이(keeper)를 멈추고 DB·API·터널을 끈다.
#   powershell -NoProfile -ExecutionPolicy Bypass -File stop-demo.ps1            # 서버만 끈다 (작업 스케줄러 등록은 그대로 → 로그인하면 다시 켜진다)
#   powershell -NoProfile -ExecutionPolicy Bypass -File stop-demo.ps1 -Uninstall  # 작업 스케줄러 등록까지 지운다 (완전히 끔)
# 다시 켜기: install.ps1 (등록까지) 또는 start-demo.ps1 (서버만)
param([switch]$Uninstall)
$name = 'HolicGem-Demo-Keeper'
$run = Join-Path $env:USERPROFILE 'holicgem-demo-run'
function Say($m) { Write-Output "$(Get-Date -Format 'HH:mm:ss') $m" }

Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($Uninstall) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue; Say '작업 스케줄러 등록을 지웠습니다' }

# 지킴이(keeper.ps1)부터 — 먼저 멈춰야 서버를 끄는 동안 다시 켜지 않는다
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match 'holicgem-demo-run.keeper\.ps1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Say '지킴이 멈춤'

# 터널 — 우리가 띄운 것(localhost:4000으로 가는 것)만. 다른 cloudflared(TRBOX 원격 서비스 등)는 건드리지 않는다
Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine -match 'tunnel --url http://localhost:4000' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Say '터널 끔'

# API — 실행기(cmd)와 그 아래 프로세스 전부
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -match 'holicgem-demo-run.api\.log' } | ForEach-Object { & taskkill /PID $_.ProcessId /T /F | Out-Null }
Say 'API 끔'

# DB — 깨끗하게 멈춘 뒤 실행기를 끝낸다
$pgctl = Join-Path $env:LOCALAPPDATA 'holicgem-pgbin\bin\pg_ctl.exe'
$data = Join-Path $env:LOCALAPPDATA 'holicgem-pgdata'
if ((Test-Path $pgctl) -and (Test-Path (Join-Path $data 'postmaster.pid'))) { & $pgctl stop -D $data -m fast 2>&1 | Out-Null }
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -match 'holicgem-demo-run.db\.log' } | ForEach-Object { & taskkill /PID $_.ProcessId /T /F | Out-Null }
Say 'DB 끔'
