import { callGateway } from "@/app/api/auth/_lib/gateway";
import { clientLocation } from "@/app/api/_lib/client-geo";
import { getAuthRedirectBaseUrl } from "@/app/api/auth/_lib/redirect-url";
import { isMockWidgetRequest, mockGreeting, mockVisitorToken } from "@/app/api/widget/_mock";

type WidgetMessage = { id: string; senderType: string; senderId: string | null; body: string; createdAt: string };
type StartResult = { allowed: boolean; visitorToken?: string; conversationId?: string; botName?: string; botAvatarUrl?: string | null; messages?: WidgetMessage[]; error?: string };

// Same default as the Chatbot Interface settings page — a workspace that
// hasn't picked an avatar yet still shows a real icon instead of a blank/
// initial-letter fallback.
function defaultAvatarUrl(request: Request) {
  return `${getAuthRedirectBaseUrl(request)}/api/stock-icons/widget_5.png`;
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { key?: string; hostname?: string; visitorToken?: string; name?: string; identityToken?: unknown };
  if (isMockWidgetRequest(body.key)) {
    return Response.json({
      allowed: true,
      visitorToken: mockVisitorToken(),
      botName: "Elpino Support",
      greetingLines: ["Hi there 👋", "How can we help today?"],
      messages: [mockGreeting()],
    }, { headers: corsHeaders() });
  }
  if (!body.key?.trim() || !body.hostname?.trim()) {
    return Response.json({ allowed: false, message: "key and hostname are required" }, { status: 400, headers: corsHeaders() });
  }

  const result = await callGateway<StartResult>("/api/workspace/widget/start", {
    publicKey: body.key.trim(),
    hostname: body.hostname.trim(),
    visitorToken: body.visitorToken?.trim(),
    name: body.name,
    // Signed identity from the host page (ElpinoTag.identify), verified by
    // workspace-service. Passed through untouched and never logged.
    identityToken: typeof body.identityToken === "string" && body.identityToken.length <= 4096 ? body.identityToken : undefined,
    // Where this visitor is reaching us from. Captured here rather than
    // joined from analytics: the widget and the analytics tag keep separate
    // ids, so there is nothing dependable to join on.
    location: clientLocation(request),
  });
  if (result.allowed && !result.botAvatarUrl) result.botAvatarUrl = defaultAvatarUrl(request);
  return Response.json(result, { status: result.allowed ? 200 : 403, headers: corsHeaders() });
}

function corsHeaders() {
  return { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "cache-control": "no-store" };
}
