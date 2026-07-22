import { readMapDocument, writeMapDocument } from "@/src/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json({ document: await readMapDocument() }, {
    headers: { "cache-control": "no-store" },
  });
}

export async function PUT(request: Request) {
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > 2 * 1024 * 1024) {
    return Response.json({ error: "El mapa excede el tamaño permitido." }, { status: 413 });
  }

  let document: unknown;
  try {
    document = JSON.parse(body) as unknown;
  } catch {
    return Response.json({ error: "El documento no contiene JSON válido." }, { status: 400 });
  }

  if (!document || typeof document !== "object") {
    return Response.json({ error: "Documento inválido." }, { status: 400 });
  }

  const candidate = document as { nodes?: unknown[]; edges?: unknown[] };
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges) || candidate.nodes.length > 500 || candidate.edges.length > 1500) {
    return Response.json({ error: "El mapa contiene una estructura inválida." }, { status: 400 });
  }

  await writeMapDocument(document);
  return Response.json({ saved: true, savedAt: new Date().toISOString() });
}
