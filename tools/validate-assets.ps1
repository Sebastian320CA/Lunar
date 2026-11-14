$manifestPath = "public\assets\manifest.json"
if (-not (Test-Path $manifestPath)) { Write-Host "No existe $manifestPath"; exit 1 }
$m = Get-Content $manifestPath -Raw | ConvertFrom-Json
$script:problemas = 0

function Check($items, $tipo) {
  foreach ($i in $items) {
    $full = Join-Path "public\assets" ($i.path -replace '/', '\')
    if (-not (Test-Path $full)) {
      Write-Host "FALTA  [$tipo] $($i.id) -> $full"; $script:problemas++
    } else {
      $mb = [math]::Round((Get-Item $full).Length / 1MB, 2)
      $aviso = ""
      if ($tipo -eq "modelo" -and $mb -gt 15) { $aviso = "  (PESADO, optimizar)" }
      if (-not $i.credit) { $aviso += "  (sin credito)" }
      Write-Host "OK     [$tipo] $($i.id) $mb MB$aviso"
    }
  }
}
Check $m.models "modelo"
Check $m.textures "textura"

$glbs = Get-ChildItem "public\assets\models" -Filter *.glb -ErrorAction SilentlyContinue
foreach ($g in $glbs) {
  $rel = "public\assets\models\" + $g.Name
  $enManifest = $m.models | Where-Object { (("public\assets\" + $_.path) -replace '/', '\') -eq $rel }
  if (-not $enManifest) { Write-Host "SIN MANIFEST  $($g.Name) esta en la carpeta pero no en manifest.json" }
}
Write-Host "Problemas: $script:problemas"