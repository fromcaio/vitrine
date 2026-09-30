# Renderiza os diagramas PlantUML de doc/diagrams/src para doc/tex/figuras/diagramas (PNG).
# Uso:  $env:PLANTUML_JAR = "C:\caminho\plantuml.jar"; .\doc\diagrams\render.ps1 [nome ...]
# Sem argumentos, renderiza todos os *.puml. O DBML (er-vitrine.dbml) é renderizado à
# parte, em dbdiagram.io (ver doc/diagrams/README.md).
param([string[]]$Nomes)

$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $dir "src"
$out = Join-Path (Resolve-Path (Join-Path $dir "..\tex")) "figuras\diagramas"
$jar = $env:PLANTUML_JAR

if (-not $jar -or -not (Test-Path $jar)) {
    Write-Error "Defina `$env:PLANTUML_JAR com o caminho do plantuml.jar (https://plantuml.com/download)."
}
if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    Write-Error "Java não encontrado no PATH."
}

New-Item -ItemType Directory -Force $out | Out-Null

if ($Nomes -and $Nomes.Count -gt 0) {
    $arquivos = $Nomes | ForEach-Object { Join-Path $src (($_ -replace '\.puml$', '') + ".puml") }
} else {
    $arquivos = Get-ChildItem $src -Filter *.puml | ForEach-Object { $_.FullName }
}

& java -jar $jar -charset UTF-8 -tpng -Sdpi=200 -o $out @arquivos
Write-Host "PNGs gravados em: $out"
