$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$toolsDir = Join-Path $projectDir "tools"
$cloudflared = Join-Path $toolsDir "cloudflared.exe"
$appLog = Join-Path $projectDir "server.log"
$appErr = Join-Path $projectDir "server.err.log"

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
  exit 1
}

if (-not (Test-Path -LiteralPath $cloudflared)) {
  New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
  Write-Host "Telechargement de cloudflared portable..." -ForegroundColor Cyan
  Invoke-WebRequest `
    -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
    -OutFile $cloudflared
}

Set-Location $projectDir

$appReady = $false
try {
  $response = Invoke-WebRequest -UseBasicParsing "http://localhost:3000/api/health" -TimeoutSec 2
  $appReady = $response.StatusCode -eq 200
} catch {
  $appReady = $false
}

if (-not $appReady) {
  Write-Host "Demarrage de l'application locale..." -ForegroundColor Cyan
  Start-Process `
    -FilePath $nodeExe `
    -ArgumentList "`"$projectDir\server.js`"" `
    -WorkingDirectory $projectDir `
    -RedirectStandardOutput $appLog `
    -RedirectStandardError $appErr `
    -WindowStyle Hidden

  Start-Sleep -Seconds 3
}

Write-Host ""
Write-Host "Application locale: http://localhost:3000" -ForegroundColor Green
Write-Host "Creation du lien public Cloudflare..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Quand tu vois une URL en https://....trycloudflare.com, ouvre-la sur ton telephone ou envoie-la au jury." -ForegroundColor Yellow
Write-Host "Garde cette fenetre ouverte pendant toute la demo. Ctrl+C pour arreter le lien public." -ForegroundColor Yellow
Write-Host ""

& $cloudflared tunnel --url "http://localhost:3000"
