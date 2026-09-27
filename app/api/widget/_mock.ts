/** Local-only fallback for exercising the embedded widget without a gateway. */
export const MOCK_WEBSITE_ID = "7b1326d6-e7e0-4dbe-a001-4bbcf2f577e9";

export function isMockWidgetRequest(key: unknown) {
  return process.env.NODE_ENV === "development" && key === MOCK_WEBSITE_ID;
}

export function mockVisitorToken() {
  return "mock_visitor_7b1326d6";
}

export function mockGreeting() {
  return {
    id: "mock-greeting",
    senderType: "ai",
    senderId: "mock-elpinobot",
    body: "Hi there 👋 This is the local Elpino Chat demo. How can we help?",
    createdAt: new Date().toISOString(),
  };
}
