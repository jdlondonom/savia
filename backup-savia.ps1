$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  throw 'Detén Savia con Ctrl+C antes de crear el respaldo para evitar una copia inconsistente.'
}

$statePath = Join-Path $PSScriptRoot '.wrangler'
$secretsPath = Join-Path $PSScriptRoot '.dev.vars'
if (-not (Test-Path -LiteralPath $statePath)) {
  throw 'Aún no existe información local para respaldar. Inicia Savia al menos una vez.'
}
if (-not (Test-Path -LiteralPath $secretsPath)) {
  throw 'No se encontró .dev.vars. Sin SAVIA_MASTER_KEY no se podrán recuperar las credenciales cifradas.'
}

$backupRoot = Join-Path $PSScriptRoot 'backups'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $backupRoot "Savia-$timestamp"
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -LiteralPath $statePath -Destination (Join-Path $target '.wrangler') -Recurse
Copy-Item -LiteralPath $secretsPath -Destination (Join-Path $target '.dev.vars')

$manifest = @"
Respaldo local de Savia
Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')
Contenido: base D1, objetos R2 y secretos necesarios para descifrar proveedores.
Restauración: con Savia detenida, devuelve .wrangler y .dev.vars a la raíz del proyecto.
"@
[System.IO.File]::WriteAllText((Join-Path $target 'LEEME.txt'), $manifest, [System.Text.UTF8Encoding]::new($false))

Write-Host ''
Write-Host "Respaldo creado en: $target"
Write-Host 'Guarda esta carpeta en una unidad cifrada y separada del PC.'
