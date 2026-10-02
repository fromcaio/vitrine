import { revalidatePath, revalidateTag } from "next/cache";
import { addSpace } from "../../../lib";

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  if (q.get("add")) addSpace(q.get("add"));
  if (q.get("tag")) revalidateTag(q.get("tag"), q.get("profile") === "now" ? { expire: 0 } : "max");
  if (q.get("loop")) {
    const t0 = performance.now();
    for (let i = 0; i < Number(q.get("loop")); i++) revalidatePath(`${q.get("base")}${i}`);
    return Response.json({ ok: true, chamadas: Number(q.get("loop")), ms: Math.round(performance.now() - t0) });
  }
  if (q.get("path")) {
    const type = q.get("type");
    if (type) revalidatePath(q.get("path"), type);
    else revalidatePath(q.get("path"));
  }
  return Response.json({ ok: true, ...Object.fromEntries(q) });
}
