import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./env";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export const ANONYMOUS = "anonymous";

/**
 * The app is open by default: anyone with the link can view and change data.
 *
 * Optional sign-in: put Cloudflare Access in front of the hostname and set ACCESS_TEAM_DOMAIN
 * and ACCESS_AUD. The Worker then verifies the signed assertion Access forwards, so the API
 * cannot be reached by bypassing Access, and uploads / rule changes record the user's email.
 */
export const identifyUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud, DEV_USER } = c.env;

  if (team && aud) {
    const token = c.req.header("Cf-Access-Jwt-Assertion");
    if (!token) return c.json({ error: "Not signed in" }, 401);
    const issuer = team.replace(/\/$/, "");
    let jwks = jwksCache.get(issuer);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      jwksCache.set(issuer, jwks);
    }
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer, audience: aud });
      c.set("user", String(payload.email ?? payload.sub ?? "unknown"));
    } catch {
      return c.json({ error: "Invalid access token" }, 401);
    }
    return next();
  }

  c.set("user", DEV_USER || ANONYMOUS);
  return next();
};
