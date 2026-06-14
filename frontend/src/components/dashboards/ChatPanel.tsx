import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "../../types";
import { DashHeader } from "../Sidebar";

/* ═══════════════════════════════════════════════════════════════════
   CHAT PANEL — Ask AI about the current situation.
   
   Formats K2 responses into structured intelligence cards:
   - Strips <think> tags (reasoning chain)
   - Renders markdown-like formatting (bold, lists, headers)
   - Highlights unit IDs and district names
   ═══════════════════════════════════════════════════════════════════ */

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  pending?: boolean;
}

/* ── Clean raw K2 output ── */
function cleanResponse(raw: string): string {
  // Remove think blocks (may arrive as inline tags)
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Remove any orphaned think tags
  text = text.replace(/<\/?think>/gi, "");
  // Remove code fences wrapping the entire response
  text = text.replace(/^```(?:json|text|markdown)?\s*\n?/gm, "").replace(/\n?```\s*$/gm, "");
  // Remove leading/trailing whitespace
  text = text.trim();
  return text;
}

/* ── Render formatted response as React nodes ── */
function FormattedResponse({ text }: { text: string }) {
  const clean = cleanResponse(text);
  const lines = clean.split("\n");

  const elements: JSX.Element[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      elements.push(
        <ol key={`ol-${elements.length}`} className="chat-action-list">
          {listBuffer.map((item, i) => (
            <li key={i}>{highlightRefs(item)}</li>
          ))}
        </ol>
      );
      listBuffer = [];
    }
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Headers (## or **WORD:**)
    if (trimmed.startsWith("##") || trimmed.startsWith("# ")) {
      flushList();
      const headerText = trimmed.replace(/^#+\s*/, "");
      elements.push(
        <div key={`h-${i}`} className="chat-section-header">{headerText}</div>
      );
      return;
    }

    // Bold section headers like **ASSESSMENT:** or **ACTION ITEMS:**
    const boldHeaderMatch = trimmed.match(/^\*\*([A-Z][A-Z\s]+):?\*\*\s*(.*)$/);
    if (boldHeaderMatch) {
      flushList();
      elements.push(
        <div key={`bh-${i}`} className="chat-section-header">
          {boldHeaderMatch[1]}
        </div>
      );
      if (boldHeaderMatch[2]) {
        elements.push(
          <p key={`bhp-${i}`} className="chat-paragraph">{highlightRefs(boldHeaderMatch[2])}</p>
        );
      }
      return;
    }

    // Numbered list items (1. ... or - ...)
    const listMatch = trimmed.match(/^(?:\d+[\.\)]\s*|-\s+)(.*)/);
    if (listMatch) {
      listBuffer.push(listMatch[1]);
      return;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} className="chat-paragraph">{highlightRefs(trimmed)}</p>
    );
  });

  flushList();

  return <div className="chat-formatted">{elements}</div>;
}

/* ── Highlight unit IDs and district names ── */
function highlightRefs(text: string): (string | JSX.Element)[] {
  // Bold markers
  text = text.replace(/\*\*/g, "⌘BOLD⌘");

  // Match unit IDs (rt_1, bus_3, amb_2, boat_4) and district names in backticks
  const unitPattern = /\b(rt_\d+|bus_\d+|amb_\d+|boat_\d+)\b/g;
  const backtickPattern = /`([^`]+)`/g;
  const boldPattern = /⌘BOLD⌘([^⌘]+)⌘BOLD⌘/g;

  // First pass: replace backtick refs
  let processed = text.replace(backtickPattern, "⌘REF:$1⌘");
  // Second: replace unit IDs
  processed = processed.replace(unitPattern, "⌘UNIT:$1⌘");
  // Third: handle bold
  processed = processed.replace(boldPattern, "⌘STRONG:$1⌘");

  // Split and render
  const parts = processed.split(/(⌘(?:REF|UNIT|STRONG):[^⌘]+⌘)/);
  return parts.map((part, i) => {
    const refMatch = part.match(/⌘REF:(.+)⌘/);
    if (refMatch) return <span key={i} className="chat-ref">{refMatch[1]}</span>;

    const unitMatch = part.match(/⌘UNIT:(.+)⌘/);
    if (unitMatch) return <span key={i} className="chat-unit">{unitMatch[1]}</span>;

    const strongMatch = part.match(/⌘STRONG:(.+)⌘/);
    if (strongMatch) return <strong key={i} className="chat-strong">{strongMatch[1]}</strong>;

    return part.replace(/⌘BOLD⌘/g, "");
  });
}

/** Collapsible live deliberation above each answer: the same trust
 *  mechanism as the commander loop, applied to Q&A. Auto-expanded while
 *  the model is still thinking; folds to one line once the answer lands. */
// Drop system-prompt / output-format plumbing from the visible thinking trace.
const CHAT_META = /(output (a |the )?json|json block|fenced block|triple backtick|"(situation_read|directives|watching|confidence)"|assessment \(|action items|^answer:|the format (says|requires)|ready to broadcast|public messaging|then the reply|we need to (defend|parse|produce)|the user (asks|is giving)|under \d+ words)/i;
function cleanThinking(text: string): string {
  return text
    .replace(/<\/?think>/gi, "")
    .split("\n")
    .filter((l) => l.trim() && !CHAT_META.test(l))
    .join("\n")
    .trimStart();
}

function ThinkingBlock({ text, live }: { text: string; live: boolean }) {
  // Collapsed by default — the answer is the focus, the reasoning is on demand.
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const clean = cleanThinking(text);
  useEffect(() => {
    if (open && live && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [clean, live, open]);
  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-[var(--brand-line)] bg-[var(--brand-soft)]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <span className={`h-[5px] w-[5px] rounded-full bg-[var(--brand)] ${live ? "animate-pulse" : ""}`} />
        <span className="label-caps" style={{ fontSize: 8, color: "var(--brand)" }}>
          {live ? "K2 is reasoning…" : "How K2 reasoned"}
        </span>
        <span className="ml-auto text-[9px] text-[var(--ink-dim)]">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <div ref={scrollRef} className="scroll-thin max-h-[150px] overflow-y-auto px-4 pb-3">
          <div className="mono whitespace-pre-wrap text-[10px] leading-loose text-[var(--ink-dim)]">
            {clean}
            {live && <span className="caret" />}
          </div>
        </div>
      )}
    </div>
  );
}

export const ChatPanel = memo(function ChatPanel({
  send,
  snapshot,
}: {
  send: (msg: Record<string, unknown>) => void;
  snapshot: Snapshot | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  // Listen for chat_response messages from WS
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const msg = e.detail;
      if (msg.type === "chat_token" || msg.type === "chat_reasoning") {
        const field = msg.type === "chat_token" ? "text" : "thinking";
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.pending) {
            return [...prev.slice(0, -1), { ...last, [field]: (last[field as "text"] ?? "") + msg.text }];
          }
          return [...prev, { role: "assistant", text: "", [field]: msg.text, pending: true } as ChatMessage];
        });
      } else if (msg.type === "chat_done") {
        setStreaming(false);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last?.pending) return prev;
          // Degraded path: no ANSWER marker arrived — promote thinking to answer.
          const promoted =
            !last.text.trim() && last.thinking?.trim()
              ? { ...last, text: last.thinking, thinking: undefined, pending: false }
              : { ...last, pending: false };
          return [...prev.slice(0, -1), promoted];
        });
      }
    };
    window.addEventListener("yaqzan_ws" as any, handler as EventListener);
    return () => window.removeEventListener("yaqzan_ws" as any, handler as EventListener);
  }, []);

  const handleSend = () => {
    const q = input.trim();
    if (!q || streaming) return;
    setInput("");
    setStreaming(true);
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    send({ cmd: "chat_query", question: q });
  };

  const suggestions = [
    "Draft the public flood alert in Malayalam and English, ready to broadcast",
    "Generate an official SITREP for the District Collector, Alappuzha",
    "Why did you deprioritize the eastern polders? Defend the tradeoff.",
    "What single decision would save the most lives right now?",
    "Should we prioritize Vandanam Medical College or Chengannur patients?",
    "Which relief camps still have capacity?",
  ];

  return (
    <div className="flex h-full flex-col">
      <DashHeader title="ASK COMMANDER AI" subtitle="Situational Q&A powered by K2"
        right={
          <div className="flex items-center gap-1.5">
            <span className="flex h-[6px] w-[6px] rounded-full bg-[var(--ok)] animate-pulse" />
            <span className="text-[9px] text-[var(--ink-dim)]">Live context</span>
          </div>
        }
      />
      <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="mb-2 text-[var(--brand)] opacity-70"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2"/></svg></div>
            <span className="label-caps mb-1" style={{ fontSize: 9 }}>COMMAND INTELLIGENCE</span>
            <span className="text-[11px] text-[var(--ink-dim)] leading-relaxed max-w-[280px] mb-5">
              Yaqzan has full situational awareness — real-time flood data, unit positions, hospital capacity, and road status. Ask anything.
            </span>
            <div className="space-y-1.5 w-full max-w-[320px]">
              {suggestions.map((s, i) => (
                <button key={i}
                  onClick={() => { setInput(s); }}
                  className="w-full text-left rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] px-3 py-2 text-[10px] text-[var(--ink-dim)] transition-all hover:border-[var(--brand-line)] hover:text-[var(--brand)] hover:translate-x-0.5">
                  <span className="text-[var(--brand)] mr-1.5 opacity-50">→</span>{s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`mb-4 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="flex-shrink-0 mr-2.5 mt-1">
                <div className="flex h-[24px] w-[24px] items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2"/></svg>
                </div>
              </div>
            )}
            <div className={`max-w-[88%] rounded-xl text-[12px] leading-relaxed ${
              msg.role === "user"
                ? "bg-[var(--brand-soft)] text-[var(--ink-bright)] border border-[var(--brand-line)] px-3.5 py-2.5"
                : "bg-[var(--bg-inset)] text-[var(--ink)] border border-[var(--hairline)] px-4 py-3"
            }`}>
              {msg.role === "assistant" ? (
                <div>
                  {msg.thinking && (
                    <ThinkingBlock text={msg.thinking} live={!!msg.pending && !msg.text} />
                  )}
                  <FormattedResponse text={msg.text} />
                  {msg.pending && (
                    <span className="inline-block w-1.5 h-3.5 bg-[var(--brand)] animate-pulse rounded-sm ml-0.5" />
                  )}
                </div>
              ) : (
                msg.text
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--hairline)] px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={streaming ? "Analyzing situation…" : "Ask about the situation…"}
            disabled={streaming}
            className="flex-1 rounded-xl border border-[var(--hairline)] bg-[var(--bg-inset)] px-4 py-2.5 text-[12px] text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--brand-line)]"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="flex h-[36px] w-[36px] items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)] transition-colors hover:bg-[var(--brand)] hover:text-white disabled:opacity-30"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});
