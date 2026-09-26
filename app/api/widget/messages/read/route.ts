import { callGateway } from "@/app/api/auth/_lib/gateway";
import { isMockWidgetRequest } from "@/app/api/widget/_mock";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (isMockWidgetRequest(body?.key)) {
    return Response.json({ allowed: true, messages: [], agentTyping: false }, { headers: { "cache-control": "no-store" } });
  }
  if (!body || typeof body.key !== "string" || typeof body.hostname !== "string" || typeof body.visitorToken !== "string") {
    return Response.json({ error: "Missing chat session" }, { status: 400 });
  }
  const result = await callGateway<Record<string, unknown>>("/api/workspace/widget/messages/read", {
    publicKey: body.key, hostname: body.hostname, visitorToken: body.visitorToken,
    conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
  });
  const denied = result.allowed === false || Boolean(result.error);
  return Response.json(result, { status: denied ? 403 : 200, headers: { "cache-control": "no-store" } });
}
