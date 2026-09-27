import { callGateway } from "@/app/api/auth/_lib/gateway";
import { isMockWidgetRequest } from "@/app/api/widget/_mock";

type PreChatField = {
  id: string;
  label: string;
  type: "text" | "email" | "phone" | "textarea" | "select" | "checkbox";
  required: boolean;
  options?: string[];
  placeholder?: string;
};
type FieldsResult = { allowed: boolean; fields?: PreChatField[]; error?: string };

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
  if (isMockWidgetRequest(key)) return Response.json({ allowed: true, fields: [] }, { headers: corsHeaders() });
  if (!key || !hostname) {
    return Response.json({ allowed: false, message: "key and hostname are required" }, { status: 400, headers: corsHeaders() });
  }

  const params = new URLSearchParams({ publicKey: key, hostname });
  const result = await callGateway<FieldsResult>(`/api/workspace/widget/prechat-fields?${params.toString()}`);
  return Response.json(result, { status: result.allowed ? 200 : 403, headers: corsHeaders() });
}
