%% ===================================================================================
%% Arquivo de Classe para TCC (undergrad_thesis.cls)
%% Versão: 2.2 (Corrigida)
%%
%% Uma classe de propósito geral para trabalhos de conclusão, baseada em abntex2.
%% Esta classe define o layout da capa e da folha de rosto.
%%
%% Este trabalho pode ser distribuído e/ou modificado sob as
%% condições da Licença Pública do Projeto LaTeX (LPPL), versão 1.3 ou posterior.
%% ===================================================================================

\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{undergrad_thesis}[2025/10/12 v2.2 Classe de TCC baseada em abntex2]

% --- Passa todas as opções (como 12pt, a4paper, etc.) para a classe base abntex2
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{abntex2}}
\ProcessOptions\relax
\LoadClass{abntex2}

%% ===================================================================================
%% LAYOUT DA CAPA (\imprimircapa)
%% Este comando gera a capa principal do documento.
%% ===================================================================================
\renewcommand{\imprimircapa}{%
  \begin{capa}
    \centering
    % --- Nome da Instituição ---
    % É definido por \instituicao em seu arquivo main.tex.
    % Use \par dentro de \instituicao para quebras de linha.
    {\ABNTEXchapterfont\Large\imprimirinstituicao}

    \vspace*{2cm}

    % --- Nome do Autor ---
    {\ABNTEXchapterfont\Large\imprimirautor}

    \vfill % Empurra o título para o centro vertical do espaço restante

    % --- Título do Trabalho ---
    {\ABNTEXchapterfont\bfseries\huge\imprimirtitulo}

    \vfill % Empurra o local/data para o final da página

    % --- Local e Data ---
    {\large\imprimirlocal}
    \par
    {\large\imprimirdata}

    \vspace*{1cm}
  \end{capa}
}
%% ===================================================================================
%% LAYOUT DA CAPA COM LOGO
%% ===================================================================================

% --- Comando para definir o caminho do arquivo do logo ---
\makeatletter
\newcommand{\logo}[1]{\gdef\@logo{#1}}
\newcommand{\imprimirlogo}{%
  \abntex@ifnotempty{\@logo}{%
    \begin{center}
      % Você pode ajustar o tamanho do logo aqui
      \includegraphics[height=3cm]{\@logo}
    \end{center}
  }%
}
\makeatother

% --- Layout da Capa com Logo ---
% Este comando gera a capa principal do documento com um logo no topo.
\newcommand{\imprimircapalogo}{%
  \begin{capa}
    \centering
    % --- Logo da Universidade ---
    % O logo é incluído aqui se definido pelo comando \logo{} no main.tex
    \imprimirlogo

    \vspace*{2cm}
    
    % --- Nome da Instituição ---
    {\ABNTEXchapterfont\Large\imprimirinstituicao}

    \vfill % Empurra o bloco autor/título para baixo

    % --- Nome do Autor ---
    {\ABNTEXchapterfont\Large\imprimirautor}

    \vspace{2cm}

    % --- Título do Trabalho ---
    {\ABNTEXchapterfont\bfseries\huge\imprimirtitulo}

    \vfill % Empurra o local/data para o final da página

    % --- Local e Data ---
    {\large\imprimirlocal}
    \par
    {\large\imprimirdata}

    \vspace*{1cm}
  \end{capa}
}

%% ===================================================================================
%% LAYOUT DA FOLHA DE ROSTO (\imprimirfolhaderosto)
%% A classe abntex2 chama \folhaderostocontent para construir a folha de rosto.
%% Nós redefinimos seu conteúdo aqui.
%% ===================================================================================
\makeatletter
\renewcommand{\folhaderostocontent}{%
  \begin{center}
    % --- Nome do Autor ---
    {\ABNTEXchapterfont\large\imprimirautor}

    \vspace*{2cm}

    % --- Título do Trabalho ---
    {\ABNTEXchapterfont\bfseries\Large\imprimirtitulo}
    
    \vspace*{\fill}

    % --- Preâmbulo (natureza do trabalho) ---
    % Este bloco só aparece se \preambulo for definido no main.tex.
    % É alinhado à direita no meio da página.
    \abntex@ifnotempty{\imprimirpreambulo}{%
      \hspace{.45\textwidth}%
      \begin{minipage}{.5\textwidth}
        \SingleSpacing % Padrão ABNT para esta seção
        \imprimirpreambulo
      \end{minipage}%
      \vspace*{\fill}
    }

    % --- Orientador e Coorientador ---
    {\large\imprimirorientadorRotulo~\imprimirorientador\par}
    % A linha do coorientador só aparece se \coorientador for definido no main.tex.
    \abntex@ifnotempty{\imprimircoorientador}{%
      \vspace{0.5cm} % Adiciona um pequeno espaço se houver coorientador
      {\large\imprimircoorientadorRotulo~\imprimircoorientador\par}%
    }

    \vspace*{\fill}

    % --- Local e Data ---
    {\large\imprimirlocal}
    \par
    {\large\imprimirdata}
    \vspace*{1cm}
  \end{center}
}
\makeatother

%% ===================================================================================
%% FIM DO ARQUIVO DE CLASSE
%% ===================================================================================