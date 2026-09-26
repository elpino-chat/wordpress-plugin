import { callGateway } from "@/app/api/auth/_lib/gateway";
import { isMockWidgetRequest, mockGreeting } from "@/app/api/widget/_mock";

type WidgetMessage = { id: string; senderType: string; senderId: string | null; body: string; attachmentUrl?: string | null; attachmentType?: string | null; attachmentName?: string | null; createdAt: string };
type MessagesResult = { messages?: WidgetMessage[]; message?: WidgetMessage; greeting?: WidgetMessage | null; conversationId?: string; agentTyping?: boolean; error?: string };
type Attachment = { url: string; type: string; name?: string };

function corsHeaders() {
  return { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "cache-control": "no-store" };
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders() });
}

// Reading a thread is POST /api/widget/messages/read: a session token in a
// query string ends up in access logs, proxies and browser history.

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    key?: string;
    hostname?: string;
    visitorToken?: string;
    conversationId?: string;
    body?: string;
    attachment?: Attachment;
    topic?: string;
  };
  const text = body.body?.trim() ?? "";
  if (isMockWidgetRequest(body.key) && (text || body.attachment?.url)) {
    const now = new Date().toISOString();
    return Response.json({
      conversationId: "mock-conversation",
      greeting: mockGreeting(),
      message: { id: `mock-customer-${Date.now()}`, senderType: "customer", senderId: "mock-visitor", body: text || "Sent an attachment", createdAt: now },
    }, { headers: corsHeaders() });
  }
  if (!body.key?.trim() || !body.hostname?.trim() || !body.visitorToken?.trim() || (!text && !body.attachment?.url)) {
    return Response.json({ error: "key, hostname, visitorToken and body (or an attachment) are required" }, { status: 400, headers: corsHeaders() });
  }

  const result = await callGateway<MessagesResult>("/api/workspace/widget/messages", {
    publicKey: body.key.trim(),
    hostname: body.hostname.trim(),
    visitorToken: body.visitorToken.trim(),
    conversationId: body.conversationId?.trim() || undefined,
    body: text,
    attachment: body.attachment,
    topic: body.topic,
  });
  return Response.json(result, { status: result.error ? 400 : 200, headers: corsHeaders() });
}
