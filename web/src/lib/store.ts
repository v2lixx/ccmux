import { create } from "zustand";
import type {
  ChatMessage,
  MailingSettings,
  Session,
  StatusBriefing,
  Vulnerability,
  WsClientEvent,
  WsServerEvent,
} from "./types";

export interface ArtifactRef {
  vulnId: string;
  fileName: string;
  filePath: string; // absolute path on server
}

type Theme = "dark" | "light";

interface State {
  theme: Theme;
  setTheme: (t: Theme) => void;

  sessions: Session[];
  activeId: string | null;
  setActive: (id: string | null) => void;

  messagesBySession: Record<string, ChatMessage[]>;
  vulnsBySession: Record<string, Vulnerability[]>;
  statusBySession: Record<string, StatusBriefing[]>;
  activityBySession: Record<string, string | null>;
  rateLimitBySession: Record<string, string | null>;
  /** Bumps on every authoritative `messages.list`. Lets ChatPane gate
   *  scroll-restore on real data instead of cached partials. */
  msgsHydratedTick: Record<string, number>;

  /** Per-session "show only last N messages". null/undefined = show all.
   *  Trims the rendered list to keep typing/scroll snappy on long sessions. */
  displayLimitBySession: Record<string, number | null>;
  trimMessages: (sid: string) => void;
  showAllMessages: (sid: string) => void;

  // global mailing settings (persisted server-side)
  mailing: MailingSettings;
  patchMailing: (patch: Partial<MailingSettings>) => Promise<void>;

  // broadcast mode — when true, "Send" goes to ALL active sessions at once
  broadcastMode: boolean;
  setBroadcastMode: (v: boolean) => void;
  broadcastSend: (text: string) => Promise<void>;

  // websocket
  wsReady: boolean;
  send: (ev: WsClientEvent) => void;
  _socket: WebSocket | null;
  connect: () => void;

  // artifact viewer (shared modal)
  artifact: ArtifactRef | null;
  openArtifact: (a: ArtifactRef) => void;
  closeArtifact: () => void;

  // helpers
  addOrReplaceSession: (s: Session) => void;
  removeSession: (id: string) => void;
  appendMessage: (m: ChatMessage) => void;
  setMessages: (sid: string, list: ChatMessage[]) => void;
  setVulns: (sid: string, list: Vulnerability[]) => void;
  upsertVuln: (v: Vulnerability) => void;
  deleteVuln: (sid: string, id: string) => void;
  setStatus: (sid: string, list: StatusBriefing[]) => void;
  appendStatus: (item: StatusBriefing) => void;
  setActivity: (sid: string, label: string | null) => void;
  setRateLimit: (sid: string, msg: string | null) => void;
}

const initialTheme = (): Theme => {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem("ccmux.theme");
  if (saved === "light" || saved === "dark") return saved;
  return "dark";
};

const initialActiveId = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("ccmux.activeId");
};

const LIMITS_KEY = "ccmux.displayLimits";
const loadDisplayLimits = (): Record<string, number | null> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LIMITS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number | null>) : {};
  } catch {
    return {};
  }
};
const saveDisplayLimits = (m: Record<string, number | null>) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LIMITS_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
};

// localStorage cache — hydrate instantly on refresh before the WS round-trip.
// Only the active session is cached, capped at MSG_CAP messages.

const CACHE_KEY = "ccmux.cache.v1";
const MSG_CAP = 500;

interface CachedState {
  sessions: Session[];
  activeId: string | null;
  messages: Record<string, ChatMessage[]>;
  vulns: Record<string, Vulnerability[]>;
  status: Record<string, StatusBriefing[]>;
  mailing: MailingSettings;
}

const defaultMailing: MailingSettings = {
  mailing_status_enabled: false,
  mailing_status_interval_min: 30,
  mailing_vulns_enabled: false,
};

function loadCache(): CachedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedState;
  } catch {
    return null;
  }
}

function saveCacheNow() {
  if (typeof window === "undefined") return;
  const st = useStore.getState();
  const a = st.activeId;
  if (!a) {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {}
    return;
  }
  const aMsgs = st.messagesBySession[a] ?? [];
  const trimmed = aMsgs.length > MSG_CAP ? aMsgs.slice(-MSG_CAP) : aMsgs;
  const snap: CachedState = {
    sessions: st.sessions,
    activeId: a,
    messages: { [a]: trimmed },
    vulns: { [a]: st.vulnsBySession[a] ?? [] },
    status: { [a]: st.statusBySession[a] ?? [] },
    mailing: st.mailing,
  };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snap));
  } catch {
    // quota exceeded → drop the messages slice and try again with metadata only
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ...snap, messages: {} }),
      );
    } catch {
      /* give up */
    }
  }
}

const cache = loadCache();

export const useStore = create<State>((set, get) => ({
  theme: initialTheme(),
  setTheme: (t) => {
    localStorage.setItem("ccmux.theme", t);
    document.documentElement.classList.toggle("light", t === "light");
    set({ theme: t });
  },

  sessions: cache?.sessions ?? [],
  activeId: cache?.activeId ?? initialActiveId(),
  setActive: (id) => {
    set({ activeId: id });
    if (id) {
      localStorage.setItem("ccmux.activeId", id);
      get().send({ type: "subscribe", session_id: id });
    } else {
      localStorage.removeItem("ccmux.activeId");
    }
  },

  messagesBySession: cache?.messages ?? {},
  vulnsBySession: cache?.vulns ?? {},
  statusBySession: cache?.status ?? {},
  activityBySession: {},
  rateLimitBySession: {},
  msgsHydratedTick: {},

  displayLimitBySession: loadDisplayLimits(),
  trimMessages: (sid) =>
    set((st) => {
      const cur = st.displayLimitBySession[sid];
      const total = st.messagesBySession[sid]?.length ?? 0;
      if (total === 0) return {};
      const baseline = cur ?? total;
      const next = Math.max(20, Math.ceil(baseline / 3));
      if (next >= baseline) return {};
      const m = { ...st.displayLimitBySession, [sid]: next };
      saveDisplayLimits(m);
      return { displayLimitBySession: m };
    }),
  showAllMessages: (sid) =>
    set((st) => {
      if (!(sid in st.displayLimitBySession)) return {};
      const m = { ...st.displayLimitBySession };
      delete m[sid];
      saveDisplayLimits(m);
      return { displayLimitBySession: m };
    }),

  mailing: cache?.mailing ?? defaultMailing,
  patchMailing: async (patch) => {
    const r = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (r.ok) {
      const next = (await r.json()) as MailingSettings;
      set({ mailing: next });
    }
  },

  broadcastMode: false,
  setBroadcastMode: (v) => set({ broadcastMode: v }),
  broadcastSend: async (text) => {
    await fetch("/api/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  },

  artifact: null,
  openArtifact: (a) => set({ artifact: a }),
  closeArtifact: () => set({ artifact: null }),

  wsReady: false,
  _socket: null,
  send: (ev) => {
    const s = get()._socket;
    if (s && s.readyState === WebSocket.OPEN) s.send(JSON.stringify(ev));
  },
  connect: () => {
    if (get()._socket) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws`;
    const ws = new WebSocket(url);
    set({ _socket: ws });
    ws.onopen = () => {
      set({ wsReady: true });
      // Resubscribe on every open (incl. reconnect after sleep/network drop).
      const active = get().activeId ?? initialActiveId();
      if (active) {
        get().send({ type: "subscribe", session_id: active });
      }
    };
    ws.onclose = () => {
      set({ wsReady: false, _socket: null });
      setTimeout(() => get().connect(), 1000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => handle(JSON.parse(e.data) as WsServerEvent);
  },

  addOrReplaceSession: (s) =>
    set((st) => {
      const idx = st.sessions.findIndex((x) => x.id === s.id);
      const next = [...st.sessions];
      if (idx === -1) next.push(s);
      else next[idx] = s;
      return { sessions: next };
    }),
  removeSession: (id) =>
    set((st) => {
      const next = st.sessions.filter((x) => x.id !== id);
      const newActive = st.activeId === id ? next[0]?.id ?? null : st.activeId;
      const { [id]: _m, ...m2 } = st.messagesBySession;
      const { [id]: _v, ...v2 } = st.vulnsBySession;
      return { sessions: next, activeId: newActive, messagesBySession: m2, vulnsBySession: v2 };
    }),
  appendMessage: (m) =>
    set((st) => {
      const list = st.messagesBySession[m.session_id] ?? [];
      if (list.some((x) => x.id === m.id)) return {};
      return { messagesBySession: { ...st.messagesBySession, [m.session_id]: [...list, m] } };
    }),
  setMessages: (sid, list) =>
    set((st) => {
      const cur = st.messagesBySession[sid];
      // Same content → keep array reference to avoid Markdown re-render churn.
      const sameContent =
        !!cur &&
        cur.length === list.length &&
        cur.every((m, i) => m.id === list[i].id);
      const next = sameContent
        ? st.messagesBySession
        : { ...st.messagesBySession, [sid]: list };
      return {
        messagesBySession: next,
        msgsHydratedTick: {
          ...st.msgsHydratedTick,
          [sid]: (st.msgsHydratedTick[sid] ?? 0) + 1,
        },
      };
    }),
  setVulns: (sid, list) =>
    set((st) => ({ vulnsBySession: { ...st.vulnsBySession, [sid]: list } })),
  upsertVuln: (v) =>
    set((st) => {
      const list = st.vulnsBySession[v.session_id] ?? [];
      const idx = list.findIndex((x) => x.id === v.id);
      const next = idx === -1 ? [...list, v] : list.map((x) => (x.id === v.id ? v : x));
      return { vulnsBySession: { ...st.vulnsBySession, [v.session_id]: next } };
    }),
  deleteVuln: (sid, id) =>
    set((st) => {
      const list = (st.vulnsBySession[sid] ?? []).filter((x) => x.id !== id);
      return { vulnsBySession: { ...st.vulnsBySession, [sid]: list } };
    }),
  setStatus: (sid, list) =>
    set((st) => ({
      statusBySession: { ...st.statusBySession, [sid]: list.slice(-5) },
    })),
  appendStatus: (item) =>
    set((st) => {
      const list = st.statusBySession[item.session_id] ?? [];
      if (list.some((x) => x.id === item.id)) return {};
      const next = [...list, item].slice(-5);
      return {
        statusBySession: {
          ...st.statusBySession,
          [item.session_id]: next,
        },
      };
    }),
  setActivity: (sid, label) =>
    set((st) => ({ activityBySession: { ...st.activityBySession, [sid]: label } })),
  setRateLimit: (sid, msg) =>
    set((st) => ({ rateLimitBySession: { ...st.rateLimitBySession, [sid]: msg } })),
}));

function handle(ev: WsServerEvent) {
  const s = useStore.getState();
  switch (ev.type) {
    case "session.list":
      useStore.setState({ sessions: ev.sessions });
      // Restored activeId may point at a since-deleted session — drop it.
      if (s.activeId && !ev.sessions.some((x) => x.id === s.activeId)) {
        s.setActive(ev.sessions[0]?.id ?? null);
      } else if (!s.activeId && ev.sessions[0]) {
        s.setActive(ev.sessions[0].id);
      }
      break;
    case "session.upsert":
      s.addOrReplaceSession(ev.session);
      if (!s.activeId) s.setActive(ev.session.id);
      break;
    case "session.delete":
      s.removeSession(ev.session_id);
      break;
    case "session.status":
      useStore.setState((st) => ({
        sessions: st.sessions.map((x) =>
          x.id === ev.session_id ? { ...x, status: ev.status } : x,
        ),
      }));
      if (ev.status !== "error") s.setRateLimit(ev.session_id, null);
      break;
    case "session.activity":
      s.setActivity(ev.session_id, ev.label);
      break;
    case "session.rate_limit":
      s.setRateLimit(ev.session_id, ev.message);
      break;
    case "messages.list":
      s.setMessages(ev.session_id, ev.messages);
      break;
    case "message.append":
      s.appendMessage(ev.message);
      break;
    case "vuln.list":
      s.setVulns(ev.session_id, ev.vulns);
      break;
    case "vuln.upsert":
      s.upsertVuln(ev.vuln);
      break;
    case "vuln.delete":
      s.deleteVuln(ev.session_id, ev.vuln_id);
      break;
    case "status.list":
      s.setStatus(ev.session_id, ev.items);
      break;
    case "status.append":
      s.appendStatus(ev.item);
      break;
    case "settings.update":
      useStore.setState({ mailing: ev.settings });
      break;
  }
}

if (typeof document !== "undefined") {
  document.documentElement.classList.toggle("light", initialTheme() === "light");
}

// Debounced cache save on any state change.
if (typeof window !== "undefined") {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  useStore.subscribe(() => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCacheNow, 400);
  });
}
