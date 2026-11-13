import { getParcels } from "@/lib/metro";
import { respond } from "@/lib/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return respond(await getParcels(), 3600);
}
