// mutacoes-ui.mjs -- mutações do Arquiteto nos pontos NOVOS da UI do épico v1 (A-027, M-038): cookie de modo,
// marcador de sessão, AdminLink, botão de modo, popout do sino, herança da aparência e validações.
// Uso: node doc/revisao/mutacoes-ui.mjs <worktree-de-revisão> [--somente=U03,U10]
// Aplica UMA mutação por vez (troca exata de texto, que deve existir uma única vez), roda os testes da UI que
// cobrem o arquivo, restaura o original e imprime DETECTADA (algum teste falhou) ou ESCAPOU. `NÃO ACHOU` = o
// código mudou: atualize a lista. Só valores fictícios. Ao integrar mudanças da UI nesses arquivos, acrescente aqui.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const wt = process.argv[2];
if (!wt) {
  console.error("informe o worktree de revisão");
  process.exit(2);
}
const only = (process.argv.find((a) => a.startsWith("--somente=")) ?? "").slice(10).split(",").filter(Boolean);

const L = "src/components/layout/";
const A = "src/components/admin/";
const TESTES = [
  "tests/ui/color-mode.test.js", "tests/ui/admin-link.test.js", "tests/ui/admin-signout.test.js", "tests/ui/appearance-model.test.js",
  "tests/ui/appearance-a027.test.js", "tests/ui/appearance-form.test.js", "tests/ui/topbar.test.js", "tests/ui/notification-popout.test.js",
  "tests/ui/notification-bell.test.js", "tests/ui/login-form.test.js", "tests/ui/login-links.test.js", "tests/ui/space-layout.test.js",
  "tests/core/layouts.test.js",
];

/** [id, arquivo, de, para, o que protege] */
const MUTANTES = [
  ["U01", L + "color-mode-script.js", 'return stored === "dark";', 'return stored !== "light";', "valor lixo ou antigo `auto` não liga o escuro"],
  ["U02", L + "color-mode-script.js", 'if (m && m[1] === "dark") document', "if (m) document", "o script só liga o escuro com o valor exato `dark`"],
  ["U03", L + "color-mode-script.js", "Path=/; Max-Age=${COLOR_MODE_MAX_AGE}; SameSite=Lax", "Path=/; SameSite=Lax", "cookie de modo dura um ano"],
  ["U04", L + "color-mode-script.js", "Max-Age=${COLOR_MODE_MAX_AGE}; SameSite=Lax${secure", "Max-Age=${COLOR_MODE_MAX_AGE}; SameSite=None${secure", "SameSite=Lax"],
  ["U05", L + "color-mode-script.js", '${secure ? "; Secure" : ""}`;\n}\n\n/**\n * Script do', '`;\n}\n\n/**\n * Script do', "Secure sob HTTPS"],
  ["U06", L + "color-mode-script.js", 'COLOR_MODE_COOKIE = "vitrine-modo"', 'COLOR_MODE_COOKIE = "vitrine:modo"', "nome do cookie"],
  ["U07", L + "session-marker.js", "`${SESSION_MARKER_COOKIE}=1; Path=/; SameSite=Lax${secure", "`${SESSION_MARKER_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax${secure", "o marcador é de sessão do navegador (sem Max-Age)"],
  ["U08", L + "session-marker.js", 'return part.slice(index + 1).trim() === "1";', 'return part.slice(index + 1).trim() !== "";', "só o valor exato 1 vale"],
  ["U09", L + "session-marker.js", "=; Path=/; Max-Age=0;", "=; Path=/; Max-Age=60;", "apagar o marcador"],
  ["U10", L + "AdminLink.js", "if (response.status === 401) {", "if (response.status === 0) {", "401 apaga o marcador velho"],
  ["U11", L + "AdminLink.js", "prefetch={false}", "prefetch", "o link não pré-carrega (KaTeX) nas públicas"],
  ["U12", L + "AdminLink.js", "if (!readSessionMarker()) return undefined;", "", "anônimo não faz requisição a get-session"],
  ["U13", L + "AdminLink.js", "body.user.mustChangePassword === true", "false", "senha provisória leva a /admin/senha"],
  ["U14", L + "AdminLink.js", "} else if (body === null) {", "} else if (false) {", "get-session nulo apaga o marcador"],
  ["U15", A + "SignOutForm.js", "        clearSessionMarker();\n", "", "sair apaga o marcador"],
  ["U16", A + "LoginForm.js", "        setSessionMarker();\n", "", "entrar grava o marcador"],
  ["U17", L + "ColorModeToggle.js", '"Mudar para o modo claro" : "Mudar para o modo escuro"', '"Mudar para o modo escuro" : "Mudar para o modo claro"', "o nome acessível diz para onde o clique leva"],
  ["U18", L + "ColorModeToggle.js", "const Icon = dark ? icons.Light : icons.Dark;", "const Icon = dark ? icons.Dark : icons.Light;", "o ícone é o do modo de destino"],
  ["U19", L + "ColorModeToggle.js", 'return memory.value ?? "light";', 'return memory.value ?? "dark";', "primeira visita é clara"],
  ["U20", L + "ColorModeToggle.js", "localStorage.removeItem(LEGACY_STORAGE_KEY);", "", "a chave antiga some"],
  ["U21", A + "appearance-model.js", "draft.showLogo === false && draft.showName === false", "draft.showLogo === false || draft.showName === false", "pelo menos um dos dois ligado"],
  ["U22", A + "appearance-model.js", "if (!base[flag]) patch[field] = null;", "if (base[flag]) patch[field] = null;", "paleta que passa a herdar vai com as três cores nulas"],
  ["U23", A + "appearance-model.js", 'INHERIT_FLAG.light in draft && value === "" ? null', 'INHERIT_FLAG.light in draft && value === "x" ? null', "nome esvaziado herda (null)"],
  ["U24", A + "appearance-model.js", "PALETTE_FIELDS[mode].every(({ field }) => record[field] === null)", "PALETTE_FIELDS[mode].some(({ field }) => record[field] === null)", "só é herdada com as TRÊS cores nulas"],
  ["U25", A + "appearance-model.js", "if (length < 1 || length > DIRECTORY_TITLE_MAX)", "if (length < 0 || length > DIRECTORY_TITLE_MAX)", "título do diretório não vazio"],
  ["U26", A + "appearance-model.js", "if (length < 1 || length > DIRECTORY_TITLE_MAX)", "if (length < 1 || length > DIRECTORY_TITLE_MAX + 1)", "título do diretório até 40"],
  ["U27", A + "appearance-model.js", "if (draft[INHERIT_FLAG[mode]] === true) continue;", "", "paleta herdada não é validada como própria"],
  ["U28", A + "NotificationBell.js", 'if (event.key !== "Escape") return;', 'if (event.key !== "Esc") return;', "Esc fecha o popout"],
  ["U29", A + "NotificationBell.js", "export const POPOUT_SIZE = 8;", "export const POPOUT_SIZE = 10;", "8 notificações no popout"],
  ["U30", A + "NotificationBell.js", "aria-expanded={open}", "aria-expanded={true}", "estado do disclosure"],
  ["U31", A + "NotificationBell.js", "if (rootRef.current && !rootRef.current.contains(/** @type {Node} */ (event.target))) close(false);", "", "clique fora fecha"],
  ["U32", A + "NotificationBell.js", 'result.kind === "unauthenticated" || result.kind === "forbidden"', 'result.kind === "unauthenticated"', "a consulta para com 403 (senha provisória)"],
  ["U33", A + "NotificationBell.js", "    if (open) {\n      close(false);\n      return;\n    }\n    setOpen(true);\n    void load();", "    setOpen(true);\n    void load();", "o segundo clique fecha"],
  ["U34", A + "NotificationBell.js", "if (mine !== round.current) return;", "", "resposta de rodada encerrada é descartada"],
];

function run() {
  const r = spawnSync("npx", ["vitest", "run", ...TESTES], { cwd: wt, shell: true, encoding: "utf8", env: { ...process.env, DATABASE_URL: "", BETTER_AUTH_URL: "" } });
  return r.status;
}

let detectadas = 0, escaparam = 0, naoAchou = 0;
const base = run();
console.log(`linha de base: ${base === 0 ? "verde" : "VERMELHA (" + base + ")"}`);
if (base !== 0) process.exit(1);
for (const [id, arquivo, de, para, protege] of MUTANTES) {
  if (only.length && !only.includes(id)) continue;
  const caminho = join(wt, arquivo);
  const original = readFileSync(caminho, "utf8");
  const partes = original.split(de);
  if (partes.length !== 2) {
    console.log(`${id} NÃO ACHOU (${partes.length - 1} ocorrências) ${arquivo}: ${de.slice(0, 60)}`);
    naoAchou++;
    continue;
  }
  try {
    writeFileSync(caminho, partes.join(para));
    const status = run();
    if (status !== 0) {
      detectadas++;
      console.log(`${id} DETECTADA  ${protege}`);
    } else {
      escaparam++;
      console.log(`${id} ESCAPOU    ${protege}  [${arquivo}]`);
    }
  } finally {
    writeFileSync(caminho, original);
  }
}
console.log(`\nRESULTADO: ${detectadas} detectadas, ${escaparam} escaparam, ${naoAchou} não achadas`);
