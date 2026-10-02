// "Banco" do mini-aplicativo: um arquivo JSON com os handles existentes.
import fs from "node:fs";
export function spaces() {
  return JSON.parse(fs.readFileSync(process.env.E7_DATA, "utf8"));
}
export function addSpace(handle) {
  const all = spaces();
  if (!all.includes(handle)) fs.writeFileSync(process.env.E7_DATA, JSON.stringify([...all, handle]));
}
