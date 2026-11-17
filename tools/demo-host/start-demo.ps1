# 홀릭잼 시연 서버 켜기 — 작업 스케줄러의 keeper.ps1이 부르고, '시연주소 확인해줘'를 받은 클로드도 이 PC의 터미널에서 부른다.
# DB(5433) → API(4000) → 터널 순서로 꺼져 있는 것만 켜고, 터널 주소가 바뀌었으면
# 앱·본사·점주 세 사이트의 연결 주소를 바꿔 다시 배포한다. 마지막에 시연 데이터 날짜를 맞춘다.
# 진행 기록: 이 파일이 있는 폴더(C:\Users\<나>\holicgem-demo-run)의 start-demo.log
$tools = $PSScriptRoot
$root = 'C:\projects\홀릭잼\holicgem'
$log = Join-Path $tools 'start-demo.log'
function Say($m) { Add-Content -Path $log -Value "$(Get-Date -Format 'MM-dd HH:mm:ss') $m" -Encoding UTF8 }
function Up($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
function Ok($url) { try { (Invoke-WebRequest -Uri "$url/home" -UseBasicParsing -TimeoutSec 15).StatusCode -eq 200 } catch { $false } }
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
# 이 스크립트가 띄운 터널만 다룬다. 다른 cloudflared(예: TRBOX 원격 서비스)는 건드리지 않는다.
function OurTunnel { Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine -match 'tunnel --url http://localhost:4000' } }

Set-Content -Path $log -Value "$(Get-Date -Format 'MM-dd HH:mm:ss') 시연 서버 켜기 시작" -Encoding UTF8

# 1) DB (처음 한 번은 바이너리를 복사하고 initdb 하느라 오래 걸린다)
if (-not (Up 5433)) {
  Spawn 'cmd.exe' "/c npm run dev:db > `"$tools\db.log`" 2>&1" "$root\packages\db"
  for ($i = 0; $i -lt 240 -and -not (Up 5433); $i++) { Start-Sleep -Seconds 1 }
}
Say ('DB ' + $(if (Up 5433) { '켜짐' } else { '켜지지 않음' }))

# 2) API
if (-not (Up 4000)) {
  Spawn 'cmd.exe' "/c npm run start:dev > `"$tools\api.log`" 2>&1" "$root\apps\api"
  for ($i = 0; $i -lt 120 -and -not (Ok 'http://localhost:4000'); $i++) { Start-Sleep -Seconds 1 }
}
Say ('API ' + $(if (Ok 'http://localhost:4000') { '켜짐' } else { '켜지지 않음' }))

# 3) 터널 — 살아 있으면 그대로, 아니면 새로 (주소가 바뀐다)
$url = Get-Content (Join-Path $tools 'tunnel-url.txt') -ErrorAction SilentlyContinue
if (-not ((OurTunnel) -and $url -and (Ok $url))) {
  OurTunnel | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Remove-Item (Join-Path $tools 'tunnel-demo.log') -ErrorAction SilentlyContinue
  Spawn (Join-Path $tools 'cloudflared.exe') "tunnel --url http://localhost:4000 --no-autoupdate --logfile `"$tools\tunnel-demo.log`"" $null
  $url = $null
  for ($i = 0; $i -lt 60 -and -not $url; $i++) {
    Start-Sleep -Seconds 1
    $m = Select-String -Path (Join-Path $tools 'tunnel-demo.log') -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value }
  }
  if ($url) { Set-Content -Path (Join-Path $tools 'tunnel-url.txt') -Value $url }
  for ($i = 0; $i -lt 30 -and $url -and -not (Ok $url); $i++) { Start-Sleep -Seconds 2 }
}
Say "터널 $url"
if (-not $url) { Say '터널 주소를 받지 못해 멈춥니다'; exit 1 }

# 4) 앱·본사·점주 웹이 이 터널을 보게 — 배포된 주소와 다를 때만 다시 배포 (배포가 안 되면 다음에 다시 시도)
$line = "const API = '$url';"
$sites = @(
  @{ src = "$root\apps\mobile\pages-worker.js"; dir = "$root\apps\mobile"; folder = 'dist'; project = 'jam' },
  @{ src = "$root\apps\admin\public\_worker.js"; dir = "$root\apps\admin"; folder = 'out'; project = 'holicgem-admin' },
  @{ src = "$root\apps\partner\public\_worker.js"; dir = "$root\apps\partner"; folder = 'out'; project = 'holicgem-partner' }
)
foreach ($s in $sites) {
  $text = [IO.File]::ReadAllText($s.src)
  $new = [regex]::Replace($text, "const API = 'https://[a-z0-9-]+\.trycloudflare\.com';", $line)
  if ($new -ne $text) { [IO.File]::WriteAllText($s.src, $new) }
  $out = Join-Path $s.dir "$($s.folder)\_worker.js"
  $same = (Test-Path $out) -and ([IO.File]::ReadAllText($out).Contains($line))
  if ($same) { Say "$($s.project) 그대로"; continue }
  Copy-Item $s.src $out -Force
  Push-Location $s.dir
  $r = cmd /c "npx wrangler pages deploy $($s.folder) --project-name $($s.project) --branch master --commit-dirty=true 2>&1"
  Pop-Location
  Say "$($s.project) 배포 — $(($r | Select-Object -Last 1))"
  if (-not ($r -match 'Deployment complete')) { Remove-Item $out -ErrorAction SilentlyContinue }
}

# 5) 시연 데이터 날짜 맞추기 (12/31까지 · 지난달 1일부터 오늘까지 — packages/db/scripts/demo-live.ts)
Push-Location "$root\packages\db"
$null = cmd /c "npm run demo:refresh 2>&1"
$code = $LASTEXITCODE
Pop-Location
Say "시연 데이터 맞춤 (종료 코드 $code)"
Say '끝 — https://jam-5dw.pages.dev · https://holicgem-admin.pages.dev · https://holicgem-partner.pages.dev'
