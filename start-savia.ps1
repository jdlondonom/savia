$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
$bundledPnpm = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'

if (Test-Path -LiteralPath $bundledNode) {
  $env:Path = "$bundledNode;$env:Path"
}

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if ($pnpm) {
  $pnpmCommand = $pnpm.Source
} elseif (Test-Path -LiteralPath $bundledPnpm) {
  $pnpmCommand = $bundledPnpm
} else {
  throw 'No se encontró pnpm. Instala Node.js 22 y pnpm, o abre este proyecto desde Codex.'
}

$devVarsPath = Join-Path $PSScriptRoot '.dev.vars'
if (-not (Test-Path -LiteralPath $devVarsPath)) {
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $authBytes = New-Object byte[] 48
    $masterBytes = New-Object byte[] 32
    $random.GetBytes($authBytes)
    $random.GetBytes($masterBytes)
    $authSecret = [Convert]::ToBase64String($authBytes)
    $masterKey = [Convert]::ToBase64String($masterBytes)
  } finally {
    $random.Dispose()
  }

  $devVars = @"
APP_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=$authSecret
SAVIA_MASTER_KEY=$masterKey
SAVIA_ENVIRONMENT=local
SAVIA_REQUIRE_DEDICATED_TENANT_DATA=false
SAVIA_ALLOW_RUNTIME_MIGRATIONS=true

LOCAL_AI_BASE_URL=
LOCAL_AI_MODEL=
LOCAL_AI_API_KEY=

TURNSTILE_SECRET_KEY=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
"@
  [System.IO.File]::WriteAllText($devVarsPath, $devVars, [System.Text.UTF8Encoding]::new($false))
  Write-Host 'Se creó la configuración segura local (.dev.vars).'
}

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
  Write-Host 'Preparando Savia por primera vez...'
  & $pnpmCommand install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$vinextCommand = Join-Path $PSScriptRoot 'node_modules\.bin\vinext.cmd'
if (-not (Test-Path -LiteralPath $vinextCommand)) {
  throw 'La instalación está incompleta. Ejecuta pnpm install y vuelve a intentarlo.'
}

Write-Host ''
Write-Host 'Savia estará disponible en http://localhost:3000'
Write-Host 'En el primer inicio abre http://localhost:3000/setup'
Write-Host 'Mantén esta ventana abierta. Presiona Ctrl+C para detenerla.'
Write-Host ''
& $vinextCommand dev
exit $LASTEXITCODE
