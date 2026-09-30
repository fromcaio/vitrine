# ============================================================================
# Makefile da documentacao LaTeX do Vitrine (doc/tex)
# Uso (dentro de doc/tex):   make help
# Requer: latexmk + MiKTeX/TeX Live com abntex2. NAO requer -shell-escape.
# Mensagens em ASCII de proposito (evita problemas de codificacao no shell do Windows).
# ============================================================================
TEX      = main.tex
LATEXMK  = latexmk -pdf -interaction=nonstopmode -halt-on-error
AGENTE  ?=

.PHONY: help pdf isolado watch final pendentes clean distclean

help:
	@echo "Alvos disponiveis:"
	@echo "  make pdf                  compila main.pdf (modo rascunho; varias passadas automaticas)"
	@echo "  make isolado              compila numa COPIA temporaria (evita colisao com auto-build do editor)"
	@echo "  make watch                recompila ao salvar arquivos (latexmk -pvc)"
	@echo "  make final                modo FINAL: figura/codigo ausente vira ERRO (portao de qualidade)"
	@echo "  make pendentes            lista figuras/codigos/pendencias da ultima compilacao"
	@echo "  make pendentes AGENTE=UI  idem, filtrando por agente (Core, Dados, UI, Arquiteto)"
	@echo "  make clean                remove auxiliares (mantem main.pdf)"
	@echo "  make distclean            remove auxiliares e main.pdf"

pdf:
	$(LATEXMK) $(TEX)

isolado:
	bash build-isolado.sh

watch:
	latexmk -pdf -pvc -interaction=nonstopmode $(TEX)

# O modo final e ativado pelo arquivo-sinalizador vitrine-final.flag (ver vitrine.sty),
# criado e removido aqui. O -gg limpa e recompila do zero (senao o latexmk acharia o PDF
# em dia e nao validaria nada).
final:
	@touch vitrine-final.flag
	@$(LATEXMK) -gg $(TEX); status=$$?; rm -f vitrine-final.flag; exit $$status

# Le as pendencias registradas nos .aux (tipo: F=figura C=codigo T=texto).
# A compilacao precisa ter sido feita ao menos uma vez (make pdf).
pendentes:
	@echo "Tipo  Agente      Item/Secao           Arquivo esperado ou pagina"
	@echo "----------------------------------------------------------------------"
	@grep -rh "vitrine@addpend" --include=*.aux . 2>/dev/null \
	  | sed -E 's/.*addpend\{([A-Z])\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}.*/\1     \2  \3  \4/' \
	  | { if [ -n "$(AGENTE)" ]; then grep -i -E "^[A-Z] +$(AGENTE) "; else cat; fi; } \
	  | sort -k2,2 -k1,1 || true
	@echo ""
	@echo "Avisos de texto no codigo-fonte (grep por agente):"
	@grep -rn --include=*.tex "vitrinependencia{$(AGENTE)" capitulos apendices pretextual_elements.tex 2>/dev/null \
	  | sed -E 's/\\vitrinependencia\{([^}]*)\}\{(.{0,110}).*/[\1] \2.../' || true

clean:
	-latexmk -c $(TEX)
	-find . -name "*.aux" -delete
	-rm -rf _minted-*

distclean: clean
	-latexmk -C $(TEX)
	-rm -f main.pdf
