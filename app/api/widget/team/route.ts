import { callGateway } from "@/app/api/auth/_lib/gateway";
import { isMockWidgetRequest } from "@/app/api/widget/_mock";

type TeamMember = { id: string; name: string | null; avatarUrl: string | null; online: boolean };
type TeamResult = { allowed: boolean; members?: TeamMember[]; onlineCount?: number; error?: string };

function corsHeaders() {
  return { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "cache-control": "no-store" };
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders() });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key")?.trim();
  const hostname = url.searchParams.get("hostname")?.trim();
  if (isMockWidgetRequest(key)) {
    return Response.json({ allowed: true, onlineCount: 1, members: [{ id: "mock-agent", name: "Elpino Support", avatarUrl: null, online: true }] }, { headers: corsHeaders() });
  }
  if (!key || !hostname) {
    return Response.json({ allowed: false, message: "key and hostname are required" }, { status: 400, headers: corsHeaders() });
  }

  const params = new URLSearchParams({ publicKey: key, hostname });
  const result = await callGateway<TeamResult>(`/api/workspace/widget/team?${params.toString()}`);
  return Response.json(result, { status: result.allowed ? 200 : 403, headers: corsHeaders() });
}
