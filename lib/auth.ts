import { env } from "cloudflare:workers";
import { equal } from "./crypto";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { first } from "./database";
import { seedOrganization } from "./seed";
import { ApiError } from "./domain";
export async function context(request: Request) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ||
    request.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("nexo_session="))
      ?.slice(13);
  if (token) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    const hash = Array.from(new Uint8Array(digest))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    const config = env as Record<string, any>;
    if (
      config.ADMIN_API_TOKEN_HASH &&
      config.ADMIN_ORG_ID &&
      equal(hash, config.ADMIN_API_TOKEN_HASH)
    ) {
      const org = String(config.ADMIN_ORG_ID);
      if (!(await first("SELECT id FROM organizations WHERE id=?", org))) {
        try {
          await seedOrganization(org, "standalone-admin", false);
        } catch (e) {
          if (!(await first("SELECT id FROM organizations WHERE id=?", org)))
            throw e;
        }
      }
      return { org, actor: "standalone-admin", demo: false };
    }
    const device = await first(
      "SELECT d.*,o.demo FROM devices d JOIN organizations o ON o.id=d.org WHERE d.token_hash=? AND d.revoked=0 AND d.expires_at>?",
      hash,
      new Date().toISOString(),
    );
    if (!device)
      throw new ApiError(401, "Acceso del dispositivo no válido o vencido");
    return {
      org: device.org,
      actor: "device:" + device.id,
      demo: Boolean(device.demo),
      device: true,
    };
  }
  const user =
    (process.env.NODE_ENV === "development" ||
    (env as Record<string, any>).TRUST_SITES_IDENTITY === "true"
      ? await getChatGPTUser()
      : null) ??
    (process.env.NODE_ENV === "development"
      ? {
          userId: "local-owner",
          email: "local@nexo.test",
          displayName: "Local",
        }
      : null);
  if (!user) throw new ApiError(401, "Inicia sesión para acceder a tu negocio");
  const demo = request.headers.get("x-nexo-space") !== "live";
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(user.userId + ":" + (demo ? "demo" : "live")),
  );
  const org =
    "org-" +
    Array.from(new Uint8Array(hash))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
  if (
    !(await first(
      "SELECT id FROM organizations WHERE id=? AND owner=?",
      org,
      user.userId,
    ))
  ) {
    try {
      await seedOrganization(org, user.userId, demo);
    } catch (e) {
      if (
        !(await first(
          "SELECT id FROM organizations WHERE id=? AND owner=?",
          org,
          user.userId,
        ))
      )
        throw e;
    }
  }
  return { org, actor: user.userId, demo };
}
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError(403, "Origen de solicitud no permitido");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "Solicitud de otro sitio no permitida");
}
