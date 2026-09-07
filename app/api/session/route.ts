import { context, requireSameOrigin } from "@/lib/auth";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { token } = (await request.json()) as { token: string };
    if (typeof token !== "string" || !/^nx_[a-zA-Z0-9_-]{32,128}$/.test(token))
      return Response.json({ error: "Clave no válida" }, { status: 401 });
    const h = new Headers(request.headers);
    h.set("Authorization", "Bearer " + token);
    await context(new Request(request.url, { headers: h }));
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": `nexo_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`,
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Clave no válida o vencida" },
      { status: 401 },
    );
  }
}
export async function DELETE(request: Request) {
  requireSameOrigin(request);
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie":
          "nexo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      },
    },
  );
}
