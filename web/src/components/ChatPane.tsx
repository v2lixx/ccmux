import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import type { ChatMessage, ModelId, Session } from "../lib/types";
import { BroadcastIcon, ScissorsIcon, SendIcon, StopIcon, ToolIcon } from "./icons";
import { Markdown } from "./Markdown";
import { ModelPicker } from "./ModelPicker";

const EMPTY_MESSAGES: ChatMessage[] = [];

const STATUS_TRIGGER_PREFIX = "STATUS_BRIEFING_TRIGGER";

export function ChatPane({ session }: { session: Session | null }) {
  if (!session) return <EmptyState />;
  return <ChatPaneInner session={session} />;
}

function EmptyState() {
  return (
    <main className="flex-1 flex items-center justify-center text-muted">
      <div className="text-center">
        <div className="text-2xl text-text font-light mb-2">ccmux</div>
        <div className="text-sm">Open a session from the sidebar to begin.</div>
      </div>
    </main>
  );
}

function ChatPaneInner({ session }: { session: Session }) {
  const allMessages = useStore((s) => s.messagesBySession[session.id] ?? EMPTY_MESSAGES);
  const limit = useStore((s) => s.displayLimitBySession[session.id] ?? null);
  const trimMessages = useStore((s) => s.trimMessages);
  const showAllMessages = useStore((s) => s.showAllMessages);
  // Slice for display only — full list stays in DB and store.
  const messages = useMemo(
    () => (limit != null && limit < allMessages.length ? allMessages.slice(-limit) : allMessages),
    [allMessages, limit],
  );
  const hydrationTick = useStore((s) => s.msgsHydratedTick[session.id] ?? 0);
  const send = useStore((s) => s.send);
  const broadcastMode = useStore((s) => s.broadcastMode);
  const setBroadcastMode = useStore((s) => s.setBroadcastMode);
  const broadcastSend = useStore((s) => s.broadcastSend);
  const rateLimit = useStore((s) => s.rateLimitBySession[session.id] ?? null);
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

  // preHydrate: cached messages may be rendered but no scroll restore yet.
  // ready: WS messages.list confirmed; scroll restored; sticky/auto-scroll armed.
  const [phase, setPhase] = useState<"preHydrate" | "ready">("preHydrate");

  // Restore once per session — re-subscribes (after wake/reconnect) do not
  // re-yank the user's scroll.
  const restoredFor = useRef<{ id: string; tick: number } | null>(null);

  const scrollKey = `ccmux.scroll.${session.id}`;

  const onScroll = () => {
    if (phase !== "ready") return;
    const el = scroller.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < 80;
    stickToBottom.current = atBottom;
    setShowJump(!atBottom);
  };

  // Persist scroll position per session, debounced. Only after WS confirmation
  // so we never overwrite the saved value with a partial-cache scrollTop.
  useEffect(() => {
    if (phase !== "ready") return;
    const el = scroller.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          localStorage.setItem(scrollKey, String(el.scrollTop));
        } catch {
          /* quota / private mode — ignore */
        }
      }, 200);
    };
    el.addEventListener("scroll", handler);
    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener("scroll", handler);
    };
  }, [phase, scrollKey]);

  const jumpToBottom = () => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    stickToBottom.current = true;
    setShowJump(false);
  };

  // Reset on session switch.
  useEffect(() => {
    setPhase("preHydrate");
    setShowJump(false);
    stickToBottom.current = false;
  }, [session.id]);

  // First WS hydration → apply saved scrollTop, transition to ready.
  useEffect(() => {
    if (hydrationTick === 0) return;
    if (messages.length === 0) return;
    const already = restoredFor.current;
    if (already && already.id === session.id) return;
    const el = scroller.current;
    if (!el) return;
    const saved = Number.parseInt(localStorage.getItem(scrollKey) ?? "", 10);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const cur = scroller.current;
        if (!cur) return;
        if (Number.isFinite(saved) && saved > 0) {
          cur.scrollTop = Math.min(saved, cur.scrollHeight);
          const distance = cur.scrollHeight - cur.scrollTop - cur.clientHeight;
          stickToBottom.current = distance < 80;
          setShowJump(distance >= 80);
        } else {
          cur.scrollTop = cur.scrollHeight;
          stickToBottom.current = true;
          setShowJump(false);
        }
        restoredFor.current = { id: session.id, tick: hydrationTick };
        setPhase("ready");
      }),
    );
  }, [hydrationTick, messages.length, session.id, scrollKey]);

  // Auto-scroll on new live messages — only when ready and sticky.
  useEffect(() => {
    if (phase !== "ready") return;
    if (!stickToBottom.current) return;
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, phase]);

  // When the user trims (or shows all), jump to bottom — the previous
  // scrollTop references a layout that no longer exists.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      stickToBottom.current = true;
      setShowJump(false);
    });
  }, [limit]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    if (broadcastMode) {
      broadcastSend(t);
    } else {
      send({ type: "session.send", session_id: session.id, text: t });
    }
    setText("");
  };

  const interrupt = () => send({ type: "session.interrupt", session_id: session.id });

  const changeModel = async (m: ModelId) => {
    await fetch(`/api/sessions/${session.id}/model`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: m }),
    });
  };

  return (
    <main className="flex-1 flex flex-col min-w-0">
      <header className="border-b border-line px-5 py-3 flex items-center gap-3 bg-panel/40">
        <div className="min-w-0">
          <div className="text-sm text-text truncate">{session.name}</div>
          <div className="text-[11px] text-muted font-mono truncate">{session.target_dir}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => trimMessages(session.id)}
            disabled={allMessages.length === 0 || (limit != null && limit <= 20)}
            className={[
              "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors",
              limit != null
                ? "bg-accent/15 text-accent hover:bg-accent/25"
                : "text-muted hover:bg-elev hover:text-text",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            ].join(" ")}
            title={
              limit != null
                ? `Showing last ${messages.length} of ${allMessages.length} — click to trim further`
                : "Hide older messages from the view (speeds up typing on long sessions)"
            }
          >
            <ScissorsIcon width={12} height={12} />
            <span className="font-medium tabular-nums">
              {limit != null ? `${messages.length}/${allMessages.length}` : "Trim"}
            </span>
          </button>
          <span
            className={[
              "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded",
              session.status === "running"
                ? "bg-accent/15 text-accent"
                : session.status === "error"
                ? "bg-danger/15 text-danger"
                : "bg-elev text-muted",
            ].join(" ")}
          >
            {session.status}
          </span>
        </div>
      </header>

      {limit != null && (
        <div className="bg-bg/40 border-b border-line/60 px-5 py-1.5 text-[11px] text-muted flex items-center gap-2">
          <ScissorsIcon className="text-accent/70" width={11} height={11} />
          <span>
            Showing last <span className="text-text tabular-nums">{messages.length}</span> of{" "}
            <span className="text-text tabular-nums">{allMessages.length}</span> messages.
          </span>
          <button
            onClick={() => showAllMessages(session.id)}
            className="ml-auto text-accent hover:underline"
          >
            show all
          </button>
        </div>
      )}

      {rateLimit && (
        <div className="bg-danger/12 border-b border-danger/30 px-5 py-2.5 text-[12px] text-danger flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-danger/40">
            Rate Limit
          </span>
          <span className="flex-1 leading-snug">{rateLimit}</span>
          <button
            onClick={() => useStore.getState().setRateLimit(session.id, null)}
            className="text-muted hover:text-text text-xs"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="flex-1 relative min-h-0">
        <div
          ref={scroller}
          onScroll={onScroll}
          className="absolute inset-0 overflow-y-auto scrollbar px-5 py-6 space-y-5"
        >
          {messages.length === 0 && (
            <div className="text-muted text-sm text-center mt-10">
              Send a message to begin the session.
            </div>
          )}
          {messages.map((m) => (
            <MessageRow key={m.id} m={m} />
          ))}
        </div>
        {showJump && (
          <button
            onClick={jumpToBottom}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] px-3 py-1.5 rounded-full bg-elev/95 border border-line text-text shadow-lg shadow-black/30 hover:bg-elev"
            title="Scroll to latest"
          >
            ↓ Latest
          </button>
        )}
      </div>

      <footer className="border-t border-line p-3 bg-panel/40">
        <div className="flex items-end gap-2 rounded-lg border border-line bg-bg focus-within:border-accent/60 transition-colors">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Send a message…"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            className="flex-1 bg-transparent px-3 py-2.5 text-sm placeholder:text-muted/70 focus:outline-none"
          />
          <div className="flex items-center gap-1 p-1.5">
            <button
              onClick={() => setBroadcastMode(!broadcastMode)}
              className={[
                "flex items-center gap-1 px-2 py-1 rounded-md text-[12px] transition-colors",
                broadcastMode
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:bg-elev hover:text-text",
              ].join(" ")}
              title={broadcastMode ? "Send to ALL sessions" : "Send to this session only — click to broadcast"}
            >
              <BroadcastIcon width={13} height={13} />
              <span className="font-medium">{broadcastMode ? "All" : "One"}</span>
            </button>
            <ModelPicker value={session.model} onChange={changeModel} />
            {session.status === "running" && (
              <button
                onClick={interrupt}
                className="p-2 rounded-md text-muted hover:bg-elev hover:text-danger"
                title="Interrupt"
              >
                <StopIcon />
              </button>
            )}
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="p-2 rounded-md bg-accent/90 text-white hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
              title={broadcastMode ? "Broadcast to all sessions" : "Send (Enter)"}
            >
              <SendIcon />
            </button>
          </div>
        </div>
        <div className="text-[10px] text-muted/70 mt-1.5 px-1">
          Enter to send · Shift + Enter for newline
          {broadcastMode && <span className="ml-2 text-accent">· broadcasting to all sessions</span>}
        </div>
      </footer>
    </main>
  );
}

// Memoized so typing in the composer does not re-render every Markdown block.
// Messages are immutable once persisted — same id implies same content.
const MessageRow = memo(function MessageRow({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    // Internal status-briefing triggers render as a compact pill.
    if (m.content.startsWith(STATUS_TRIGGER_PREFIX)) {
      return (
        <div className="flex justify-center">
          <span className="text-[10px] uppercase tracking-wider text-muted/70 px-2 py-0.5 rounded-full border border-line/60 bg-bg/40">
            ⏰ status check
          </span>
        </div>
      );
    }
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent/90 text-white px-4 py-2.5 whitespace-pre-wrap text-[13px] leading-relaxed">
          {m.content}
        </div>
      </div>
    );
  }
  if (m.role === "assistant") {
    return (
      <div className="max-w-[90%]">
        <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Claude</div>
        <Markdown source={m.content} />
      </div>
    );
  }
  if (m.role === "tool") {
    return <ToolBlock m={m} />;
  }
  return (
    <div className="text-xs text-muted italic">
      {m.content}
    </div>
  );
});

const ToolBlock = memo(function ToolBlock({ m }: { m: ChatMessage }) {
  const [open, setOpen] = useState(false);
  const label = useMemo(() => {
    if (m.tool_name) return m.tool_name;
    if (m.tool_result) return "tool_result";
    return "tool";
  }, [m.tool_name, m.tool_result]);

  return (
    <div className="rounded-lg border border-line bg-panel/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-elev/50"
      >
        <ToolIcon className="text-muted" />
        <span className="font-mono text-[12px] text-text">{label}</span>
        <span className="ml-auto text-[10px] text-muted">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 text-[12px] font-mono text-muted whitespace-pre-wrap break-all max-h-80 overflow-auto scrollbar">
          {m.tool_input && (
            <>
              <div className="text-[10px] uppercase tracking-wider mt-1 mb-1 text-muted/60">input</div>
              <div className="text-text/90">{m.tool_input}</div>
            </>
          )}
          {m.tool_result && (
            <>
              <div className="text-[10px] uppercase tracking-wider mt-2 mb-1 text-muted/60">result</div>
              <div>{m.tool_result}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
});
