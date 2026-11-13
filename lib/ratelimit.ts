import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Abuse protection for a public deploy, active when the Upstash env vars are
// set. The network, progress, trees and parcels are shared copies and are
// never limited; each address check can cost a call, so it is.
const redis = process.env.UPSTASH_REDIS_REST_URL?.startsWith("https://") && process.env.UPSTASH_REDIS_REST_TOKEN ? Redis.fromEnv() : null;

const limiter = redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "10 m"), prefix: "metro-bogota-live:lookup" }) : null;

/** `null` when the call may go ahead, otherwise the error to show. */
export async function limit(request: Request): Promise<{ code: string; message: string } | null> {
  if (!limiter) return null;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const { success } = await limiter.limit(ip);
  return success ? null : { code: "rate_limited", message: "Demasiadas consultas seguidas. Espera unos minutos e intenta de nuevo." };
}
