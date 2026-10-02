import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { connection } from "next/server";
import { spaces } from "../../lib";

const spaceData = (handle) =>
  unstable_cache(async () => ({ stamp: Date.now() }), ["space-data", handle], { tags: [`space:${handle}`] })();

export async function generateMetadata({ params }) {
  const { handle } = await params;
  return { title: `Espaço ${handle} @${Date.now()}` };
}

// Layout do espaço: valida o handle e é o lugar do tema do dono (wrapper com variáveis CSS).
export default async function SpaceLayout({ children, params }) {
  const { handle } = await params;
  if (!spaces().includes(handle)) {
    // variante dyn-*: opta pela renderização dinâmica antes do 404, para o 404 não ser guardado em cache
    if (handle.startsWith("dyn-")) await connection();
    notFound();
  }
  const data = await spaceData(handle);
  return (
    <div style={{ "--vitrine-primary": "#123456" }}>
      <p>[[layout:{handle}:{Date.now()}]] [[tagged:{handle}:{data.stamp}]]</p>
      {children}
    </div>
  );
}
