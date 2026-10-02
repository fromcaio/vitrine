// Mostra o caminho como o Next.js o entrega ao Route Handler (para a lista de permitidas da proposta 4).
export async function GET(request, { params }) {
  const { all } = await params;
  return Response.json({ url: request.url, pathname: new URL(request.url).pathname, all });
}
