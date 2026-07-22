export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    service: "enterprise-process-knowledge-map",
    timestamp: new Date().toISOString(),
  });
}
