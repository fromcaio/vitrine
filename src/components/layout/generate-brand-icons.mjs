// Gera `brand-icons.js` a partir do pacote `simple-icons` (CC0-1.0), UMA vez (ADR-035, item 3). O
// pacote é só devDependency: nada dele vai para o pacote do navegador nem para a imagem, e o módulo
// gerado é versionado. Uso: `node src/components/layout/generate-brand-icons.mjs`.
//
// Cada marca da lista do rodapé é procurada no Simple Icons; as que ele NÃO tem (a versão fixada em
// `package.json` não traz `linkedin` nem `lattes`) ficam de fora do módulo, e o `Footer` e o
// `IconPicker` desenham um glifo neutro, próprio do projeto, no lugar delas. `website` e `email` não
// são marcas e também são glifos próprios.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as simpleIcons from "simple-icons";

/** Ícone do rodapé -> chave do Simple Icons. */
const SLUGS = {
  github: "siGithub",
  linkedin: "siLinkedin",
  instagram: "siInstagram",
  youtube: "siYoutube",
  x: "siX",
  facebook: "siFacebook",
  bluesky: "siBluesky",
  mastodon: "siMastodon",
  telegram: "siTelegram",
  whatsapp: "siWhatsapp",
  twitch: "siTwitch",
  discord: "siDiscord",
  lattes: "siLattes",
  orcid: "siOrcid",
  researchgate: "siResearchgate",
  googlescholar: "siGooglescholar",
};

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../../../node_modules/simple-icons/package.json", import.meta.url)), "utf8"));
const found = [];
const missing = [];
for (const [icon, key] of Object.entries(SLUGS)) {
  const entry = /** @type {Record<string, { title: string, path: string } | undefined>} */ (simpleIcons)[key];
  if (entry) found.push([icon, entry]);
  else missing.push(icon);
}

const lines = found.map(([icon, entry]) => `  ${icon}: { title: ${JSON.stringify(entry.title)}, path: ${JSON.stringify(entry.path)} },`);
const out = `// GERADO por generate-brand-icons.mjs, não edite à mão. Ícones de marcas do Simple Icons
// (${pkg.name}@${pkg.version}, licença ${pkg.license}, domínio público): o caminho (\`path\`) de cada marca no
// quadrado de 24 unidades, para ser preenchido com \`currentColor\` (as cores seguem os tokens de tema,
// nunca a cor da marca). Marcas que o pacote NÃO tem nesta versão: ${missing.join(", ")} (o rodapé
// desenha um glifo neutro próprio no lugar; \`website\` e \`email\` também são glifos próprios).
// As marcas registradas pertencem aos respectivos donos; o ícone só identifica o destino do link.

/** @type {Readonly<Record<string, { title: string, path: string }>>} */
export const BRAND_ICONS = Object.freeze({
${lines.join("\n")}
});

export const BRAND_ICONS_SOURCE = Object.freeze({ package: ${JSON.stringify(pkg.name)}, version: ${JSON.stringify(pkg.version)}, license: ${JSON.stringify(pkg.license)} });
`;
writeFileSync(fileURLToPath(new URL("./brand-icons.js", import.meta.url)), out);
console.log(`brand-icons.js: ${found.length} marcas; sem marca no pacote: ${missing.join(", ")}`);
