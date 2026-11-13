import { getTrees } from "@/lib/metro";
import { respond } from "@/lib/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return respond(await getTrees(), 3600);
}
