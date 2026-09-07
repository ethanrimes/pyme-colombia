import { webhook } from "@/lib/integrations";
import { ApiError } from "@/lib/domain";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string; org: string }> },
) {
  try {
    const { provider, org } = await params;
    return Response.json(await webhook(provider, org, request));
  } catch (e) {
    if (e instanceof ApiError)
      return Response.json({ error: e.message }, { status: e.status });
    console.error("Webhook failed", e);
    return Response.json({ error: "Evento no procesado" }, { status: 500 });
  }
}
