param(
  [string]$Catalog = "cloudflare\tenants.production.json"
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$catalogPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $Catalog))
if (-not $catalogPath.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'El catálogo debe estar dentro del proyecto.'
}
if (-not (Test-Path -LiteralPath $catalogPath)) { throw "No existe el catálogo $catalogPath." }
if (-not $env:CLOUDFLARE_API_TOKEN) { throw 'Configura CLOUDFLARE_API_TOKEN con permisos mínimos de D1 y R2.' }

$configuration = Get-Content -LiteralPath $catalogPath -Raw | ConvertFrom-Json
$workRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'work\cloudflare-backups'))
$expectedWorkRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'work'))
if (-not $workRoot.StartsWith($expectedWorkRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'La ruta temporal de respaldo salió del directorio work.'
}
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $workRoot $timestamp
New-Item -ItemType Directory -Path $target -Force | Out-Null

$databases = @(@{ slug = 'control'; name = $configuration.controlDatabaseName })
foreach ($tenant in $configuration.tenants) {
  $databases += @{ slug = $tenant.slug; name = $tenant.databaseName }
}

foreach ($database in $databases) {
  $output = Join-Path $target "$($database.slug).sql"
  & pnpm exec wrangler d1 export $database.name --remote --output $output
  if ($LASTEXITCODE -ne 0) { throw "Falló la exportación de $($database.name)." }
  $objectKey = "$timestamp/d1/$($database.slug).sql"
  & pnpm exec wrangler r2 object put "$($configuration.backupBucketName)/$objectKey" --file $output --remote
  if ($LASTEXITCODE -ne 0) { throw "Falló la carga del respaldo $objectKey." }
}

$manifestPath = Join-Path $target 'manifest.json'
$manifest = @{
  createdAt = (Get-Date).ToUniversalTime().ToString('o')
  databases = $databases
  note = 'Exportación D1. Los buckets R2 de tenant requieren sincronización S3 separada y versionada.'
} | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($manifestPath, $manifest, [System.Text.UTF8Encoding]::new($false))
& pnpm exec wrangler r2 object put "$($configuration.backupBucketName)/$timestamp/manifest.json" --file $manifestPath --remote
if ($LASTEXITCODE -ne 0) { throw 'Falló la carga del manifiesto.' }

Write-Host "Respaldo remoto D1 completado: $timestamp"
Write-Host "Archivos temporales: $target"
