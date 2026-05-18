$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeCandidates = @(
  "$env:LOCALAPPDATA\OpenAI\Codex\bin\node.exe",
  "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe",
  "node"
)

$nodeExe = $null
foreach ($candidate in $nodeCandidates) {
  if ($candidate -eq "node") {
    $command = Get-Command node -ErrorAction SilentlyContinue
    if ($command) {
      $nodeExe = $command.Source
      break
    }
  } elseif (Test-Path -LiteralPath $candidate) {
    $nodeExe = $candidate
    break
  }
}

if (-not $nodeExe) {
  Write-Host "Node.js est introuvable." -ForegroundColor Red
  Write-Host "Installe Node.js LTS depuis https://nodejs.org puis relance ce script."
  exit 1
}

Set-Location $projectDir
Write-Host "Demarrage de Smart Home DHT22..." -ForegroundColor Cyan
Write-Host "URL: http://localhost:3000" -ForegroundColor Green

$lanIps = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "169.254.*" -and
    $_.InterfaceAlias -notlike "*VMware*" -and
    $_.InterfaceAlias -notlike "*Virtual*"
  } |
  Select-Object -ExpandProperty IPAddress -Unique

foreach ($ip in $lanIps) {
  Write-Host "URL telephone/PC meme Wi-Fi: http://$ip`:3000" -ForegroundColor Green
}

Write-Host ""
Write-Host "Pendant la demo: lance Wokwi, puis ouvre l'URL LAN sur le telephone." -ForegroundColor Yellow
Write-Host "Si Windows Firewall demande une autorisation, clique Autoriser." -ForegroundColor Yellow
& $nodeExe "$projectDir\server.js"
