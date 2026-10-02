// Cria o banco-modelo do RFC aplicando o SQL gerado pelo Prisma (migrate diff, sem db push).
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
const root = path.resolve(import.meta.dirname, "..");
const target = path.join(root, "db", "template.db");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.rmSync(target, { force: true });
const db = new Database(target);
db.exec(fs.readFileSync(path.join(root, "schema-gerado.sql"), "utf8"));
console.log("tabelas:", db.prepare("select name from sqlite_master where type='table' order by name").all().map((r) => r.name).join(", "));
db.close();
