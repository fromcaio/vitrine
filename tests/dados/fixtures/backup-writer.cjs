// Escritor ativo do teste de cópia de segurança (A-019): outro PROCESSO que mantém o banco em WAL
// aberto com uma leitura longa (impede o checkpoint) e grava em laço, cada transação atômica
// (um usuário "w-N" e 5 notificações), até receber "stop" na entrada padrão. Uso interno do teste.
const Database = require("better-sqlite3");

const file = process.argv[2];
const db = new Database(file, { timeout: 5000 });
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("wal_autocheckpoint = 0"); // tudo recente fica no -wal: copiar só o arquivo principal perde linhas
db.pragma("synchronous = OFF");

// Transação longa: uma leitura aberta durante toda a cópia.
const reader = new Database(file, { timeout: 5000 });
reader.exec("BEGIN");
reader.prepare("SELECT count(*) FROM user").get();

const insertUser = db.prepare(
  "INSERT INTO user (id, name, email, emailVerified, updatedAt) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)",
);
const insertNotification = db.prepare(
  "INSERT INTO notifications (id, userId, type, data, updatedAt) VALUES (?, ?, 'ACCOUNT', '{}', CURRENT_TIMESTAMP)",
);
const write = db.transaction((n) => {
  const id = `w-${n}`;
  insertUser.run(id, id, `${id}@exemplo.test`);
  for (let k = 0; k < 5; k++) insertNotification.run(`${id}-n${k}`, id);
});

let n = 0;
let stopping = false;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  if (chunk.includes("stop")) stopping = true;
});

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function loop() {
  if (stopping) {
    reader.exec("ROLLBACK");
    reader.close();
    db.close();
    console.log(`done ${n}`);
    process.exit(0);
  }
  write(n++);
  if (n === 5) console.log("ready");
  sleep(1);
  setImmediate(loop);
}
loop();
