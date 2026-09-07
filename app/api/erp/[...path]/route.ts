import { context, requireSameOrigin } from "@/lib/auth";
import { snapshot, mutate } from "@/lib/service";
import { saveConfig, checkout, issueInvoice } from "@/lib/integrations";
import { importCsv } from "@/lib/imports";
import { ApiError } from "@/lib/domain";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const ctx = await context(request);
    const { path } = await params;
    if (path[0] === "snapshot")
      return Response.json(await snapshot(ctx.org), {
        headers: { "Cache-Control": "no-store" },
      });
    throw new ApiError(404, "Recurso no encontrado");
  } catch (e) {
    return error(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    requireSameOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 2_000_000)
      throw new ApiError(413, "Archivo demasiado grande");
    const raw = await request.text();
    if (raw.length > 2_000_000)
      throw new ApiError(413, "Archivo demasiado grande");
    const body = JSON.parse(raw);
    const ctx = await context(request);
    const { path } = await params;
    let result;
    if (path[0] === "integrations")
      result = await saveConfig(ctx, path[1], body);
    else if (path[0] === "import") result = await importCsv(ctx, path[1], body);
    else if (path[0] === "sales" && path[2] === "checkout")
      result = await checkout(ctx, path[1]);
    else if (path[0] === "sales" && path[2] === "invoice")
      result = await issueInvoice(ctx, path[1], body);
    else result = await mutate(ctx, path, body);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return error(e);
  }
}
function error(e: unknown) {
  if (e instanceof ZodError)
    return Response.json(
      { error: e.issues.map((i) => i.message).join(". ") },
      { status: 400 },
    );
  if (e instanceof ApiError)
    return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof SyntaxError)
    return Response.json({ error: "Formato JSON no válido" }, { status: 400 });
  const message = String(e);
  if (message.includes("stock_nonnegative"))
    return Response.json(
      { error: "Stock insuficiente para esta operación" },
      { status: 409 },
    );
  if (message.includes("UNIQUE constraint"))
    return Response.json(
      {
        error:
          "El registro ya existe. Actualiza los datos antes de reintentar.",
      },
      { status: 409 },
    );
  if (message.includes("CHECK constraint"))
    return Response.json(
      { error: "La operación supera el stock o saldo disponible" },
      { status: 409 },
    );
  console.error("ERP request failed", e);
  return Response.json(
    { error: "No se pudo completar la operación. Intenta nuevamente." },
    { status: 500 },
  );
}
