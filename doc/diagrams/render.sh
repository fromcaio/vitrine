#!/usr/bin/env bash
# Renderiza os diagramas PlantUML de doc/diagrams/src para doc/tex/figuras/diagramas (PNG).
# Uso:  PLANTUML_JAR=/caminho/plantuml.jar doc/diagrams/render.sh [nome-sem-extensao ...]
# Sem argumentos, renderiza todos os *.puml. O DBML (er-vitrine.dbml) é renderizado à
# parte, em dbdiagram.io (ver doc/diagrams/README.md).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$DIR/src"
OUT="$(cd "$DIR/../tex" && pwd)/figuras/diagramas"
JAR="${PLANTUML_JAR:-}"

if [ -z "$JAR" ] || [ ! -f "$JAR" ]; then
  echo "Defina PLANTUML_JAR com o caminho do plantuml.jar (https://plantuml.com/download)." >&2
  exit 1
fi
command -v java >/dev/null 2>&1 || { echo "Java não encontrado no PATH." >&2; exit 1; }

mkdir -p "$OUT"

if [ "$#" -gt 0 ]; then
  FILES=()
  for n in "$@"; do FILES+=("$SRC/${n%.puml}.puml"); done
else
  FILES=("$SRC"/*.puml)
fi

java -jar "$JAR" -charset UTF-8 -tpng -Sdpi=200 -o "$OUT" "${FILES[@]}"
echo "PNGs gravados em: $OUT"
