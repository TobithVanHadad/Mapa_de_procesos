import { storeUpload } from "@/src/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Selecciona un archivo." }, { status: 400 });
    }
    return Response.json({ attachment: await storeUpload(file) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar el archivo." }, { status: 400 });
  }
}
