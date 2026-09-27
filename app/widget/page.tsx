"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUp, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ExternalLink, File as FileIcon, LayoutGrid, Maximize2, MessageCircle, MessageSquarePlus, Minimize2, MoreHorizontal, Plus, Search, Smile, ThumbsDown, ThumbsUp, Volume2, VolumeX, X } from "lucide-react";
import MessageMarkdown from "@/app/components/MessageMarkdown";
import TypingDots from "@/app/components/TypingDots";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { playMessageChime, primeOnFirstInteraction } from "@/lib/notification-sound";

type Attachment = { url: string; type: "image" | "file" | "gif"; name?: string };
type WidgetMessage = {
  id: string;
  senderType: string;
  senderId: string | null;
  body: string;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  attachmentName?: string | null;
  createdAt: string;
};
/** An article in the Help tab. `id` identifies the whole article, not one stored chunk of it. */
type HelpArticle = { id: string; title: string; snippet: string; sourceUrl: string | null };
type HelpArticleBody = { id: string; title: string; content: string; sourceUrl: string | null };
type MessageGroup =
  | { kind: "system"; message: WidgetMessage }
  | { kind: "thread"; fromVisitor: boolean; messages: WidgetMessage[] };
type StartResult = { allowed: boolean; visitorToken?: string; conversationId?: string; botName?: string; botAvatarUrl?: string | null; greetingLines?: string[]; removeBranding?: boolean; topic?: string | null; customerName?: string | null; customerEmail?: string | null; customerPhone?: string | null; contactCollection?: "chat" | "off"; identified?: boolean; identityError?: string; messages?: WidgetMessage[]; error?: string };
type ConversationSummary = { id: string; status: string; topic?: string | null; preview: string; time: string };
// "home" is the greeting/start screen — no separate top-level tab for it (see
// `tab` below), just the Chat tab's own default view when there's nothing to
// resume. Matches Crisp/Intercom: land in an existing conversation, or greet.
type ChatView = "home" | "list" | "thread";
type ContactField = "email" | "name" | "phone";
const CONTACT_PROMPTS: Record<ContactField, { label: string; placeholder: string; type: string }> = {
  email: { label: "Your email", placeholder: "you@example.com", type: "email" },
  name: { label: "Your name", placeholder: "Your name", type: "text" },
  phone: { label: "Your phone (optional)", placeholder: "+1 555 123 4567", type: "tel" },
};
type GifResult = { id: string; url: string; preview: string };
type TeamMember = { id: string; name: string | null; avatarUrl: string | null; online: boolean };
type PreChatField = {
  id: string;
  label: string;
  type: "text" | "email" | "phone" | "textarea" | "select" | "checkbox" | "radio";
  required: boolean;
  options?: string[];
  placeholder?: string;
  multiple?: boolean;
};

const ACCENT = "#428ce5";
// Ink: the widget's primary text/icon color on its light surface. A few
// interactive accents (the pre-chat radio dot) key off ACCENT instead so
// they read as "selected", not just "text".
const INK = "#18181b";
const BG = "#f7f7f8";
const SURFACE = "#ffffff";
// Neutral chip background — the customer's own reply bubble uses ACCENT
// instead; this is for everything else that needs a soft fill (attachment
// preview, disabled composer state, the typing indicator).
const BUBBLE = "#eef1f4";
const BORDER = "#e4e6ea";
const MUTED = "rgba(24,24,27,.55)";
const ICON_MUTED = "rgba(24,24,27,.62)";
const POLL_MS = 2000;
// Same http->ws origin swap as app/tag.js/route.ts's gatewayWsOrigin() — kept
// separate since that one runs server-side and this runs in the browser.
// Missing the NODE_ENV fallback here meant local dev pointed this socket at
// production (wss://api.elpino.chat) instead of the local gateway, so it
// silently never connected and the widget fell back to poll-only — no
// word-by-word reveal, even though the feature worked once deployed.
const GATEWAY_WS_ORIGIN = (
  process.env.NEXT_PUBLIC_GATEWAY_URL || (process.env.NODE_ENV === "development" ? "http://localhost:4000" : "https://api.elpino.chat")
).replace(/^http/, "ws");
const REVEAL_MS_PER_WORD = 45;
const TEAM_POLL_MS = 15000;
const START_TIMEOUT_MS = 12000;
const TYPING_PING_MS = 2000;
// Longest the send button stays locked waiting for a reply.
const REPLY_WAIT_MAX_MS = 60000;
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const LOCAL_MOCK_WEBSITE_ID = "7b1326d6-e7e0-4dbe-a001-4bbcf2f577e9";
// Giphy's well-known public "beta" test key — fine for demo-scale traffic,
// rate-limited; swap for a real key before any real production usage.
const GIPHY_KEY = "dc6zaTOxFJmzC";
const EMOJI = [
  "😀","😂","🥰","😍","😊","🙂","😉","😢","😭","😮","😅","🙏","👍","👎","👏","🙌","🤝","💪","🔥","✨",
  "🎉","❤️","💙","💯","👀","🤔","😴","😎","🥳","😇","🙃","😬","😱","🤗","👋","✅","❌","⚡","⭐","💡",
];
const COUNTRIES = [
  { flag: "🇮🇳", code: "+91", name: "India" },
  { flag: "🇺🇸", code: "+1", name: "United States" },
  { flag: "🇬🇧", code: "+44", name: "United Kingdom" },
  { flag: "🇦🇺", code: "+61", name: "Australia" },
  { flag: "🇦🇪", code: "+971", name: "UAE" },
  { flag: "🇸🇬", code: "+65", name: "Singapore" },
  { flag: "🇨🇦", code: "+1", name: "Canada" },
  { flag: "🇩🇪", code: "+49", name: "Germany" },
  { flag: "🇯🇵", code: "+81", name: "Japan" },
];

// Per visitor and site: whether new replies make a sound.
function soundKey(publicKey: string) {
  return `elpino_sound_${publicKey}`;
}

function storageKey(publicKey: string) {
  return `elpino_visitor_${publicKey}`;
}

// The widget runs as a cross-site iframe, so storage here is third-party:
// Chrome partitions it (reads come back empty), but Firefox with strict
// tracking protection throws SecurityError outright. An unguarded read threw
// before the start fetch was ever issued, leaving the widget on its loading
// spinner forever. Degrading to "no stored token" just means the visitor is
// treated as new rather than resuming — the chat itself still works.
function readVisitorToken(publicKey: string): string | undefined {
  try {
    return window.localStorage.getItem(storageKey(publicKey)) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeVisitorToken(publicKey: string, token: string) {
  try {
    window.localStorage.setItem(storageKey(publicKey), token);
  } catch {
    // Storage blocked — the token stays in memory for this session only.
  }
}

function clearVisitorToken(publicKey: string) {
  try {
    window.localStorage.removeItem(storageKey(publicKey));
  } catch {
    // Storage blocked — nothing was stored to clear.
  }
}

// How long the widget waits for the host page to hand over a signed identity
// before starting anonymously. Short, because an older loader never answers.
const IDENTITY_WAIT_MS = 800;

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const isToday = new Date().toDateString() === date.toDateString();
  return isToday ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function WidgetContent() {
  const searchParams = useSearchParams();
  // `website_id` is used by public/widget.js. Keep `key` for the existing
  // tag.js loader and direct preview URLs during the migration.
  const key = searchParams.get("website_id")?.trim() || searchParams.get("key")?.trim() || "";
  const hostname = searchParams.get("host")?.trim() ?? "";
  // Keep the full realtime stack out of local widget demos. This is both
  // development-only and limited to one explicit non-production test ID.
  const isLocalMockWidget = process.env.NODE_ENV === "development" && key === LOCAL_MOCK_WEBSITE_ID;
  const startFresh = searchParams.get("new") === "1";
  // Where the visitor was on the previous page, handed over by the loader
  // (see VIEW_KEY in tag.js), so moving around the site doesn't drop them
  // back on Home.
  const restoredTab = searchParams.get("tab") === "chat" ? "chat" : searchParams.get("tab") === "help" ? "help" : null;
  const restoredChatView = searchParams.get("view") === "list" ? "list" : "thread";
  const restoredConversationRef = useRef(startFresh ? null : searchParams.get("conversation"));

  const [tab, setTab] = useState<"chat" | "help">(restoredTab ?? "chat");
  // No restored view to go on: land straight in the thread, same as
  // startFresh — a brand-new visitor sees the greeting rendered as the
  // thread's first bubble (see "messages.length === 0 && !conversationId"
  // below), not a separate card screen. Crisp/Intercom don't have a distinct
  // Home either. Nothing sets chatView to "home" anymore, but the ChatView
  // value and its render branch are left in place rather than torn out.
  const [chatView, setChatView] = useState<ChatView>(startFresh ? "thread" : restoredTab === "chat" ? restoredChatView : "thread");
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  // The page of the customer's site this visitor is on, as reported by the tag
  // (path and title only). Forwarded to the backend so a teammate sees it in the inbox.
  const sitePageRef = useRef<{ path: string; title: string } | null>(null);
  const [sitePageVersion, setSitePageVersion] = useState(0);
  const [botName, setBotName] = useState("Elpino Support");
  const [botAvatarUrl, setBotAvatarUrl] = useState<string | null>(null);
  const [greetingLines, setGreetingLines] = useState<string[]>(["Hi there 👋", "How can I help you today?"]);
  // First name of an identified visitor (ElpinoTag.identify()/getIdentityToken
  // on the host page), so the greeting can say "Hi Alex" instead of the
  // generic "Hi there" — null for an anonymous visitor, or one the site
  // identified without a real name on file yet ("Website visitor").
  const [greetingName, setGreetingName] = useState<string | null>(null);
  // Paid plans drop the badge. Starts true so a slow or failed config load
  // shows it rather than silently white-labelling a Free workspace.
  const [showBranding, setShowBranding] = useState(true);
  const [visitorToken, setVisitorToken] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [replyPreview, setReplyPreview] = useState<WidgetMessage | null>(null);
  const [draft, setDraft] = useState("");
  // Step-by-step contact form that takes over the message box when the AI
  // asks for an email "in case we get disconnected". The server decides when
  // (contactAsk on the message poll); this only walks the missing fields.
  const [contactFields, setContactFields] = useState<ContactField[] | null>(null);
  const [contactStep, setContactStep] = useState(0);
  const [contactValue, setContactValue] = useState("");
  const [contactError, setContactError] = useState("");
  const [contactSaving, setContactSaving] = useState(false);
  const [contactDoneFor, setContactDoneFor] = useState("");
  const [contactThanks, setContactThanks] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  // While a reply is being written the visitor can keep typing but not send: a second message
  // mid-turn starts a second, overlapping answer. The block lifts by itself after a while so a
  // reply that never arrives can never leave the chat stuck.
  const [replyWaitExpired, setReplyWaitExpired] = useState(false);
  useEffect(() => {
    setReplyWaitExpired(false);
    if (!agentTyping) return;
    const timer = window.setTimeout(() => setReplyWaitExpired(true), REPLY_WAIT_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [agentTyping]);
  const sendBlockedByReply = agentTyping && !replyWaitExpired;
  // First name of the teammate who joined; the header shows them instead of the AI.
  const [agentName, setAgentName] = useState<string | null>(null);
  // Ms-epoch deadline while the team is notified and nobody has joined yet.
  const [joinDeadline, setJoinDeadline] = useState<number | null>(null);
  const [joinNow, setJoinNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [recent, setRecent] = useState<ConversationSummary[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [recentLoading, setRecentLoading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<Attachment | null>(null);
  const [attachError, setAttachError] = useState("");
  const [activePanel, setActivePanel] = useState<"emoji" | "gif" | null>(null);
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState<GifResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [preChatNeeded, setPreChatNeeded] = useState(false);
  const [preChatSubmitting, setPreChatSubmitting] = useState(false);
  const [preChatFields, setPreChatFields] = useState<PreChatField[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [formCountry, setFormCountry] = useState(0);
  const pendingTopicRef = useRef<string | null>(null);

  function setAnswer(id: string, value: string) {
    setAnswers((current) => ({ ...current, [id]: value }));
  }
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Signed identity from the host page (ElpinoTag.identify). The loader hands
  // it over by postMessage, never in this iframe's URL, where it would end up
  // in logs and referrers. The session start below waits for it, so a
  // logged-in visitor is not started as an anonymous one first.
  const identityTokenRef = useRef<string | null>(null);
  const activeVisitorRef = useRef("");
  const sessionEpochRef = useRef(0);
  const mockReplyTimersRef = useRef<number[]>([]);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  useEffect(() => () => {
    for (const timer of mockReplyTimersRef.current) window.clearTimeout(timer);
    mockReplyTimersRef.current = [];
  }, []);
  // keepDraft: the session merely lapsed and the same person is about to be
  // signed back in, so what they were typing survives. Logout and account
  // switches clear everything.
  // keepVisitorToken: a fresh identity token arrived that *might* verify to
  // someone new, but hasn't been checked yet — don't throw away this
  // browser's anonymous history on a guess. The start() response that
  // follows already does the right thing once it actually knows: it clears
  // the stored token itself if the visitor turns out to be identified, and
  // otherwise leaves it alone. Without this, a host page that mints a new
  // (structurally different, even if equally unverified) token on every
  // fetch — e.g. our own dashboard session backing elpino.chat's widget
  // tag — wipes the anonymous visitor's saved token, and with it every past
  // conversation, on essentially every identity refresh.
  const discardSession = useCallback((options: { keepDraft?: boolean; keepVisitorToken?: boolean } = {}) => {
    const oldToken = activeVisitorRef.current;
    activeVisitorRef.current = "";
    sessionEpochRef.current += 1;
    if (oldToken.startsWith("ws_")) {
      void fetch("/api/widget/logout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, hostname, visitorToken: oldToken }), keepalive: true }).catch(() => undefined);
    }
    if (!options.keepVisitorToken) clearVisitorToken(key);
    setVisitorToken("");
    setConversationId("");
    setMessages([]);
    setRecent([]);
    if (!options.keepDraft) {
      setAnswers({});
      setDraft("");
      setPendingAttachment(null);
      pendingTopicRef.current = null;
    }
    setAgentTyping(false);
    setSending(false);
    setPreChatSubmitting(false);
    setActivePanel(null);
    setAttachError("");
    setSessionExpiresAt(null);
  }, [key, hostname]);
  // Which account the current session belongs to (an opaque value from the
  // server), so a refresh can tell "same person, new session" from a switch.
  const accountRefRef = useRef<string | null>(null);
  // Set while the page is asked for a fresh token ahead of the session's hard
  // cap; the token that comes back replaces the session without touching the UI.
  const silentRefreshRef = useRef(false);

  // New-reply alerts: a soft sound, plus an unread count the loader shows on
  // the launcher and in the page title, whenever the visitor is not looking.
  // panelOpenRef comes from the loader; the iframe cannot tell on its own
  // whether it is hidden behind a closed launcher.
  const panelOpenRef = useRef(true);
  // The iframe owns its visible state. The host page owns only its dimensions;
  // opening must never navigate the iframe or replace its current URL.
  const [isOpen, setIsOpen] = useState(false);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const seenConversationRef = useRef("");
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  useEffect(() => {
    primeOnFirstInteraction();
    try {
      const on = window.localStorage.getItem(soundKey(key)) !== "off";
      soundOnRef.current = on;
      setSoundOn(on);
    } catch {
      // Storage blocked: the default (on) stands for this session.
    }
  }, [key]);
  function toggleSound() {
    const next = !soundOnRef.current;
    soundOnRef.current = next;
    setSoundOn(next);
    try { window.localStorage.setItem(soundKey(key), next ? "on" : "off"); } catch { /* remembered for this session only */ }
  }
  // The iframe itself can't resize its own dimensions — the loader (tag.js)
  // owns the fixed positioning and size. This just tells it to swap between
  // the normal panel and a fullscreen one; see the elpino:maximize handler
  // there for the actual CSS swap.
  const [isMaximized, setIsMaximized] = useState(false);
  function toggleMaximize() {
    const next = !isMaximized;
    setIsMaximized(next);
    window.parent.postMessage({ type: "elpino:maximize", maximized: next }, "*");
  }

  // "Did we help you?" — shown by the X button, the in-thread back arrow,
  // and the browser/phone Back button (see the elpino:back-pressed handler
  // below) whenever there's an actual conversation to leave. One screen, not
  // a confirm-then-rate sequence: picking a thumb is optional, "Leave Chat"
  // resolves the conversation and submits whatever rating (if any) was
  // picked in a single step.
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [ratingChoice, setRatingChoice] = useState<1 | -1 | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Where "leaving" actually lands. The X button and the browser/phone back
  // button close the whole panel; the in-thread "Back to chats" arrow
  // doesn't close anything, it just returns to the list — but it's
  // abandoning the same active conversation, so it deserves the same
  // question. A ref since it's only read once the flow finishes, never
  // rendered.
  const leaveTargetRef = useRef<"close" | "list">("close");
  function requestLeave(target: "close" | "list" = "close") {
    if (leaveOpen) return;
    const hasActiveConversation = tab === "chat" && chatView === "thread" && Boolean(conversationId) && messages.some((m) => m.senderType !== "system");
    if (hasActiveConversation) {
      leaveTargetRef.current = target;
      setLeaveOpen(true);
    } else if (target === "list") {
      openChatList();
    } else {
      closeWidget();
    }
  }
  function goBack() {
    setLeaveOpen(false);
    setRatingChoice(null);
  }
  async function leaveChat() {
    setLeaving(true);
    // Best-effort: the visitor is leaving either way, so a failed request
    // (offline, a dropped connection) must not block the close/navigate
    // that follows.
    try {
      await fetch("/api/widget/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, hostname, visitorToken, conversationId }),
      });
      if (ratingChoice) {
        await fetch("/api/widget/rate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, hostname, visitorToken, conversationId, rating: ratingChoice }),
        });
      }
    } catch { /* the conversation just stays open/unrated on the team's side */ }
    // Reset first: closing hides the iframe rather than unmounting it, and
    // "list" doesn't hide anything at all — either way this screen has to
    // be told to go away itself, or it just sits there on top of whatever
    // comes next (the chat list, or the same stale screen on reopen).
    setLeaving(false);
    setLeaveOpen(false);
    setRatingChoice(null);
    // The conversation is over for this visitor: forget it here too, so the
    // thread, Home's "Continue the conversation" card and the list entry
    // can't lead back into it. The server hides it from the list as well.
    const left = conversationId;
    setConversationId("");
    setMessages([]);
    setRecent((items) => items.filter((item) => item.id !== left));
    if (leaveTargetRef.current === "list") openChatList();
    else closeWidget();
  }
  // The panel always reopens fresh on the next visit — carrying a stale
  // "leave chat?" prompt across sessions would be confusing.
  useEffect(() => {
    if (leaveOpen) { setLeaveOpen(false); setRatingChoice(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // The browser/phone Back button is caught by the loader (tag.js), on the
  // host page — the iframe can't see that navigation on its own, so the
  // loader re-arms its history marker and tells us instead of closing
  // outright. Re-subscribed on every dependency requestLeave reads, so it
  // always acts on the current conversation rather than a stale one.
  useEffect(() => {
    function onBackPressed(event: MessageEvent) {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      try { if (new URL(event.origin).hostname !== hostname) return; } catch { return; }
      if ((event.data as { type?: unknown }).type !== "elpino:back-pressed") return;
      requestLeave();
    }
    window.addEventListener("message", onBackPressed);
    return () => window.removeEventListener("message", onBackPressed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostname, tab, chatView, conversationId, messages, leaveOpen]);

  function announceReplies(count: number, latestReply?: WidgetMessage) {
    if (panelOpenRef.current && !document.hidden) return;
    if (latestReply) setReplyPreview(latestReply);
    if (soundOnRef.current) playMessageChime();
    // A count only, never message content: the host page is a different site.
    window.parent.postMessage({ type: "elpino:unread", count }, "*");
  }

  // Word-by-word reveal for a message pushed live over /rt/widget: the text
  // itself was already generated and safety-reviewed before it ever reached
  // the widget, so this is purely a client-side typing effect, not a token
  // stream from the model. See the WebSocket effect below for where it's
  // triggered, and revealMap for how the render picks it up.
  const [revealMap, setRevealMap] = useState<Record<string, string>>({});
  const revealTimersRef = useRef<Map<string, number>>(new Map());
  function revealWordByWord(id: string, full: string) {
    const existing = revealTimersRef.current.get(id);
    if (existing) window.clearTimeout(existing);
    const words = full.split(/(\s+)/);
    let shown = 0;
    setRevealMap((prev) => ({ ...prev, [id]: "" }));
    const step = () => {
      shown++;
      let partial = words.slice(0, shown).join("");
      // Close a half-revealed **bold** so it renders bold mid-reveal instead of flashing raw asterisks.
      if ((partial.match(/\*\*/g)?.length ?? 0) % 2 === 1) partial += "**";
      setRevealMap((prev) => (prev[id] === undefined ? prev : { ...prev, [id]: partial }));
      if (shown < words.length) {
        revealTimersRef.current.set(id, window.setTimeout(step, REVEAL_MS_PER_WORD));
      } else {
        revealTimersRef.current.delete(id);
        setRevealMap((prev) => {
          if (prev[id] === undefined) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    };
    step();
  }
  useEffect(() => {
    return () => {
      for (const timer of revealTimersRef.current.values()) window.clearTimeout(timer);
    };
  }, []);

  const identityReadyRef = useRef(false);
  const rejectedIdentityRef = useRef<string | null>(null);
  const [identityReady, setIdentityReady] = useState(false);

  useEffect(() => {
    function markReady() {
      identityReadyRef.current = true;
      setIdentityReady(true);
    }
    function onMessage(event: MessageEvent) {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      try { if (new URL(event.origin).hostname !== hostname) return; } catch { return; }
      const data = event.data as { type?: unknown; token?: unknown };
      if (data.type === "elpino:identity") {
        const token = typeof data.token === "string" && data.token ? data.token : null;
        const restart = identityReadyRef.current && token !== identityTokenRef.current;
        identityTokenRef.current = token;
        if (!identityReadyRef.current) markReady();
        if (restart && token && silentRefreshRef.current && activeVisitorRef.current.startsWith("ws_")) {
          // The token asked for ahead of the session cap: swap quietly.
          silentRefreshRef.current = false;
          void refreshSilently(token);
        } else if (restart) {
          // Logged in, logged out or switched user after the chat started —
          // or just a fresh token for the same not-yet-verified visitor; the
          // start() call below is what actually finds out which. The draft
          // is kept here and cleared once the new session reports a
          // different account (see accountRefRef in the start effect); the
          // anonymous visitor token is kept for the same reason — the start
          // effect already clears it itself if this token turns out to
          // verify to someone.
          silentRefreshRef.current = false;
          discardSession({ keepDraft: true, keepVisitorToken: true });
          setRetryCount((count) => count + 1);
        }
      } else if (data.type === "elpino:panel") {
        const isOpen = Boolean((data as { open?: unknown }).open);
        panelOpenRef.current = isOpen;
        setIsOpen(isOpen);
        if (isOpen) setReplyPreview(null);
        // Closing always restores the normal size on the loader's side
        // (see tag.js) — mirror that here so reopening doesn't show
        // "Restore size" for a panel that's already back to normal.
        if (!isOpen) setIsMaximized(false);
      } else if (data.type === "elpino:page") {
        const page = event.data as { path?: unknown; title?: unknown };
        if (typeof page.path === "string" && page.path.startsWith("/")) {
          sitePageRef.current = { path: page.path.slice(0, 300), title: typeof page.title === "string" ? page.title.slice(0, 160) : "" };
          setSitePageVersion((version) => version + 1);
        }
      } else if (data.type === "elpino:logout") {
        // Forget this browser's session entirely, so the next person on it
        // cannot resume the signed-out user's conversations.
        identityTokenRef.current = null;
        discardSession();
        if (!identityReadyRef.current) markReady();
        setRetryCount((count) => count + 1);
      }
    }
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "elpino:widget-ready" }, "*");
    const fallback = window.setTimeout(() => { if (!identityReadyRef.current) markReady(); }, IDENTITY_WAIT_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(fallback);
    };
  }, [key, hostname, discardSession]);

  useEffect(() => {
    if (!sessionExpiresAt) return;
    // A few minutes before the hard cap, ask the page for a fresh token; when
    // it arrives the session is swapped without clearing anything.
    const REFRESH_LEAD_MS = 3 * 60 * 1000;
    const refreshTimer = window.setTimeout(() => {
      silentRefreshRef.current = true;
      window.parent.postMessage({ type: "elpino:identity-refresh" }, "*");
    }, Math.max(0, sessionExpiresAt - REFRESH_LEAD_MS - Date.now()));
    // Reached the cap without a fresh token: restart, keeping the draft.
    const expire = () => {
      identityTokenRef.current = null;
      discardSession({ keepDraft: true });
      setRetryCount((count) => count + 1);
      window.parent.postMessage({ type: "elpino:identity-refresh" }, "*");
    };
    const timer = window.setTimeout(expire, Math.max(0, sessionExpiresAt - Date.now()));
    const onFocus = () => { if (Date.now() >= sessionExpiresAt) expire(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearTimeout(refreshTimer);
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [sessionExpiresAt, discardSession]);

  function retireSession(token: string) {
    if (!token.startsWith("ws_")) return;
    void fetch("/api/widget/logout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, hostname, visitorToken: token }), keepalive: true }).catch(() => undefined);
  }

  // Exchanges a fresh token for a new session for the same account while the
  // current one is still valid. Messages, draft and attachment stay as they
  // are; the server has already moved open conversations to the new session.
  async function refreshSilently(token: string) {
    const epoch = sessionEpochRef.current;
    const previous = activeVisitorRef.current;
    try {
      const response = await fetch("/api/widget/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, hostname, identityToken: token }),
      });
      const data = (await response.json()) as StartResult & { sessionExpiresAt?: number | null; accountRef?: string };
      const fresh = data.allowed && data.identified && data.visitorToken?.startsWith("ws_") ? data.visitorToken : null;
      if (epoch !== sessionEpochRef.current || activeVisitorRef.current !== previous) {
        // Logged out or switched while this was in flight: never adopt it.
        if (fresh) retireSession(fresh);
        return;
      }
      if (!fresh || data.accountRef !== accountRefRef.current) {
        // Refused, or a different account: a full restart decides what to show.
        if (fresh) retireSession(fresh);
        discardSession();
        setRetryCount((count) => count + 1);
        return;
      }
      activeVisitorRef.current = fresh;
      setVisitorToken(fresh);
      setSessionExpiresAt(data.sessionExpiresAt ?? null);
      retireSession(previous);
    } catch {
      // Network trouble: keep the current session, which is still valid. The
      // hard cap falls back to a normal restart.
    }
  }

  useEffect(() => {
    if (!key || !hostname) { setDenied(true); setLoading(false); return; }
    if (!identityReady) return;
    setLoading(true);
    setLoadFailed(false);
    const storedToken = readVisitorToken(key);
    const controller = new AbortController();
    const epoch = sessionEpochRef.current;
    // Without this, a request that never resolves (dropped connection, dev
    // server hiccup, flaky network) leaves the widget stuck on the loading
    // spinner forever instead of ever surfacing an error to retry from.
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, START_TIMEOUT_MS);
    fetch("/api/widget/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, hostname, visitorToken: storedToken, identityToken: identityTokenRef.current ?? undefined }),
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data: StartResult & { sessionExpiresAt?: number | null; accountRef?: string }) => {
        if (controller.signal.aborted || epoch !== sessionEpochRef.current) {
          if (data.visitorToken?.startsWith("ws_")) void fetch("/api/widget/logout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, hostname, visitorToken: data.visitorToken }), keepalive: true }).catch(() => undefined);
          return;
        }
        if (!data.allowed) {
          if (data.identityError) {
            console.warn(`[Elpino] Identity token was not accepted: ${data.identityError}`);
            const rejected = identityTokenRef.current;
            if (rejectedIdentityRef.current !== rejected) {
              rejectedIdentityRef.current = rejected;
              window.parent.postMessage({ type: "elpino:identity-refresh" }, "*");
            }
            // Chat anonymously rather than showing an error. A single-use
            // token rendered into the page is refused once its session has
            // ended; a fresh token from the page signs the visitor back in.
            identityTokenRef.current = null;
            setRetryCount((count) => count + 1);
          } else setDenied(true);
          return;
        }
        setDenied(false);
        // For the site's developer: why ElpinoTag.identify() did not sign
        // the visitor in (expired, bad_signature, not_configured…).
        if (data.identityError) console.warn(`[Elpino] Identity token was not accepted: ${data.identityError}`);
        setBotName(data.botName || "Elpino Support");
        setBotAvatarUrl(data.botAvatarUrl ?? null);
        setShowBranding(!data.removeBranding);
        const realName = data.identified && data.customerName && data.customerName !== "Website visitor" ? data.customerName.trim().split(/\s+/)[0] : null;
        setGreetingName(realName || null);
        if (Array.isArray(data.greetingLines) && data.greetingLines.length > 0) setGreetingLines(data.greetingLines);
        activeVisitorRef.current = data.visitorToken ?? "";
        // A different person than before (after an expiry that kept the
        // draft): nothing typed for the previous account carries over.
        if (accountRefRef.current && data.accountRef !== accountRefRef.current) {
          setDraft("");
          setAnswers({});
          setPendingAttachment(null);
          pendingTopicRef.current = null;
        }
        accountRefRef.current = data.accountRef ?? null;
        setSessionExpiresAt(data.sessionExpiresAt ?? null);
        if (data.identified) clearVisitorToken(key);
        else if (data.visitorToken) writeVisitorToken(key, data.visitorToken);

        // The blocking pre-chat form is retired in favor of a conversational
        // ask — the AI requests name/email in its own greeting (see
        // widget.service.ts identity()'s needsContact line) instead of
        // gating the whole widget behind a form. preChatNeeded stays wired
        // up (PreChatFieldInput, submitPreChat) for a workspace that still
        // wants it, but nothing here flips it on anymore.
        if (data.visitorToken) setVisitorToken(data.visitorToken);

        // startFresh (the greeting-popup's "new chat" flow) deliberately
        // skips resuming — nothing is created server-side until the visitor
        // actually sends a message, so this just means "show an empty
        // thread" rather than requiring an extra API call.
        if (!startFresh) {
          // The thread open on the previous page, if it isn't the one the
          // server resumed (an older thread opened from the list, say). Used
          // once: a restart after login, logout or a user switch resumes
          // whatever the server says, never a previous person's thread. The
          // poll below loads its messages, and drops it if it has ended or
          // isn't this visitor's.
          const restored = restoredConversationRef.current;
          restoredConversationRef.current = null;
          if (restored && restored !== data.conversationId) {
            setConversationId(restored);
            setMessages([]);
          } else {
            // Cleared as well as set: a restart after login, logout or a user
            // switch must not keep showing the previous person's thread.
            setConversationId(data.conversationId ?? "");
            setMessages(data.messages ?? []);
          }
        }
      })
      .catch(() => { if ((!controller.signal.aborted || timedOut) && epoch === sessionEpochRef.current) setLoadFailed(true); })
      .finally(() => {
        window.clearTimeout(timeout);
        if (epoch === sessionEpochRef.current) setLoading(false);
      });
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hostname, retryCount, identityReady]);

  useEffect(() => {
    if (!key || !hostname) return;
    const params = new URLSearchParams({ key, hostname });
    fetch(`/api/widget/prechat-fields?${params.toString()}`)
      .then((response) => response.json())
      .then((data: { allowed?: boolean; fields?: PreChatField[] }) => {
        if (data.allowed && Array.isArray(data.fields)) setPreChatFields(data.fields);
      })
      .catch(() => undefined);
  }, [key, hostname]);

  useEffect(() => {
    if (!key || !hostname) return;
    const params = new URLSearchParams({ key, hostname });
    let cancelled = false;
    function loadTeam() {
      fetch(`/api/widget/team?${params.toString()}`)
        .then((response) => response.json())
        .then((data: { allowed?: boolean; members?: TeamMember[]; onlineCount?: number }) => {
          if (cancelled || !data.allowed) return;
          setTeam(data.members ?? []);
          setOnlineCount(data.onlineCount ?? 0);
        })
        .catch(() => undefined);
    }
    loadTeam();
    // A one-time fetch left "online" frozen at whatever it was on page
    // load — a teammate closing their tab never updated a visitor's
    // already-open widget. Polling is what makes this actually live.
    const interval = window.setInterval(loadTeam, TEAM_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [key, hostname]);

  function loadRecent() {
    if (!visitorToken) return;
    setRecentLoading(true);
    const epoch = sessionEpochRef.current;
    fetch("/api/widget/conversations/list", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, hostname, visitorToken }) })
      .then((response) => response.json())
      .then((data: { conversations?: ConversationSummary[]; allowed?: boolean }) => {
        if (epoch !== sessionEpochRef.current) return;
        if (data.allowed === false && activeVisitorRef.current.startsWith("ws_")) {
          identityTokenRef.current = null;
          discardSession({ keepDraft: true });
          setRetryCount((count) => count + 1);
          window.parent.postMessage({ type: "elpino:identity-refresh" }, "*");
          return;
        }
        setRecent(data.conversations ?? []);
      })
      .catch(() => setRecent([]))
      .finally(() => setRecentLoading(false));
  }

  function openChatList() {
    setTab("chat");
    setChatView("list");
    loadRecent();
  }

  // Tell the loader where the visitor is, so the next page on the site opens
  // here too (see VIEW_KEY in tag.js). Held back until the session has
  // loaded: before that, the empty starting conversation would overwrite the
  // one being carried over.
  useEffect(() => {
    if (loading) return;
    window.parent.postMessage({ type: "elpino:view", tab, chatView, conversationId }, "*");
  }, [loading, tab, chatView, conversationId]);

  // Carried over onto the chat list: it needs loading, which normally
  // happens when the visitor taps into it.
  const restoreListRef = useRef(restoredTab === "chat" && restoredChatView === "list");

  // ---- Help tab: articles the workspace marked visible to visitors, scoped
  // to this site. Listed once when the tab is first opened; searched as the
  // visitor types, debounced so each keystroke isn't a request.
  const [helpArticles, setHelpArticles] = useState<HelpArticle[] | null>(null);
  const [helpQuery, setHelpQuery] = useState("");
  const [helpResults, setHelpResults] = useState<HelpArticle[] | null>(null);
  const [helpSearching, setHelpSearching] = useState(false);
  const [openArticle, setOpenArticle] = useState<HelpArticleBody | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);

  useEffect(() => {
    if (tab !== "help" || helpArticles !== null || !key || !hostname) return;
    const params = new URLSearchParams({ key, hostname });
    fetch(`/api/widget/help/articles?${params.toString()}`)
      .then((response) => response.json())
      .then((data: { articles?: HelpArticle[] }) => setHelpArticles(data.articles ?? []))
      .catch(() => setHelpArticles([]));
  }, [tab, helpArticles, key, hostname]);

  useEffect(() => {
    const query = helpQuery.trim();
    if (query.length < 2) { setHelpResults(null); setHelpSearching(false); return; }
    setHelpSearching(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ key, hostname, q: query });
      fetch(`/api/widget/help/search?${params.toString()}`)
        .then((response) => response.json())
        .then((data: { articles?: HelpArticle[] }) => { if (!cancelled) setHelpResults(data.articles ?? []); })
        .catch(() => { if (!cancelled) setHelpResults([]); })
        .finally(() => { if (!cancelled) setHelpSearching(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [helpQuery, key, hostname]);

  function openHelpArticle(id: string) {
    setArticleLoading(true);
    const params = new URLSearchParams({ key, hostname, id });
    fetch(`/api/widget/help/article?${params.toString()}`)
      .then((response) => response.json())
      .then((data: { article?: HelpArticleBody }) => setOpenArticle(data.article ?? null))
      .catch(() => setOpenArticle(null))
      .finally(() => setArticleLoading(false));
  }

  // "Still need help?" — a fresh chat that starts from the article they
  // just read, so they don't have to explain what they were looking at.
  function askAboutArticle(article: HelpArticleBody) {
    setOpenArticle(null);
    startNewChat();
    setDraft(`About "${article.title}": `);
  }
  useEffect(() => {
    if (!restoreListRef.current || loading || !visitorToken) return;
    restoreListRef.current = false;
    loadRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, visitorToken]);

  function openThread(id: string) {
    setConversationId(id);
    setChatView("thread");
    setTab("chat");
  }

  function preChatCanSubmit() {
    return preChatFields.every((field) => {
      if (!field.required) return true;
      const value = answers[field.id];
      return field.type === "checkbox" && !field.multiple ? value === "true" : Boolean(value?.trim());
    });
  }

  async function submitPreChat() {
    if (preChatSubmitting || !visitorToken || !preChatCanSubmit()) return;
    setPreChatSubmitting(true);
    const epoch = sessionEpochRef.current;
    try {
      const payloadAnswers: Record<string, string> = {};
      for (const field of preChatFields) {
        const raw = answers[field.id];
        if (!raw) continue;
        payloadAnswers[field.id] = field.type === "phone" ? `${COUNTRIES[formCountry].code} ${raw.trim()}` : raw.trim();
      }

      const response = await fetch("/api/widget/prechat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key,
          hostname,
          visitorToken,
          conversationId: conversationId || undefined,
          answers: payloadAnswers,
        }),
      });
      if (epoch !== sessionEpochRef.current || !response.ok) return;
      const result = await response.json();
      if (!result.allowed || epoch !== sessionEpochRef.current) return;
      // Filling in the form doesn't create a conversation by itself — if the
      // visitor doesn't have one yet, remember the topic so it's applied
      // once they actually send their first message (see sendPayload).
      if (!conversationId) pendingTopicRef.current = payloadAnswers.topic ?? null;
      setPreChatNeeded(false);
      setTab("chat");
      setChatView("thread");
    } finally {
      if (epoch === sessionEpochRef.current) setPreChatSubmitting(false);
    }
  }

  function closeWidget() {
    setIsOpen(false);
    panelOpenRef.current = false;
    // The compact iframe loader listens for `action`; retain the legacy event
    // so sites still using public/tag.js resize correctly during migration.
    window.parent.postMessage({ action: "close" }, "*");
    window.parent.postMessage({ type: "elpino:close" }, "*");
  }

  function openWidget() {
    setIsOpen(true);
    panelOpenRef.current = true;
    // This is deliberately state-only: no links, router calls, or iframe URL
    // changes are involved in opening the widget.
    window.parent.postMessage({ action: "open" }, "*");
    window.parent.postMessage({ type: "elpino:open" }, "*");
  }

  // Abandons the resumed conversation (if any) so the next message starts a
  // fresh thread — nothing is created here; see sendPayload for where a
  // conversation actually gets written once the visitor sends something.
  function startNewChat() {
    setConversationId("");
    setMessages([]);
    setChatView("thread");
    setTab("chat");
  }

  useEffect(() => {
    if (joinDeadline === null) return;
    setJoinNow(Date.now());
    const timer = window.setInterval(() => setJoinNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [joinDeadline]);

  useEffect(() => {
    if (isLocalMockWidget || !conversationId || !visitorToken || tab !== "chat" || chatView !== "thread") return;
    let cancelled = false;
    const epoch = sessionEpochRef.current;
    const poll = () => {
      fetch("/api/widget/messages/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, hostname, visitorToken, conversationId }) })
        .then((response) => response.json())
        .then((data: { messages?: WidgetMessage[]; agentTyping?: boolean; agent?: { name?: string } | null; joinDeadlineAt?: string | null; serverNow?: string; error?: string; ended?: boolean; contactAsk?: { fields?: ContactField[] } | null }) => {
          if (cancelled || epoch !== sessionEpochRef.current) return;
          // Left with Leave Chat (in another tab, say): drop the thread and go
          // back to the list rather than treating it as a broken session.
          if (data.ended) {
            setConversationId("");
            setMessages([]);
            openChatList();
            return;
          }
          // Not this visitor's thread (a carried-over thread from before they
          // signed out, say). A signed-in session handles this below by
          // refreshing; an anonymous one would otherwise sit on an empty
          // thread forever.
          if (data.error && !activeVisitorRef.current.startsWith("ws_")) {
            setConversationId("");
            setMessages([]);
            openChatList();
            return;
          }
          if (data.error && activeVisitorRef.current.startsWith("ws_")) {
            identityTokenRef.current = null;
            discardSession({ keepDraft: true });
            setRetryCount((count) => count + 1);
            window.parent.postMessage({ type: "elpino:identity-refresh" }, "*");
            return;
          }
          if (data.messages) {
            // Only replies that arrive while this thread is already being
            // watched count as new; opening or restoring a thread is silent.
            const watching = seenConversationRef.current === conversationId;
            const replies = watching
              ? data.messages.filter((message) => !seenMessageIdsRef.current.has(message.id) && (message.senderType === "agent" || message.senderType === "ai"))
              : [];
            if (!watching) {
              seenMessageIdsRef.current = new Set();
              seenConversationRef.current = conversationId;
            }
            for (const message of data.messages) seenMessageIdsRef.current.add(message.id);
            if (replies.length) announceReplies(replies.length, replies[replies.length - 1]);
            setMessages(data.messages);
          }
          setAgentTyping(!!data.agentTyping);
          setAgentName(data.agent?.name?.trim() || null);
          // Convert the server's deadline into this device's clock so a wrong
          // local time can't shorten or stretch the countdown.
          if (data.joinDeadlineAt && data.serverNow) {
            setJoinDeadline(Date.now() + (Date.parse(data.joinDeadlineAt) - Date.parse(data.serverNow)));
          } else {
            setJoinDeadline(null);
          }
          const fields = data.contactAsk?.fields?.filter((field): field is ContactField => field in CONTACT_PROMPTS) ?? [];
          // Keep a form already in progress; only a fresh ask starts at step 0.
          setContactFields((current) => (fields.length ? current ?? fields : current));
        })
        .catch(() => undefined);
    };
    poll();
    const interval = window.setInterval(poll, POLL_MS);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [conversationId, visitorToken, tab, chatView, key, hostname, discardSession, isLocalMockWidget]);

  // Live push for the instant a reply is approved and saved — see
  // apps/gateway/src/realtime/realtime.service.ts's /rt/widget channel. The
  // poll above still runs alongside this as the reliability fallback (socket
  // drop, gateway restart, etc.), so a message is never lost, only possibly
  // duplicated — seenMessageIdsRef dedupes either way.
  useEffect(() => {
    // The local demo deliberately has no gateway process, so never construct
    // a ws://localhost:4000 connection for its test tenant.
    if (isLocalMockWidget || !conversationId || !visitorToken || tab !== "chat" || chatView !== "thread") return;
    let closed = false;
    let socket: WebSocket | null = null;
    let reconnectDelay = 1000;
    let reconnectTimer: number | null = null;
    const epoch = sessionEpochRef.current;

    function connect() {
      if (closed) return;
      const params = new URLSearchParams({ key, hostname, visitorToken, conversationId });
      socket = new WebSocket(`${GATEWAY_WS_ORIGIN}/rt/widget?${params.toString()}`);
      socket.onopen = () => { reconnectDelay = 1000; };
      socket.onmessage = (event) => {
        if (closed || epoch !== sessionEpochRef.current) return;
        let data: { type?: string; message?: WidgetMessage };
        try {
          data = JSON.parse(event.data as string);
        } catch {
          return;
        }
        if (data.type !== "message" || !data.message || data.message.id === undefined) return;
        const message = data.message;
        if (seenMessageIdsRef.current.has(message.id)) return;
        seenMessageIdsRef.current.add(message.id);
        const isReply = message.senderType === "agent" || message.senderType === "ai";
        setMessages((prev) => (prev.some((existing) => existing.id === message.id) ? prev : [...prev, message]));
        if (isReply) {
          // The reply is the definitive end of "typing" — don't wait for the
          // next poll (up to POLL_MS later) to clear it, or the dots sit
          // there under a reply that's already on screen.
          setAgentTyping(false);
          revealWordByWord(message.id, message.body);
          announceReplies(1, message);
        }
      };
      socket.onclose = (event) => {
        if (closed || event.code >= 4000) return;
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      };
      socket.onerror = () => socket?.close();
    }
    connect();
    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [conversationId, visitorToken, tab, chatView, key, hostname, isLocalMockWidget]);

  // Report the visitor's current page once there is a conversation, and again when
  // it changes. Debounced so a burst of navigations sends one request.
  useEffect(() => {
    const page = sitePageRef.current;
    if (!page || !conversationId || !visitorToken) return;
    const timer = window.setTimeout(() => {
      fetch("/api/widget/page", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, hostname, visitorToken, conversationId, path: page.path, title: page.title }),
      }).catch(() => undefined);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [sitePageVersion, conversationId, visitorToken, key, hostname]);

  const lastTypingPingRef = useRef(0);
  function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingPingRef.current < TYPING_PING_MS) return;
    lastTypingPingRef.current = now;
    if (!conversationId || !visitorToken) return;
    fetch("/api/widget/typing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, hostname, visitorToken, conversationId }),
    }).catch(() => undefined);
  }

  // Stick-to-bottom, not force-to-bottom: a poll or a live-pushed reply
  // shouldn't yank someone back down while they're reading older messages.
  // Only follows new content when they were already at the bottom.
  const stickToBottomRef = useRef(true);
  function handleThreadScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  useEffect(() => {
    // Opening a thread (new conversation, switching back to it, or the
    // panel reopening) always starts at the bottom regardless of where a
    // previous scroll position left off.
    stickToBottomRef.current = true;
  }, [conversationId, chatView]);
  useEffect(() => {
    if (stickToBottomRef.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, tab, chatView, agentTyping, revealMap]);

  async function sendPayload(body: string, attachment: Attachment | null) {
    if (sending || !visitorToken || (!body && !attachment)) return;
    // Sending a message is the visitor's own action — it should always
    // carry the view down to it, even if they'd scrolled up to read back.
    stickToBottomRef.current = true;
    setSending(true);
    if (isLocalMockWidget) {
      const sentAt = new Date().toISOString();
      const messageId = `mock-customer-${Date.now()}`;
      const mockConversationId = conversationId || "mock-conversation";

      setConversationId(mockConversationId);
      setMessages((current) => [
        ...current,
        {
          id: messageId,
          senderType: "customer",
          senderId: "mock-visitor",
          body,
          attachmentUrl: attachment?.url ?? null,
          attachmentType: attachment?.type ?? null,
          attachmentName: attachment?.name ?? null,
          createdAt: sentAt,
        },
      ]);
      setAgentTyping(true);
      // No network acknowledgement exists in mock mode, so release the
      // composer immediately. The delayed reply only simulates AI latency.
      setSending(false);

      const timer = window.setTimeout(() => {
        setMessages((current) => [
          ...current,
          {
            id: `mock-ai-${Date.now()}`,
            senderType: "ai",
            senderId: "mock-elpinobot",
            body: "This is a mock response from Elpino AI!",
            createdAt: new Date().toISOString(),
          },
        ]);
        setAgentTyping(false);
        mockReplyTimersRef.current = mockReplyTimersRef.current.filter((id) => id !== timer);
      }, 1500);
      mockReplyTimersRef.current.push(timer);
      return;
    }
    const epoch = sessionEpochRef.current;
    try {
      const response = await fetch("/api/widget/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key,
          hostname,
          visitorToken,
          conversationId: conversationId || undefined,
          body,
          attachment: attachment ?? undefined,
          // Only meaningful the first time — postMessage() applies this at
          // conversation-creation time and ignores it otherwise.
          topic: conversationId ? undefined : pendingTopicRef.current ?? undefined,
        }),
      });
      const data = (await response.json()) as { conversationId?: string; greeting?: WidgetMessage | null; message?: WidgetMessage; error?: string };
      if (epoch !== sessionEpochRef.current) return;
      if (data.error) {
        // Not sent: give the text back rather than losing it. If the session
        // ended, restart (keeping the draft) and ask the page for a fresh token.
        if (body) setDraft(body);
        if (attachment) setPendingAttachment(attachment);
        if (activeVisitorRef.current.startsWith("ws_")) {
          identityTokenRef.current = null;
          discardSession({ keepDraft: true });
          setRetryCount((count) => count + 1);
          window.parent.postMessage({ type: "elpino:identity-refresh" }, "*");
        }
        return;
      }
      if (data.conversationId && data.conversationId !== conversationId) {
        // This message just created the conversation — sync up so polling,
        // typing pings, etc. start targeting the real id.
        setConversationId(data.conversationId);
        pendingTopicRef.current = null;
        const opening = [data.greeting, data.message].filter((item): item is WidgetMessage => !!item);
        setMessages(opening);
      } else if (data.message) {
        setMessages((current) => [...current, data.message as WidgetMessage]);
      }
    } finally {
      if (epoch === sessionEpochRef.current) setSending(false);
    }
  }

  const contactActive = Boolean(contactFields?.length) && contactDoneFor !== conversationId && Boolean(conversationId);
  const contactField = contactActive ? contactFields![contactStep] : undefined;

  useEffect(() => {
    setContactFields(null);
    setContactStep(0);
    setContactValue("");
    setContactError("");
    setContactThanks(false);
  }, [conversationId]);

  useEffect(() => {
    if (!contactThanks) return;
    const timer = window.setTimeout(() => setContactThanks(false), 5000);
    return () => window.clearTimeout(timer);
  }, [contactThanks]);

  function finishContact(saved: boolean) {
    setContactDoneFor(conversationId);
    setContactFields(null);
    setContactStep(0);
    setContactValue("");
    setContactError("");
    setContactThanks(saved);
  }

  function nextContactStep(saved: boolean) {
    const fields = contactFields ?? [];
    setContactValue("");
    setContactError("");
    if (contactStep + 1 >= fields.length) finishContact(saved);
    else setContactStep(contactStep + 1);
  }

  async function submitContactStep() {
    if (!contactField || contactSaving) return;
    const value = contactValue.trim();
    if (!value) return;
    if (contactField === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setContactError("That doesn't look like an email address."); return; }
    if (contactField === "phone") {
      const digits = value.replace(/\D/g, "").length;
      if (digits < 10 || digits > 15) { setContactError("Enter a phone number with country code."); return; }
    }
    setContactSaving(true);
    try {
      const response = await fetch("/api/widget/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, hostname, visitorToken, [contactField]: value }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok || data.error) { setContactError("Couldn't save that — try again or skip."); return; }
      nextContactStep(true);
    } catch {
      setContactError("Couldn't save that — try again or skip.");
    } finally {
      setContactSaving(false);
    }
  }

  // Skipping the email means they'd rather not share contact details at all.
  function skipContactStep() {
    if (contactField === "email") finishContact(false);
    else nextContactStep(contactStep > 0);
  }

  async function sendMessage() {
    const body = draft.trim();
    const attachment = pendingAttachment;
    if (!body && !attachment) return;
    if (sendBlockedByReply) return;
    setDraft("");
    setPendingAttachment(null);
    await sendPayload(body, attachment);
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAttachError("");
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachError("File is too large (max 4MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setPendingAttachment({ url, type: file.type.startsWith("image/") ? "image" : "file", name: file.name });
    };
    reader.onerror = () => setAttachError("Couldn't read that file.");
    reader.readAsDataURL(file);
  }

  function togglePanel(panel: "emoji" | "gif") {
    setActivePanel((current) => (current === panel ? null : panel));
    if (panel === "gif" && gifResults.length === 0) void searchGifs("");
  }

  async function searchGifs(query: string) {
    setGifLoading(true);
    try {
      const endpoint = query.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=15&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=15&rating=g`;
      const response = await fetch(endpoint);
      const data = await response.json();
      const results: GifResult[] = (data.data ?? []).map((item: any) => ({
        id: item.id,
        url: item.images?.fixed_height?.url ?? item.images?.original?.url,
        preview: item.images?.fixed_height_small?.url ?? item.images?.fixed_height?.url,
      }));
      setGifResults(results.filter((item) => item.url));
    } catch {
      setGifResults([]);
    } finally {
      setGifLoading(false);
    }
  }

  async function pickGif(gif: GifResult) {
    setActivePanel(null);
    await sendPayload("", { url: gif.url, type: "gif" });
  }

  function insertEmoji(emoji: string) {
    setDraft((current) => current + emoji);
  }

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { setMicSupported(false); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    const baseDraft = draft ? `${draft} ` : "";
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i += 1) transcript += event.results[i][0].transcript;
      setDraft(baseDraft + transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  const initial = useMemo(() => (botName.trim() || "R").charAt(0).toUpperCase(), [botName]);
  // The opening line is assumed to be the salutation ("Hi there 👋") —
  // swapped for the identified visitor's first name, rest of the workspace's
  // own greeting copy left untouched.
  const displayGreetingLines = useMemo(
    () => (greetingName ? [`Hi ${greetingName} 👋`, ...greetingLines.slice(1)] : greetingLines),
    [greetingLines, greetingName],
  );
  // Consecutive messages from the same sender are one item in the thread
  // list, not one each — otherwise every bubble, even ones seconds apart
  // from the same reply, gets the full inter-group gap meant to separate
  // one sender/exchange from the next.
  const messageGroups = useMemo(() => {
    const groups: MessageGroup[] = [];
    for (const message of messages) {
      if (message.senderType === "system") {
        groups.push({ kind: "system", message });
        continue;
      }
      const last = groups[groups.length - 1];
      const lastMessage = last?.kind === "thread" ? last.messages[last.messages.length - 1] : null;
      if (last?.kind === "thread" && lastMessage?.senderType === message.senderType && lastMessage?.senderId === message.senderId) {
        last.messages.push(message);
      } else {
        groups.push({ kind: "thread", fromVisitor: message.senderType === "customer", messages: [message] });
      }
    }
    return groups;
  }, [messages]);
  // A small real team still reads as "just us" — pad the apparent headcount
  // to a random total strictly between 5 and 12 (i.e. 6-11), stable for the
  // life of this mount so it doesn't visibly change while someone's looking
  // at it. Real teams already at or above that size just show their true
  // count instead of a padded one.
  const paddedTeamTotal = useMemo(() => Math.floor(Math.random() * 6) + 6, []);

  if (!isOpen) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-transparent p-2">
        <button
          type="button"
          onClick={openWidget}
          aria-label="Open chat"
          className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-200"
          style={{ backgroundColor: ACCENT }}
        >
          <img
            src="/icon0.svg"
            alt=""
            aria-hidden="true"
            className="h-8 w-8 object-contain"
          />
        </button>
      </div>
    );
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-[12px]" style={{ backgroundColor: BG, color: MUTED }}>Loading…</div>;
  }
  if (denied) {
    return <div className="flex h-full items-center justify-center px-6 text-center text-[12px]" style={{ backgroundColor: BG, color: MUTED }}>This chat isn&apos;t available on this site.</div>;
  }
  if (loadFailed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center" style={{ backgroundColor: BG }}>
        <p className="text-[12px]" style={{ color: MUTED }}>Couldn&apos;t load chat. Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => { setLoadFailed(false); setRetryCount((count) => count + 1); }}
          className="rounded-full px-4 py-2 text-[12px] font-semibold text-white"
          style={{ backgroundColor: ACCENT }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (replyPreview && !panelOpenRef.current) {
    return (
      <div className="h-full bg-transparent p-1">
        <div
          className="group relative flex h-full cursor-pointer items-start gap-3 overflow-hidden rounded-[16px] border bg-white px-4 py-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          style={{ borderColor: BORDER, color: INK }}
          role="button"
          tabIndex={0}
          aria-label="Open new support reply"
          onClick={() => window.parent.postMessage({ type: "elpino:open" }, "*")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") window.parent.postMessage({ type: "elpino:open" }, "*");
          }}
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: ACCENT }}>
            {botAvatarUrl ? <img src={botAvatarUrl} alt="" className="h-full w-full object-cover" /> : initial}
          </span>
          <div className="min-w-0 flex-1 pr-7">
            <p className="text-[12px] font-semibold leading-5">{botName}</p>
            <p className="line-clamp-3 text-[13px] leading-[18px]" style={{ color: "rgba(24,24,27,.76)" }}>
              {replyPreview.body || "Sent you a new reply"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss reply preview"
            className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-black/40 transition hover:bg-black/5 hover:text-black/70"
            onClick={(event) => {
              event.stopPropagation();
              setReplyPreview(null);
              window.parent.postMessage({ type: "elpino:preview-dismiss" }, "*");
            }}
          >
            <X size={15} />
          </button>
        </div>
      </div>
    );
  }

  if (preChatNeeded) {
    const canSubmit = preChatCanSubmit() && !preChatSubmitting;
    return (
      <div className="flex h-full flex-col" style={{ backgroundColor: BG, color: INK }}>
        <div className="shrink-0 px-5 pb-6 pt-5">
          <button type="button" aria-label="Back to home" onClick={() => { setPreChatNeeded(false); setTab("chat"); setChatView("thread"); }} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5">
            <ChevronLeft size={20} />
          </button>
          <p className="mt-3 text-[17px] font-semibold leading-6">Please share a few details here so {botName} can connect you with the right person.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-t-[28px] px-5 pb-6 pt-6 shadow-[0_-1px_0_rgba(16,24,40,.04)]" style={{ backgroundColor: SURFACE, color: "#1c1c1e" }}>
          <form className="space-y-3.5" onSubmit={(event) => { event.preventDefault(); void submitPreChat(); }}>
            {preChatFields.map((field) => (
              <PreChatFieldInput
                key={field.id}
                field={field}
                value={answers[field.id] ?? ""}
                onChange={(value) => setAnswer(field.id, value)}
                formCountry={formCountry}
                setFormCountry={setFormCountry}
              />
            ))}

            <button
              type="submit"
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-full py-3 text-[13px] font-semibold text-white transition disabled:opacity-40"
              style={{ backgroundColor: ACCENT }}
            >
              {preChatSubmitting ? "Starting…" : "Start conversation"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col" style={{ backgroundColor: BG, color: INK }}>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "chat" && chatView === "home" ? (
          <div className="flex h-full flex-col">
            <div className="px-5 pb-5 pt-7">
              <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full text-[16px] font-bold text-white" style={{ backgroundColor: ACCENT }}>
                {botAvatarUrl ? <img src={botAvatarUrl} alt="" className="h-full w-full object-cover" /> : initial}
              </span>
              <h1 className="mt-4 text-[19px] font-semibold leading-6">{greetingLines[0]}</h1>
              {greetingLines.length > 1 && (
                <p className="mt-1.5 text-[13px] leading-5" style={{ color: MUTED }}>{greetingLines.slice(1).join(" ")}</p>
              )}

              {team.length > 0 && (() => {
                const avatarsShown = Math.min(team.length, 4);
                const displayTotal = Math.max(team.length, paddedTeamTotal);
                const badgeCount = displayTotal - avatarsShown;
                return (
                  <div className="mt-4 flex items-center gap-2.5">
                    <div className="flex -space-x-2.5">
                      {team.slice(0, avatarsShown).map((member) => (
                        <span key={member.id} className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white ring-2" style={{ backgroundColor: ACCENT, borderColor: BG, ["--tw-ring-color" as string]: BG }}>
                          {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" /> : (member.name?.trim().charAt(0).toUpperCase() || "?")}
                          {member.online && <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full ring-2" style={{ backgroundColor: "#3ecf6a", ["--tw-ring-color" as string]: BG }} />}
                        </span>
                      ))}
                      {badgeCount > 0 && (
                        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-2" style={{ backgroundColor: BUBBLE, color: INK, ["--tw-ring-color" as string]: BG }}>
                          +{badgeCount}
                        </span>
                      )}
                    </div>
                    <p className="text-[11.5px]" style={{ color: MUTED }}>People here to help you</p>
                  </div>
                );
              })()}
            </div>
            <div className="flex-1 space-y-2.5 overflow-y-auto p-4 pt-0">
              <button
                type="button"
                onClick={startNewChat}
                className="flex w-full items-center gap-3 rounded-xl border p-3.5 text-left shadow-sm transition hover:border-[#c7cbd1]"
                style={{ backgroundColor: SURFACE, borderColor: BORDER }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: ACCENT }}><MessageSquarePlus size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">Start a new conversation</span>
                  <span className="block text-[11px]" style={{ color: MUTED }}>We typically reply in a few minutes</span>
                </span>
              </button>

              {conversationId && (
                <button
                  type="button"
                  onClick={() => openThread(conversationId)}
                  className="flex w-full items-center gap-3 rounded-xl border p-3.5 text-left shadow-sm transition hover:border-[#c7cbd1]"
                  style={{ backgroundColor: SURFACE, borderColor: BORDER }}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: BUBBLE, color: INK }}><MessageCircle size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">Continue the conversation</span>
                    <span className="block truncate text-[11px]" style={{ color: MUTED }}>{messages[messages.length - 1]?.body || "Pick up where you left off"}</span>
                  </span>
                </button>
              )}

              <button type="button" onClick={openChatList} className="w-full py-1 text-center text-[11.5px] font-semibold" style={{ color: ACCENT }}>
                View past conversations
              </button>
            </div>
          </div>
        ) : tab === "help" ? (
          <div className="flex h-full flex-col">
            {openArticle || articleLoading ? (
              <>
                <div className="flex shrink-0 items-center gap-2 border-b px-3 py-3" style={{ borderColor: BORDER }}>
                  <button type="button" aria-label="Back to help" onClick={() => { setOpenArticle(null); setArticleLoading(false); }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/5">
                    <ChevronLeft size={19} />
                  </button>
                  <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">{openArticle?.title ?? "Help"}</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  {articleLoading || !openArticle ? (
                    <p className="text-[12px]" style={{ color: MUTED }}>Loading…</p>
                  ) : (
                    <>
                      <h2 className="text-[17px] font-semibold leading-6">{openArticle.title}</h2>
                      <div className="mt-3 whitespace-pre-line break-words text-[13.5px] leading-6" style={{ color: INK }}>{openArticle.content}</div>
                      {openArticle.sourceUrl && /^https?:\/\//i.test(openArticle.sourceUrl) && (
                        <a href={openArticle.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: ACCENT }}>
                          View original page <ExternalLink size={13} />
                        </a>
                      )}
                    </>
                  )}
                </div>
                {openArticle && !articleLoading && (
                  <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: BORDER, backgroundColor: SURFACE }}>
                    <p className="text-[12px]" style={{ color: MUTED }}>Still need help?</p>
                    <button type="button" onClick={() => askAboutArticle(openArticle)} className="mt-2 w-full rounded-full py-2.5 text-[13px] font-semibold text-white" style={{ backgroundColor: ACCENT }}>
                      Ask {botName}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="relative flex shrink-0 items-center justify-center border-b px-4 py-4" style={{ borderColor: BORDER }}>
                  <p className="text-[15px] font-semibold">Help</p>
                  <button type="button" aria-label="Close" onClick={() => requestLeave()} className="absolute right-3 flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/5">
                    <X size={16} />
                  </button>
                </div>
                <div className="shrink-0 px-4 pt-3">
                  <div className="flex items-center gap-2 rounded-full px-3.5 py-2.5" style={{ backgroundColor: BUBBLE }}>
                    <Search size={14} style={{ color: MUTED }} />
                    <input
                      value={helpQuery}
                      onChange={(event) => setHelpQuery(event.target.value)}
                      placeholder="Search for help"
                      maxLength={100}
                      className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#9aa0a6]"
                      style={{ color: INK }}
                    />
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                  {(() => {
                    const searching = helpQuery.trim().length >= 2;
                    const shown = searching ? helpResults : helpArticles;
                    if (shown === null || (searching && helpSearching)) {
                      return <p className="px-3 py-6 text-[11.5px]" style={{ color: MUTED }}>Loading…</p>;
                    }
                    if (shown.length === 0) {
                      return (
                        <div className="px-3 py-6">
                          <p className="text-[12px]" style={{ color: MUTED }}>{searching ? "No articles match that." : "No help articles yet."}</p>
                          <button type="button" onClick={() => { startNewChat(); if (searching) setDraft(helpQuery.trim()); }} className="mt-3 rounded-full px-4 py-2 text-[12.5px] font-semibold text-white" style={{ backgroundColor: ACCENT }}>
                            Ask {botName} instead
                          </button>
                        </div>
                      );
                    }
                    return shown.map((article) => (
                      <button key={article.id} type="button" onClick={() => openHelpArticle(article.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-black/[0.035]">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">{article.title}</span>
                          <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-4" style={{ color: MUTED }}>{article.snippet}</span>
                        </span>
                        <ChevronRight size={15} className="shrink-0" style={{ color: MUTED }} />
                      </button>
                    ));
                  })()}
                </div>
              </>
            )}
          </div>
        ) : chatView === "list" ? (
          <div className="flex h-full flex-col">
            <div className="relative flex items-center justify-center border-b px-4 py-4" style={{ borderColor: BORDER }}>
              <p className="text-[15px] font-semibold">Messages</p>
              <button type="button" aria-label="Close" onClick={() => requestLeave()} className="absolute right-3 flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/5">
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {recentLoading ? (
                <p className="px-4 py-6 text-[11.5px]" style={{ color: MUTED }}>Loading…</p>
              ) : recent.length === 0 ? (
                <div className="flex flex-col items-center px-4 py-10 text-center">
                  <p className="text-[13px] font-semibold" style={{ color: INK }}>No messages</p>
                  <p className="mt-1 text-[11.5px]" style={{ color: MUTED }}>Messages from the team will be shown here</p>
                </div>
              ) : (
                recent.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => openThread(conversation.id)}
                    className="flex w-full items-start gap-3 border-b px-4 py-3.5 text-left transition hover:bg-black/[0.03]"
                    style={{ borderColor: BORDER }}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl text-white" style={{ backgroundColor: ACCENT }}>
                      {botAvatarUrl ? <img src={botAvatarUrl} alt="" className="h-full w-full object-cover" /> : <LayoutGrid size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold">{botName}</span>
                        <span className="shrink-0 text-[10.5px]" style={{ color: MUTED }}>{formatTime(conversation.time)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] leading-4" style={{ color: MUTED }}>{conversation.preview || "New conversation"}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="flex shrink-0 justify-center px-4 pb-4 pt-2">
              <button
                type="button"
                onClick={startNewChat}
                className="flex items-center gap-2 rounded-full border px-4 py-2.5 text-[12.5px] font-semibold shadow-sm transition hover:opacity-90"
                style={{ backgroundColor: INK, borderColor: INK, color: SURFACE }}
              >
                Ask a question
                <span className="flex h-4 w-4 items-center justify-center rounded-full" style={{ backgroundColor: SURFACE, color: INK }}><CircleHelp size={11} /></span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="relative flex h-[82px] shrink-0 items-start justify-between px-3 pt-3" style={{ backgroundColor: BG }}>
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Back to chats" onClick={() => requestLeave("list")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.07] transition hover:bg-black/[0.12]"><ChevronLeft size={19} /></button>
                <div className="relative flex max-w-[220px] flex-col items-start gap-0.5 rounded-[28px] py-2.5">
                  <h2 className="min-w-0 truncate text-[14px] font-bold leading-5" style={{ color: INK }}>{agentName ?? botName}</h2>
                  <p className="min-w-0 text-[11.5px] leading-4" style={{ color: MUTED }}>{agentName ? "Support team" : "AI Assistant"}</p>
                </div>
              </div>
              <div className="ml-auto flex gap-2">
                <Popover>
                  <PopoverTrigger aria-label="More options" className="flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.07] transition hover:bg-black/[0.12]">
                    <MoreHorizontal size={20} />
                  </PopoverTrigger>
                  <PopoverContent align="end" sideOffset={6} className="w-52 p-1.5">
                    <button type="button" onClick={toggleSound} className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium hover:bg-black/[0.045]">
                      {soundOn ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      {soundOn ? "Mute notifications" : "Unmute notifications"}
                    </button>
                    <button type="button" onClick={toggleMaximize} className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium hover:bg-black/[0.045]">
                      {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                      {isMaximized ? "Restore size" : "Maximize"}
                    </button>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div ref={scrollRef} onScroll={handleThreadScroll} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-5 pt-4">
              {messages.length === 0 && !conversationId && (
                // Nothing is saved yet — this greeting is purely client-side
                // until the visitor's first reply actually creates the
                // conversation (see sendPayload), so a look-and-leave visit
                // never touches the database.
                // A single group, one child of the space-y-5 thread — the
                // 20px gap there is for spacing between message groups, not
                // between these lines of the same greeting. Grouped tight
                // together here the way consecutive same-sender messages
                // are further down.
                <div className="space-y-1">
                  {displayGreetingLines.map((line, index) => (
                    <div key={index} className="flex items-start gap-2">
                      {index === 0 && (
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: botAvatarUrl ? undefined : ACCENT }}>
                          {botAvatarUrl ? <img src={botAvatarUrl} alt="" className="h-full w-full object-cover" /> : initial}
                        </span>
                      )}
                      <div className={`w-fit max-w-[90%] text-[14px] leading-6 ${index > 0 ? "ml-8" : ""}`} style={{ color: INK }}>
                        {line}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {messages.length === 0 && conversationId && (
                <div className="flex min-h-[120px] items-center justify-center text-[11.5px]" style={{ color: MUTED }}>Loading conversation…</div>
              )}
              {messageGroups.map((group) => {
                // A teammate joining or leaving the chat. Centered and quiet:
                // it is a thing that happened to the conversation, not a
                // message from anyone, so it must not read as one.
                if (group.kind === "system") {
                  const message = group.message;
                  return (
                    <div key={message.id} className="flex items-center gap-2 py-0.5">
                      <span className="h-px flex-1" style={{ backgroundColor: BORDER }} />
                      <span className="whitespace-nowrap text-[11px]" style={{ color: MUTED }}>{message.body}</span>
                      <span className="h-px flex-1" style={{ backgroundColor: BORDER }} />
                    </div>
                  );
                }

                // One run of consecutive messages from the same sender is a
                // single item in the thread's own space-y-5 list, so that
                // 20px gap only ever falls *between* runs — a sender switch,
                // a visitor reply, a pause long enough to be a new group.
                // Bubbles within the run share a tight gap-1 instead.
                const { fromVisitor, messages: groupMessages } = group;
                const first = groupMessages[0];

                return (
                  <div key={first.id} className="flex flex-col gap-1">
                    {groupMessages.map((message, messageIndex) => {
                      const hasImage = message.attachmentUrl && (message.attachmentType === "image" || message.attachmentType === "gif");
                      const hasFile = message.attachmentUrl && message.attachmentType === "file";
                      const displayBody = revealMap[message.id] ?? message.body;

                      const bubble = (
                        <div className="w-fit max-w-[85%] space-y-1">
                          {hasImage && (
                            <img src={message.attachmentUrl!} alt={message.attachmentName ?? ""} className="max-h-52 w-auto rounded-2xl object-cover" />
                          )}
                          {hasFile && (
                            <a
                              href={message.attachmentUrl!}
                              download={message.attachmentName ?? "file"}
                              className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-[12.5px] font-medium"
                              style={fromVisitor ? { backgroundColor: ACCENT, color: "#fff" } : { backgroundColor: BUBBLE, color: INK }}
                            >
                              <FileIcon size={15} className="shrink-0" />
                              <span className="min-w-0 truncate">{message.attachmentName ?? "Attachment"}</span>
                            </a>
                          )}
                          {message.body && (
                            fromVisitor ? (
                              <div className="rounded-2xl px-3.5 py-2.5 text-[13px] leading-5" style={{ backgroundColor: ACCENT, color: "#fff" }}>
                                <MessageMarkdown text={displayBody} />
                              </div>
                            ) : (
                              <div className="px-0.5 text-[13.5px] leading-6" style={{ color: INK }}>
                                <MessageMarkdown text={displayBody} />
                              </div>
                            )
                          )}
                        </div>
                      );

                      if (fromVisitor) {
                        return <div key={message.id} className="flex justify-end">{bubble}</div>;
                      }
                      return (
                        <div key={message.id} className="flex items-start gap-2">
                          {messageIndex === 0 ? (
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: botAvatarUrl ? undefined : ACCENT }}>
                              {botAvatarUrl ? <img src={botAvatarUrl} alt="" className="h-full w-full object-cover" /> : initial}
                            </span>
                          ) : (
                            // Same sender as the message above — the avatar
                            // already introduced them, so later lines in the
                            // run just line up under the first bubble instead
                            // of repeating it.
                            <span className="w-6 shrink-0" />
                          )}
                          {bubble}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {joinDeadline !== null && (() => {
                const remaining = Math.max(0, Math.ceil((joinDeadline - joinNow) / 1000));
                return (
                  <div className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5" style={{ borderColor: BORDER, backgroundColor: SURFACE }}>
                    <span className="flex h-7 min-w-[46px] items-center justify-center rounded-full px-2 text-[12px] font-semibold tabular-nums text-white" style={{ backgroundColor: ACCENT }}>
                      {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
                    </span>
                    <p className="text-[11.5px] leading-4" style={{ color: MUTED }}>
                      {remaining > 0 ? "We've notified the team. Someone should join any moment." : "Still checking with the team…"}
                    </p>
                  </div>
                );
              })()}
              {agentTyping && (
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: botAvatarUrl ? undefined : ACCENT }}>
                    {botAvatarUrl ? <img src={botAvatarUrl} alt="" className="h-full w-full object-cover" /> : initial}
                  </span>
                  <div className="flex items-center rounded-2xl px-3.5 py-3" style={{ backgroundColor: BUBBLE, width: "fit-content" }}>
                    <TypingDots color="rgba(24,24,27,.45)" />
                  </div>
                </div>
              )}
            </div>
            <div className="relative px-5 pb-3 pt-2">
              {activePanel === "emoji" && (
                <div className="absolute bottom-full left-3 right-3 mb-2 rounded-2xl border p-2.5 shadow-xl" style={{ borderColor: BORDER, backgroundColor: SURFACE }}>
                  <div className="mb-1 flex items-center justify-between px-0.5">
                    <p className="text-[10.5px] font-semibold" style={{ color: MUTED }}>Emoji</p>
                    <button type="button" onClick={() => setActivePanel(null)} className="rounded-full p-1 hover:bg-black/5"><X size={13} /></button>
                  </div>
                  <div className="grid grid-cols-8 gap-0.5">
                    {EMOJI.map((emoji) => (
                      <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="rounded-lg p-1.5 text-[17px] leading-none hover:bg-black/5">
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {activePanel === "gif" && (
                <div className="absolute bottom-full left-3 right-3 mb-2 flex max-h-72 flex-col rounded-2xl border p-2.5 shadow-xl" style={{ borderColor: BORDER, backgroundColor: SURFACE }}>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex flex-1 items-center gap-1.5 rounded-full px-3 py-1.5" style={{ backgroundColor: BUBBLE }}>
                      <Search size={12} style={{ color: MUTED }} />
                      <input
                        value={gifQuery}
                        onChange={(event) => setGifQuery(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") void searchGifs(gifQuery); }}
                        placeholder="Search GIFs…"
                        className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#9aa0a6]"
                        style={{ color: INK }}
                      />
                    </div>
                    <button type="button" onClick={() => setActivePanel(null)} className="rounded-full p-1 hover:bg-black/5"><X size={13} /></button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {gifLoading ? (
                      <p className="py-6 text-center text-[11.5px]" style={{ color: MUTED }}>Loading…</p>
                    ) : gifResults.length === 0 ? (
                      <p className="py-6 text-center text-[11.5px]" style={{ color: MUTED }}>No GIFs found.</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-1.5">
                        {gifResults.map((gif) => (
                          <button key={gif.id} type="button" onClick={() => void pickGif(gif)} className="overflow-hidden rounded-lg">
                            <img src={gif.preview} alt="" className="h-16 w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {pendingAttachment && (
                <div className="mb-2 flex items-center gap-2 rounded-xl border px-2.5 py-2" style={{ borderColor: BORDER, backgroundColor: SURFACE }}>
                  {pendingAttachment.type === "image" ? (
                    <img src={pendingAttachment.url} alt="" className="h-9 w-9 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: BUBBLE, color: INK }}><FileIcon size={15} /></span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: MUTED }}>{pendingAttachment.name ?? "Attachment"}</span>
                  <button type="button" onClick={() => setPendingAttachment(null)} className="rounded-full p-1 hover:bg-black/5"><X size={13} /></button>
                </div>
              )}
              {attachError && <p className="mb-2 px-1 text-[11px] text-[#e5626a]">{attachError}</p>}
              {contactThanks && !contactActive && (
                <p className="mb-2 px-1 text-[11.5px]" style={{ color: MUTED }}>Thanks — we&apos;ll reach you there if we get disconnected.</p>
              )}

              {contactActive && contactField ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between px-2">
                    <p className="text-[11.5px] font-semibold" style={{ color: INK }}>
                      {CONTACT_PROMPTS[contactField].label}
                      {contactFields!.length > 1 && <span className="font-normal" style={{ color: MUTED }}>{` · ${contactStep + 1} of ${contactFields!.length}`}</span>}
                    </p>
                    <button type="button" onClick={skipContactStep} className="text-[11.5px] font-medium hover:underline" style={{ color: MUTED }}>
                      {contactField === "email" ? "Skip" : "Skip this"}
                    </button>
                  </div>
                  <div className="flex h-[54px] items-center rounded-[28px] border px-1.5 shadow-[0_3px_12px_rgba(15,23,42,.10)]" style={{ borderColor: contactError ? "#e5626a" : BORDER, backgroundColor: SURFACE }}>
                    <input
                      key={contactField}
                      autoFocus
                      type={CONTACT_PROMPTS[contactField].type}
                      value={contactValue}
                      onChange={(event) => { setContactValue(event.target.value); setContactError(""); }}
                      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submitContactStep(); } }}
                      placeholder={CONTACT_PROMPTS[contactField].placeholder}
                      autoComplete={contactField === "email" ? "email" : contactField === "phone" ? "tel" : "name"}
                      className="h-[42px] min-w-0 flex-1 bg-transparent px-3 text-[14px] outline-none placeholder:text-[#777b82]"
                      style={{ color: INK }}
                    />
                    <button
                      type="button"
                      onClick={() => void submitContactStep()}
                      disabled={!contactValue.trim() || contactSaving}
                      aria-label="Save"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-100"
                      style={{ backgroundColor: contactValue.trim() ? ACCENT : "#eceef0", color: contactValue.trim() ? "#fff" : "#b5b8bd" }}
                    >
                      <ArrowUp size={21} strokeWidth={2.2} />
                    </button>
                  </div>
                  {contactError && <p className="mt-1.5 px-2 text-[11px] text-[#e5626a]">{contactError}</p>}
                </div>
              ) : (
              <div className="flex h-[54px] items-center rounded-[28px] border px-1.5 shadow-[0_3px_12px_rgba(15,23,42,.10)]" style={{ borderColor: BORDER, backgroundColor: SURFACE }}>
                <input ref={fileInputRef} type="file" hidden onChange={handleFileSelect} />
                <button type="button" aria-label="Attach file" onClick={() => fileInputRef.current?.click()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/[0.055] transition hover:bg-black/10" style={{ color: INK }}>
                  <Plus size={24} strokeWidth={1.8} />
                </button>
                <textarea
                  value={draft}
                  onChange={(event) => { setDraft(event.target.value); notifyTyping(); }}
                  onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }}
                  placeholder={sendBlockedByReply ? `${botName.trim() || "Elpino"} is replying…` : "Write a message…"}
                  rows={1}
                  className="h-[42px] min-w-0 flex-1 resize-none bg-transparent px-3 py-[11px] text-[14px] leading-5 outline-none placeholder:text-[#777b82]"
                  style={{ color: INK }}
                />
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" aria-label="Emoji" onClick={() => togglePanel("emoji")} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5" style={{ color: activePanel === "emoji" ? ACCENT : INK }}>
                    <Smile size={22} strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={(!draft.trim() && !pendingAttachment) || sending || sendBlockedByReply}
                    aria-label="Send"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-100"
                    style={{ backgroundColor: (draft.trim() || pendingAttachment) && !sendBlockedByReply ? ACCENT : "#eceef0", color: (draft.trim() || pendingAttachment) && !sendBlockedByReply ? "#fff" : "#b5b8bd" }}
                  >
                    <ArrowUp size={21} strokeWidth={2.2} />
                  </button>
                </div>
              </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showBranding && (
        <a href="https://elpino.chat" target="_blank" rel="noreferrer" className="block shrink-0 py-2 text-center text-[10px] font-medium transition hover:text-[#18181b]" style={{ color: MUTED, backgroundColor: BG }}>
          Powered by Elpino
        </a>
      )}
      {leaveOpen && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-8 text-center" style={{ backgroundColor: SURFACE, color: INK }}>
          <p className="text-[19px] font-bold leading-6">Did we help you?</p>
          <p className="mt-1.5 text-[13px] leading-5" style={{ color: MUTED }}>Your feedback matters</p>
          <div className="mt-6 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => setRatingChoice(1)}
              aria-label="Good"
              aria-pressed={ratingChoice === 1}
              className="flex h-14 w-14 items-center justify-center rounded-full transition"
              style={{ backgroundColor: ratingChoice === 1 ? ACCENT : BUBBLE }}
            >
              <ThumbsUp size={22} color={ratingChoice === 1 ? "#fff" : INK} />
            </button>
            <button
              type="button"
              onClick={() => setRatingChoice(-1)}
              aria-label="Not good"
              aria-pressed={ratingChoice === -1}
              className="flex h-14 w-14 items-center justify-center rounded-full transition"
              style={{ backgroundColor: ratingChoice === -1 ? ACCENT : BUBBLE }}
            >
              <ThumbsDown size={22} color={ratingChoice === -1 ? "#fff" : INK} />
            </button>
          </div>
          <div className="mt-8 flex w-full items-center gap-3">
            <button type="button" onClick={goBack} className="flex-1 text-[14px] font-bold" style={{ color: ACCENT }}>
              Go Back
            </button>
            <button
              type="button"
              disabled={leaving}
              onClick={() => void leaveChat()}
              className="flex-[1.4] rounded-full py-3 text-[14px] font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: ACCENT }}
            >
              {leaving ? "Leaving…" : "Leave Chat"}
            </button>
          </div>
          <p className="mt-4 text-[11.5px] leading-4" style={{ color: MUTED }}>
            Leaving the chat will end this session. If you need to chat with us again, we&apos;ll have a record of your chat history.
          </p>
        </div>
      )}
    </div>
  );
}

function PreChatFieldInput({
  field,
  value,
  onChange,
  formCountry,
  setFormCountry,
}: {
  field: PreChatField;
  value: string;
  onChange: (value: string) => void;
  formCountry: number;
  setFormCountry: (index: number) => void;
}) {
  if (field.type === "phone") {
    return (
      <label className="block">
        <span className="mb-1 block px-1 text-[11.5px] font-semibold text-[#4a4f57]">{field.label}</span>
        <div className="flex items-stretch overflow-hidden rounded-full border border-[#e1e3e6] focus-within:border-[#18181b]">
          <div className="relative shrink-0 border-r border-[#e1e3e6]">
            <select
              value={formCountry}
              onChange={(event) => setFormCountry(Number(event.target.value))}
              className="h-full appearance-none bg-transparent py-3 pl-4 pr-7 text-[13px] text-[#1c1c1e] outline-none"
            >
              {COUNTRIES.map((country, index) => (
                <option key={country.name} value={index}>
                  {country.flag} {country.code}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#9aa0a6]" />
          </div>
          <input
            type="tel"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder || "555 000 0000"}
            required={field.required}
            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[13px] text-[#1c1c1e] outline-none placeholder:text-[#9aa0a6]"
          />
        </div>
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label className="block">
        <span className="mb-1 block px-1 text-[11.5px] font-semibold text-[#4a4f57]">{field.label}</span>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          rows={3}
          className="w-full resize-none rounded-2xl border border-[#e1e3e6] px-4 py-3 text-[13px] text-[#1c1c1e] outline-none placeholder:text-[#9aa0a6] focus:border-[#18181b]"
        />
      </label>
    );
  }

  if (field.type === "select") {
    const options = field.options ?? [];
    return (
      <label className="block">
        <span className="mb-1 block px-1 text-[11.5px] font-semibold text-[#4a4f57]">{field.label}</span>
        <div className="relative">
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            required={field.required}
            className="w-full appearance-none rounded-full border border-[#e1e3e6] bg-transparent px-4 py-3 pr-9 text-[13px] text-[#1c1c1e] outline-none focus:border-[#18181b]"
          >
            <option value="" disabled>{field.placeholder || "Choose an option"}</option>
            {options.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9aa0a6]" />
        </div>
      </label>
    );
  }

  if (field.type === "radio") {
    const options = field.options ?? [];
    return (
      <div>
        <p className="mb-2 text-[13px] font-bold">{field.label}</p>
        <div className="space-y-0.5">
          {options.map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-2 hover:bg-[#f7f8f9]">
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                style={{ borderColor: value === option ? ACCENT : "#c7cbd1" }}
              >
                {value === option && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ACCENT }} />}
              </span>
              <input type="radio" name={field.id} value={option} checked={value === option} onChange={() => onChange(option)} className="sr-only" />
              <span className="text-[13px]">{option}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "checkbox" && field.multiple) {
    const options = field.options ?? [];
    const selected = value ? value.split(",") : [];
    const toggleOption = (option: string) => {
      const next = selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option];
      onChange(next.join(","));
    };
    return (
      <div>
        <p className="mb-2 text-[13px] font-bold">{field.label}</p>
        <div className="space-y-0.5">
          {options.map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-2 hover:bg-[#f7f8f9]">
              <input type="checkbox" checked={selected.includes(option)} onChange={() => toggleOption(option)} className="h-4 w-4 shrink-0 rounded border-[#c7cbd1]" />
              <span className="text-[13px]">{option}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1">
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(event) => onChange(event.target.checked ? "true" : "")}
          required={field.required}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#c7cbd1]"
        />
        <span className="text-[13px] text-[#1c1c1e]">{field.label}</span>
      </label>
    );
  }

  return (
    <label className="block">
      <span className="mb-1 block px-1 text-[11.5px] font-semibold text-[#4a4f57]">{field.label}</span>
      <input
        type={field.type === "email" ? "email" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        required={field.required}
        className="w-full rounded-full border border-[#e1e3e6] px-4 py-3 text-[13px] text-[#1c1c1e] outline-none placeholder:text-[#9aa0a6] focus:border-[#18181b]"
      />
    </label>
  );
}

export default function WidgetPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-[12px]" style={{ backgroundColor: BG, color: MUTED }}>Loading…</div>}>
      <WidgetContent />
    </Suspense>
  );
}
