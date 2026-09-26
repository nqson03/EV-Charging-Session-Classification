export interface Env {
  DB: D1Database;
  /** Optional response cache. Without it every dashboard load reads D1. */
  CACHE?: KVNamespace;
  ASSETS: Fetcher;
  /** Optional sign-in. e.g. https://your-team.cloudflareaccess.com — enables Cloudflare Access JWT verification. */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the Access application. */
  ACCESS_AUD?: string;
  /** Name recorded on uploads and rule changes when Access is not configured (default "anonymous"). */
  DEV_USER?: string;
}

export type AppEnv = { Bindings: Env; Variables: { user: string } };
