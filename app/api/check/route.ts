import { checkPoint } from "@/lib/metro";
import { limit } from "@/lib/ratelimit";
import { invalid, respond } from "@/lib/respond";
import { pointParams } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = pointParams.safeParse({ lat: url.searchParams.get("lat"), lon: url.searchParams.get("lon") });
  if (!params.success) return invalid("Elige un punto dentro de Bogotá.");
  const limited = await limit(request);
  if (limited) return respond({ ok: false, error: limited, traces: [] });
  return respond(await checkPoint(params.data.lat, params.data.lon), 86400);
}
