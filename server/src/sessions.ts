import { query, type Query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { nanoid } from "nanoid";
import { existsSync, statSync } from "node:fs";
import {
  deleteSession,
  getMailingSettings,
  getSession,
  insertMessage,
  insertSession,
  listSessions,
  renameSession as dbRenameSession,
  setSdkSessionId,
  setSessionModel,
  setSessionStatus,
} from "./db.js";
import { bus } from "./events.js";
import { createVulnMcpServer, VULN_TOOL_GUIDE } from "./mcp-vulns.js";
import type { ModelId, Session, SessionStatus } from "./types.js";

export const MAX_CONCURRENT = 3;

interface RuntimeSession {
  meta: Session;
  abort: AbortController;
  query?: Query;
  pushUser: (text: string) => void;
  closeInput: () => void;
  pump?: Promise<void>;
  statusTimer?: NodeJS.Timeout;
  activity: string | null;
}

const runtimes = new Map<string, RuntimeSession>();

function setStatus(id: string, status: SessionStatus, error?: string) {
  setSessionStatus(id, status);
  const r = runtimes.get(id);
  if (r) r.meta.status = status;
  bus.emitEvent({ type: "session.status", session_id: id, status, error });
}

/**
 * AsyncIterable<SDKUserMessage> backed by an in-memory queue. The HTTP/WS layer
 * pushes user messages onto the queue; the SDK consumes them as the next prompts.
 */
function makeUserStream(session_id: string): {
  stream: AsyncIterable<SDKUserMessage>;
  push: (text: string) => void;
  close: () => void;
} {
  const queue: SDKUserMessage[] = [];
  let resolveNext: ((m: IteratorResult<SDKUserMessage>) => void) | null = null;
  let closed = false;

  const push = (text: string) => {
    if (closed) return;
    const msg: SDKUserMessage = {
      type: "user",
      session_id,
      parent_tool_use_id: null,
      message: { role: "user", content: text },
    };
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r({ value: msg, done: false });
    } else {
      queue.push(msg);
    }
  };

  const close = () => {
    closed = true;
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r({ value: undefined as never, done: true });
    }
  };

  const stream: AsyncIterable<SDKUserMessage> = {
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift()!, done: false });
          }
          if (closed) return Promise.resolve({ value: undefined as never, done: true });
          return new Promise<IteratorResult<SDKUserMessage>>((res) => (resolveNext = res));
        },
        return() {
          close();
          return Promise.resolve({ value: undefined as never, done: true });
        },
      };
    },
  };

  return { stream, push, close };
}

function persistAndEmit(
  session_id: string,
  role: "user" | "assistant" | "tool" | "system",
  fields: {
    content?: string;
    tool_name?: string | null;
    tool_input?: string | null;
    tool_result?: string | null;
  },
) {
  let m;
  try {
    m = insertMessage({ id: nanoid(12), session_id, role, ...fields });
  } catch (e) {
    // FK violation: session was deleted while messages were still draining.
    if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY") return;
    throw e;
  }
  bus.emitEvent({ type: "message.append", session_id, message: m });
}

function setActivity(session_id: string, label: string | null) {
  const r = runtimes.get(session_id);
  if (!r) return;
  if (r.activity === label) return;
  r.activity = label;
  bus.emitEvent({ type: "session.activity", session_id, label });
}

function activityLabel(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const file = (i.file_path as string) || (i.path as string) || "";
  const cmd = (i.command as string) || "";
  const pat = (i.pattern as string) || (i.query as string) || "";
  const short = (s: string, n = 50) => (s.length > n ? "…" + s.slice(-n) : s);
  const cmdShort = (s: string) => {
    const first = s.split(/\s+/)[0] ?? "";
    return first.length > 20 ? first.slice(0, 20) : first;
  };
  switch (name) {
    case "Read": return file ? `Reading ${short(file, 40)}` : "Reading…";
    case "Edit":
    case "MultiEdit": return file ? `Editing ${short(file, 40)}` : "Editing…";
    case "Write": return file ? `Writing ${short(file, 40)}` : "Writing…";
    case "Bash": return cmd ? `$ ${cmdShort(cmd)}` : "Running shell…";
    case "Grep": return pat ? `Grep "${short(pat, 30)}"` : "Searching…";
    case "Glob": return pat ? `Glob ${short(pat, 30)}` : "Globbing…";
    case "Task": return "Spawning agent";
    case "WebFetch":
    case "WebSearch": return "Web search";
  }
  if (name.startsWith("mcp__office__")) return name.replace("mcp__office__", "office:");
  if (name.startsWith("mcp__")) return name.replace("mcp__", "");
  return name;
}

async function pumpQuery(session_id: string, q: Query) {
  let sdkIdCaptured = false;
  try {
    for await (const msg of q) {
      // Capture the SDK-side session id from the first message that carries
      // one, so we can resume this conversation after a server restart.
      if (!sdkIdCaptured && (msg as { session_id?: string }).session_id) {
        const sid = (msg as { session_id: string }).session_id;
        const r = runtimes.get(session_id);
        if (r && !r.meta.sdk_session_id) {
          r.meta.sdk_session_id = sid;
          setSdkSessionId(session_id, sid);
        }
        sdkIdCaptured = true;
      }
      if (msg.type === "assistant") {
        const errKind = (msg as { error?: string }).error;
        if (errKind === "rate_limit") {
          bus.emitEvent({
            type: "session.rate_limit",
            session_id,
            message:
              "Anthropic rate limit hit on this model. Wait a few minutes, switch model, or stop other parallel sessions.",
          });
          setStatus(session_id, "error", "rate_limit");
        }
        const blocks = msg.message?.content ?? [];
        for (const b of blocks as Array<{ type: string; text?: string; name?: string; input?: unknown; id?: string }>) {
          if (b.type === "text" && b.text) {
            persistAndEmit(session_id, "assistant", { content: b.text });
          } else if (b.type === "tool_use") {
            persistAndEmit(session_id, "tool", {
              content: "",
              tool_name: b.name ?? null,
              tool_input: b.input != null ? JSON.stringify(b.input).slice(0, 8000) : null,
            });
            setActivity(session_id, activityLabel(b.name ?? "", b.input));
          }
        }
      } else if (msg.type === "user") {
        // Tool results come back as user messages with tool_result blocks.
        const blocks = msg.message?.content;
        if (Array.isArray(blocks)) {
          for (const b of blocks as Array<{ type: string; content?: unknown; is_error?: boolean }>) {
            if (b.type === "tool_result") {
              const txt =
                typeof b.content === "string"
                  ? b.content
                  : Array.isArray(b.content)
                  ? (b.content as Array<{ type: string; text?: string }>)
                      .map((c) => (c.type === "text" && c.text ? c.text : ""))
                      .join("\n")
                  : "";
              persistAndEmit(session_id, "tool", {
                content: "",
                tool_result: txt.slice(0, 8000),
              });
            }
          }
        }
      } else if (msg.type === "result") {
        setStatus(session_id, "idle");
        setActivity(session_id, null);
      }
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    setStatus(session_id, "error", err);
    persistAndEmit(session_id, "system", { content: `[error] ${err}` });
    return;
  }
  if (runtimes.get(session_id)?.meta.status !== "stopped") setStatus(session_id, "idle");
}

export function createSession(input: {
  name: string;
  target_dir: string;
  model?: ModelId;
}): Session {
  if (runtimes.size >= MAX_CONCURRENT) {
    throw new Error(`Max ${MAX_CONCURRENT} concurrent sessions reached`);
  }
  const meta = insertSession({
    id: nanoid(10),
    name: input.name,
    target_dir: input.target_dir,
    model: input.model ?? "sonnet",
    status: "idle",
  });
  bus.emitEvent({ type: "session.upsert", session: meta });
  startRuntime(meta);
  return meta;
}

/**
 * Re-spawn a runtime for every persisted session on boot, passing
 * `resume: sdk_session_id` so the SDK restores the prior conversation memory.
 * Sessions whose target_dir no longer exists are flagged as 'error' and skipped.
 */
export function bootResumeAll() {
  for (const meta of listSessions()) {
    if (!existsSync(meta.target_dir) || !statSync(meta.target_dir).isDirectory()) {
      setSessionStatus(meta.id, "error");
      continue;
    }
    setSessionStatus(meta.id, "idle");
    meta.status = "idle";
    startRuntime(meta);
  }
}

function startRuntime(meta: Session) {
  const abort = new AbortController();
  const { stream, push, close } = makeUserStream(meta.id);
  const mcp = createVulnMcpServer(meta.id);

  const q = query({
    prompt: stream,
    options: {
      cwd: meta.target_dir,
      model: meta.model,
      resume: meta.sdk_session_id ?? undefined,
      abortController: abort,
      permissionMode: "bypassPermissions",
      includePartialMessages: false,
      mcpServers: { office: mcp },
      systemPrompt: { type: "preset", preset: "claude_code", append: VULN_TOOL_GUIDE },
      settingSources: ["user", "project"],
      stderr: (s) => {
        if (s.includes("error") || s.includes("Error")) {
          console.error(`[session ${meta.id}]`, s.trimEnd());
        }
      },
    },
  });

  const rt: RuntimeSession = {
    meta,
    abort,
    query: q,
    pushUser: push,
    closeInput: close,
    activity: null,
  };
  runtimes.set(meta.id, rt);

  setStatus(meta.id, "idle");
  rt.pump = pumpQuery(meta.id, q);
  installStatusTimer(meta.id);
}

// ---------- status briefing scheduler ----------

const STATUS_TRIGGER =
  "STATUS_BRIEFING_TRIGGER: please call mcp__office__status_briefing now with a brief progress summary (2-4 sentences). Do not run any other tools. After the tool call, respond with just 'ok'.";

function installStatusTimer(session_id: string) {
  const r = runtimes.get(session_id);
  if (!r) return;
  if (r.statusTimer) clearInterval(r.statusTimer);
  const settings = getMailingSettings();
  const minutes = Math.max(5, Math.min(300, settings.mailing_status_interval_min || 30));
  const ms = minutes * 60 * 1000;
  r.statusTimer = setInterval(() => {
    const cur = runtimes.get(session_id);
    if (!cur) return;
    // Skip if a turn is currently executing — let it finish; the next tick
    // will catch up. Avoids stacking nudges while the user is mid-task.
    if (cur.meta.status === "running") return;
    cur.pushUser(STATUS_TRIGGER);
    setStatus(session_id, "running");
  }, ms);
}

/** Re-arm timers across all sessions when the global slider value changes. */
export function reinstallAllStatusTimers() {
  for (const [id] of runtimes) installStatusTimer(id);
}

export function sendUserMessage(session_id: string, text: string) {
  const r = runtimes.get(session_id);
  if (!r) throw new Error("session not running");
  persistAndEmit(session_id, "user", { content: text });
  setStatus(session_id, "running");
  r.pushUser(text);
}

export async function interruptSession(session_id: string) {
  const r = runtimes.get(session_id);
  if (!r) return;
  try {
    await r.query?.interrupt();
  } catch {
    /* ignore */
  }
}

export async function changeSessionModel(session_id: string, model: ModelId) {
  const r = runtimes.get(session_id);
  if (!r) throw new Error("session not running");
  await r.query?.setModel(model);
  r.meta.model = model;
  setSessionModel(session_id, model);
  bus.emitEvent({ type: "session.upsert", session: r.meta });
}

export async function stopSession(session_id: string) {
  const r = runtimes.get(session_id);
  if (!r) {
    deleteSession(session_id);
    bus.emitEvent({ type: "session.delete", session_id });
    return;
  }
  if (r.statusTimer) clearInterval(r.statusTimer);
  r.meta.status = "stopped";
  setStatus(session_id, "stopped");
  try {
    await r.query?.interrupt();
  } catch {
    /* ignore */
  }
  r.closeInput();
  r.abort.abort();
  // Drain the pump before deleting the DB row so late inserts do not FK-fail.
  if (r.pump) {
    try {
      await r.pump;
    } catch {
      /* ignore */
    }
  }
  runtimes.delete(session_id);
  deleteSession(session_id);
  bus.emitEvent({ type: "session.delete", session_id });
}

export function broadcastUserMessage(text: string): { count: number; ids: string[] } {
  const ids: string[] = [];
  for (const [id] of runtimes) {
    try {
      sendUserMessage(id, text);
      ids.push(id);
    } catch {
      /* skip sessions not running */
    }
  }
  return { count: ids.length, ids };
}

export function renameSessionRuntime(session_id: string, name: string): Session | null {
  dbRenameSession(session_id, name);
  const r = runtimes.get(session_id);
  if (r) {
    r.meta.name = name;
    bus.emitEvent({ type: "session.upsert", session: r.meta });
    return r.meta;
  }
  const s = getSession(session_id);
  if (s) bus.emitEvent({ type: "session.upsert", session: s });
  return s ?? null;
}

export const listAllSessions = () => listSessions();
export const getSessionMeta = (id: string) => getSession(id);
export const runtimeCount = () => runtimes.size;
