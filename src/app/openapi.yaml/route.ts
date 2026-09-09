import { OPENAPI_YAML } from "@/lib/ledger/openapi";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(OPENAPI_YAML, {
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
