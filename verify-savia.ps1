$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$bundledNodeDirectory = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
$bundledNode = Join-Path $bundledNodeDirectory 'node.exe'
if (Test-Path -LiteralPath $bundledNodeDirectory) {
  $env:Path = "$bundledNodeDirectory;$env:Path"
}
$node = Get-Command node -ErrorAction SilentlyContinue
$nodeCommand = if ($node) { $node.Source } elseif (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { $null }
if (-not $nodeCommand) { throw 'No se encontró Node.js 22 o superior.' }

$tools = @{
  TypeScript = Join-Path $PSScriptRoot 'node_modules\.bin\tsc.cmd'
  ESLint = Join-Path $PSScriptRoot 'node_modules\.bin\eslint.cmd'
  Vinext = Join-Path $PSScriptRoot 'node_modules\.bin\vinext.cmd'
}
foreach ($tool in $tools.GetEnumerator()) {
  if (-not (Test-Path -LiteralPath $tool.Value)) { throw "Falta $($tool.Key). Ejecuta pnpm install." }
}

Write-Host '1/5 Verificando tipos...'
& $tools.TypeScript --noEmit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '2/5 Revisando calidad...'
& $tools.ESLint . --ignore-pattern dist --ignore-pattern .next --ignore-pattern .vinext --ignore-pattern .wrangler
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '3/5 Ejecutando pruebas unitarias y de arquitectura...'
& $nodeCommand --experimental-strip-types --test --test-isolation=none tests\scheduling.test.mjs tests\architecture.test.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '4/5 Probando salud y controles de acceso...'
& $nodeCommand tests\smoke.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '5/5 Compilando...'
& $tools.Vinext build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Savia superó todas las verificaciones.'
