// Layout do espaço público `/{handle}` (RF29, RN23; ADR-024, ADR-030): confere que o espaço existe e
// está ativo (handle inexistente, sem handle, suspenso ou reservado: o mesmo `notFound()`, RF14) e
// define o título ("%s | nome") e a descrição, do dono. A moldura visual com a aparência dele
// (`SpaceLayout`) é montada pelas páginas (`SpaceFrame`), porque a *sidebar* depende do caminho.
// Tudo passa pela guarda do `next build` (`getSpace`): o build não consulta o banco (ADR-021).
import { notFound } from "next/navigation";
import { getSpace } from "../_lib/space";

/** Rede de segurança do ISR (Cap. 5 §5.7): as escritas revalidam por caminhos literais. */
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateMetadata({ params }) {
  const { handle } = await params;
  const space = await getSpace(handle);
  if (!space) return {};
  const description = space.appearance.siteDescription?.trim();
  return {
    // `absolute`: o título do próprio espaço ignora o modelo do layout raiz ("Vitrine").
    title: { absolute: space.name, template: `%s | ${space.name}` },
    ...(description ? { description } : {}),
  };
}

export default async function SpaceRootLayout({ children, params }) {
  const { handle } = await params;
  if (!(await getSpace(handle))) notFound();
  return children;
}
