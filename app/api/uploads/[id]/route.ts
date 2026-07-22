import { promises as fs } from "node:fs";
import { deleteUpload, findUpload } from "@/src/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const upload = await findUpload(id);
  if (!upload) return new Response("Archivo no encontrado", { status: 404 });
  const bytes = await fs.readFile(upload.path);
  return new Response(bytes, {
    headers: {
      "content-type": upload.type,
      "content-length": String(bytes.length),
      "content-disposition": "inline",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function DELETE(_: Request, context: RouteContext) {
  const { id } = await context.params;
  return Response.json({ deleted: await deleteUpload(id) });
}
