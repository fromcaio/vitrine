// Cópia de segurança consistente e verificada do banco SQLite (RNF10; A-019). Funciona com o
// servidor no ar (o banco roda em WAL): lê o banco SOMENTE para leitura e gera a cópia com
// `VACUUM INTO`, que enxerga um instantâneo coerente (ver src/lib/backup.js).
//
//   Uso:     npm run db:backup -- <diretório> [--keep N]
//   Docker:  docker compose run --rm vitrine npm run db:backup -- /data/backups
//
// O destino vem do argumento ou de BACKUP_DIR (sem nenhum dos dois, o comando recusa: não há padrão).
// Grava `vitrine-AAAA-MM-DDThhmmssZ.db` (UTC), nunca sobrescreve, recusa o próprio banco (ou o -wal e
// o -shm) como destino e grava com permissão 0600 (no Windows não há efeito). Depois de copiar,
// verifica a cópia (integrity_check, foreign_key_check, tabelas e histórico de migrações do Prisma);
// se falhar, apaga a cópia e sai com código 1. Com `--keep N`, depois de uma cópia boa, apaga as
// cópias mais antigas deste mesmo padrão de nome no diretório, mantendo as N mais recentes.
// Imprime só o caminho da cópia, o tamanho e o resultado da verificação; nunca o DATABASE_URL.
// A restauração é um roteiro do Apêndice D (parar o serviço, trocar o arquivo, remover -wal e -shm).
//
// Executado com tsx, como o admin:create (jsconfig.json define o alias @/).
import "dotenv/config";

const USAGE = "Uso: npm run db:backup -- <diretório> [--keep N]   (ou defina BACKUP_DIR no ambiente)";

/**
 * @param {string[]} argv
 * @returns {{ destDir?: string, keep?: number }}
 */
function parseArgs(argv) {
  /** @type {string | undefined} */
  let destDir;
  /** @type {number | undefined} */
  let keep;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--keep" || arg.startsWith("--keep=")) {
      const raw = arg === "--keep" ? argv[++i] : arg.slice("--keep=".length);
      if (raw === undefined || !/^[1-9]\d*$/.test(raw)) throw new Error("--keep exige um número inteiro positivo.");
      keep = Number(raw);
    } else if (arg.startsWith("-")) {
      throw new Error(`Opção desconhecida: ${arg}.`);
    } else if (destDir === undefined) {
      destDir = arg;
    } else {
      throw new Error("Informe um só diretório de destino.");
    }
  }
  return { destDir, keep };
}

/** @param {number} bytes */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  const units = ["KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1).replace(".", ",")} ${units[unit]} (${bytes} bytes)`;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(/** @type {Error} */ (error).message);
    console.error(USAGE);
    return 1;
  }
  const destDir = args.destDir ?? (process.env.BACKUP_DIR?.trim() || undefined);
  if (!destDir) {
    console.error("Informe o diretório de destino da cópia (argumento ou BACKUP_DIR); não há um padrão.");
    console.error(USAGE);
    return 1;
  }

  // Imports dinâmicos: db.js exige DATABASE_URL já ao ser carregado e a mensagem aqui é em português.
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida (veja .env.example).");
    return 1;
  }
  const { databaseFileFromUrl } = await import("../src/lib/db.js");
  const { BackupError, createBackup } = await import("../src/lib/backup.js");

  /** @type {string} */
  let databaseFile;
  try {
    databaseFile = databaseFileFromUrl(process.env.DATABASE_URL);
  } catch {
    console.error("DATABASE_URL inválida: use o formato file:CAMINHO (veja .env.example).");
    return 1;
  }

  try {
    const result = createBackup({ databaseFile, destDir, keep: args.keep });
    console.log(`Cópia de segurança criada: ${result.file}`);
    console.log(`Tamanho: ${formatSize(result.bytes)}`);
    console.log(
      `Verificação: integridade ok; chaves estrangeiras ok; ${result.tables} tabelas; ${result.migrations} migrações do Prisma.`,
    );
    if (args.keep !== undefined) console.log(`Cópias antigas removidas: ${result.pruned.length} (mantidas as ${args.keep} mais recentes).`);
    return 0;
  } catch (error) {
    if (error instanceof BackupError) {
      console.error(error.message);
      return 1;
    }
    console.error("Falha inesperada ao gerar a cópia:", /** @type {Error} */ (error)?.message ?? "erro desconhecido");
    return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error("Falha ao gerar a cópia de segurança:", error?.message ?? error);
    process.exitCode = 1;
  });
