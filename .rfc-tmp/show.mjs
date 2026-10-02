// Mostra um .out de forma compacta: junta { status, code, message } em uma linha.
import fs from "node:fs";
const t = fs.readFileSync(process.argv[2], "utf8").replace(/\n\s*\n/g, "\n");
console.log(t.replace(/\{\n\s*"status": (\d+),\n\s*"code": ([^,\n]+),?\n?\s*(?:"message": ([^\n]*))?\n\s*\}/g, (m, s, c, msg) => `{${s} ${c}${msg ? " " + msg : ""}}`));
