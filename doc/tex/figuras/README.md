# `doc/tex/figuras/` — imagens da documentação

Cada figura do LaTeX aponta para um arquivo **com nome previsível**:

```
figuras/<tipo>/<arquivo>.png      (também: .pdf, .jpg, .jpeg)
```

| Pasta | Conteúdo | Quem coloca | Como |
|---|---|---|---|
| `telas/` | Capturas de tela do sistema | Agente **UI** (e quem alterou a interface) | Captura manual ou automatizada; ver padrões abaixo |
| `diagramas/` | Diagramas renderizados | **Arquiteto** | `doc/diagrams/render.sh`/`render.ps1` e dbdiagram.io |
| `testes/` | Evidências de teste (Lighthouse, terminal, acessibilidade) | Agente dono do teste | Captura da evidência |
| `ic/` | Figuras do relatório de IC (protótipos e diagramas originais) | — (já incluídas) | Não alterar |
| `outros/` | Demais imagens | Arquiteto | — |

**O nome do arquivo é o contrato.** Os nomes esperados estão no PDF (caixas **FIGURA
PENDENTE**) e no Apêndice G (*Mapa de pendências*). Para listá-los no terminal:
`cd doc/tex && make pendentes` (ou `make pendentes AGENTE=UI`).

## Padrões

- Formato PNG (vetorial em PDF é aceito para diagramas).
- Telas: janela com 1280 px de largura ou mais; tema claro; dados de demonstração
  realistas; nada de e-mails, senhas, tokens ou dados pessoais reais.
- Nomes em minúsculas, hífens, sem acentos, espaços ou `_`.
- Commite a imagem na **sua branch de feature** (um arquivo novo por figura, sem conflitos).
  Não edite os `.tex`: a imagem aparece sozinha na próxima compilação.
