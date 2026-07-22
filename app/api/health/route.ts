import { verifyStorage } from "@/src/server/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await verifyStorage();
    return Response.json({
      status: "ok",
      service: "enterprise-process-knowledge-map",
      persistence: "writable",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return Response.json({
      status: "error",
      service: "enterprise-process-knowledge-map",
      persistence: "unavailable",
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }
}
