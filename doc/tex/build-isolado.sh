#!/usr/bin/env bash
# build-isolado.sh -- compila a documentação numa CÓPIA temporária da árvore.
#
# Por quê: editores com auto-build ao salvar (por exemplo, VS Code + LaTeX Workshop) iniciam
# um `latexmk` em doc/tex a cada arquivo gravado. Duas compilações simultâneas na mesma
# pasta corrompem os .aux e produzem erros fantasma, como
#   "File ended while scanning use of \BKM@entry"  ou  "Undefined control sequence \@inp".
# O TeX também dá preferência aos arquivos do diretório atual sobre -outdir, então mudar
# o diretório de saída NÃO resolve. Compilar numa cópia resolve.
#
# Uso (a partir de qualquer pasta):
#   bash doc/tex/build-isolado.sh            # compila e mostra o caminho do PDF
#   bash doc/tex/build-isolado.sh --copiar   # idem e copia main.pdf para doc/tex/
#   bash doc/tex/build-isolado.sh --limpar   # apaga a cópia temporária antes de compilar
#   bash doc/tex/build-isolado.sh --final    # compila em modo FINAL (figura ausente = erro)
set -u

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"      # .../doc/tex
RAIZ="$(cd "$AQUI/../.." && pwd)"                        # raiz do repositório
TMP_BASE="${TMPDIR:-/tmp}/vitrine-doc-build"
DEST="$TMP_BASE/repo"

COPIAR=0; FINAL=0
for arg in "$@"; do
  case "$arg" in
    --copiar) COPIAR=1 ;;
    --final)  FINAL=1 ;;
    --limpar) rm -rf "$TMP_BASE" ;;
    *) echo "Opção desconhecida: $arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$DEST/doc/tex" "$DEST/doc/diagrams" "$DEST/prisma"

# Fontes LaTeX (sem artefatos de build) e arquivos que o LaTeX lê do restante do repositório
cp -u "$AQUI"/*.tex "$AQUI"/*.sty "$AQUI"/*.bib "$DEST/doc/tex/"
for d in capitulos apendices figuras; do
  mkdir -p "$DEST/doc/tex/$d"
  # Não copia artefatos de build (.aux etc.): o auto-build do editor os grava nestas pastas e,
  # se estiverem corrompidos, sobrescreveriam os da cópia e derrubariam a próxima compilação
  # ("Extra }, or forgotten \endgroup" ao ler capitulos/*.aux).
  (cd "$AQUI/$d" && find . -type f ! -name '*.aux' ! -name '*.log' ! -name '*.toc' -print0 \
    | xargs -0 -r cp -u --parents -t "$DEST/doc/tex/$d/")
done
cp -ru "$RAIZ/doc/diagrams/src" "$DEST/doc/diagrams/" 2>/dev/null
[ -f "$RAIZ/prisma/schema.prisma" ] && cp -u "$RAIZ/prisma/schema.prisma" "$DEST/prisma/"
[ -f "$RAIZ/prisma.config.ts" ] && cp -u "$RAIZ/prisma.config.ts" "$DEST/"
# \vitrinecodigo lê trechos de src/ e .env.example: sincroniza o que existir
[ -d "$RAIZ/src" ] && { mkdir -p "$DEST/src"; cp -ru "$RAIZ/src/." "$DEST/src/"; }
[ -f "$RAIZ/.env.example" ] && cp -u "$RAIZ/.env.example" "$DEST/"

cd "$DEST/doc/tex" || exit 1
rm -f vitrine-final.flag
[ "$FINAL" = "1" ] && touch vitrine-final.flag      # ativa o modo final (ver vitrine.sty)
latexmk -pdf -interaction=nonstopmode -halt-on-error main.tex > "$TMP_BASE/latexmk.log" 2>&1
COD=$?
rm -f vitrine-final.flag

echo "latexmk saiu com código $COD  (log: $TMP_BASE/latexmk.log)"
grep -m5 "^!" "$TMP_BASE/latexmk.log"
if [ -f main.pdf ]; then
  pdfinfo main.pdf 2>/dev/null | grep Pages
  echo "PDF: $DEST/doc/tex/main.pdf"
  [ "$COPIAR" = "1" ] && [ "$COD" = "0" ] && cp main.pdf "$AQUI/main.pdf" && echo "Copiado para $AQUI/main.pdf"
fi
exit $COD
