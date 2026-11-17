# 시연 서버를 이 PC에 설치한다 (처음 한 번, 또는 스크립트를 고친 뒤 다시) — 사용자 허락(2026-11-17)을 받고 클로드가 터미널에서 돌린다.
#   powershell -NoProfile -ExecutionPolicy Bypass -File <이 파일> [-RestoreFrom <백업폴더>] [-Cloudflared <cloudflared.exe 경로>]
# 하는 일
#   1) C:\Users\<나>\holicgem-demo-run 에 start-demo.ps1 · keeper.ps1 (· cloudflared.exe)를 복사
#   2) -RestoreFrom을 주면: DB를 켜고 표를 만든 뒤(prisma db push) 백업 JSON(demo:backup으로 받은 폴더)으로 채움
#   3) 작업 스케줄러에 HolicGem-Demo-Keeper를 등록하고 바로 시작 (이 PC에 로그인하면 자동 시작, 2027-01-01에 스스로 삭제)
param([string]$RestoreFrom = '', [string]$Cloudflared = '')
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$run = Join-Path $env:USERPROFILE 'holicgem-demo-run'
$root = 'C:\projects\홀릭잼\holicgem'
New-Item -ItemType Directory -Force -Path $run | Out-Null
$log = Join-Path $run 'install.log'
function Say($m) { $line = "$(Get-Date -Format 'MM-dd HH:mm:ss') $m"; Add-Content -Path $log -Value $line -Encoding UTF8; Write-Output $line }
function Up($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
# 창 없이 띄운다 (윈도우 터미널이 기본 터미널이어도 검은 창이 뜨지 않게 CREATE_NO_WINDOW로)
function Spawn($file, $argLine, $workDir) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $file
  $psi.Arguments = $argLine
  if ($workDir) { $psi.WorkingDirectory = $workDir }
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  [void][System.Diagnostics.Process]::Start($psi)
}

Copy-Item (Join-Path $here 'start-demo.ps1') $run -Force
Copy-Item (Join-Path $here 'keeper.ps1') $run -Force
Copy-Item (Join-Path $here 'stop-demo.ps1') $run -Force
if ($Cloudflared -and (Test-Path $Cloudflared)) { Copy-Item $Cloudflared (Join-Path $run 'cloudflared.exe') -Force }
if (-not (Test-Path (Join-Path $run 'cloudflared.exe'))) { throw "cloudflared.exe가 없습니다. -Cloudflared <경로>로 알려 주세요." }
Say "파일 복사 끝 -> $run"

if ($RestoreFrom) {
  if (-not (Up 5433)) {
    Spawn 'cmd.exe' "/c npm run dev:db > `"$run\db.log`" 2>&1" "$root\packages\db"
    for ($i = 0; $i -lt 240 -and -not (Up 5433); $i++) { Start-Sleep -Seconds 1 }
  }
  if (-not (Up 5433)) { throw 'DB가 켜지지 않았습니다 (holicgem-demo-run\db.log를 보세요)' }
  Say 'DB 켜짐 — 표를 만듭니다'
  Push-Location "$root\packages\db"
  cmd /c 'npx prisma db push --skip-generate 2>&1' | Out-File (Join-Path $run 'db-push.log') -Encoding UTF8
  Say "prisma db push 종료 코드 $LASTEXITCODE"
  cmd /c "npx tsx scripts/db-json.ts restore `"$RestoreFrom`" 2>&1" | Out-File (Join-Path $run 'db-restore.log') -Encoding UTF8
  $restoreCode = $LASTEXITCODE
  Pop-Location
  Say "백업으로 채우기 종료 코드 $restoreCode"
  if ($restoreCode -ne 0) { throw '백업으로 채우기에 실패했습니다 (holicgem-demo-run\db-restore.log를 보세요)' }
}

$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$name = 'HolicGem-Demo-Keeper'
# conhost --headless: 창(윈도우 터미널 포함) 없이 돈다
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument ('--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $run 'keeper.ps1') + '"')
$trigLogon = New-ScheduledTaskTrigger -AtLogOn -User $me
$trigRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 50)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -Hidden
$principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited
$desc = '홀릭잼 시연 서버(DB·API·터널)를 켜 두고 3시간마다 더미 데이터를 지금 날짜에 맞춘다. 2027-01-01에 스스로 지워진다. 끄기: Unregister-ScheduledTask -TaskName HolicGem-Demo-Keeper -Confirm:$false'
Register-ScheduledTask -TaskName $name -Action $action -Trigger @($trigLogon, $trigRepeat) -Settings $settings -Principal $principal -Description $desc -Force | Out-Null
Start-ScheduledTask -TaskName $name
Say "작업 스케줄러에 등록하고 시작했습니다 ($name) — 기록: $run\keeper.log · $run\start-demo.log"
