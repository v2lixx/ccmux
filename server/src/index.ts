import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import {
  listMessages,
  listVulnsBySession,
  deleteVuln as dbDeleteVuln,
  updateVuln as dbUpdateVuln,
  getSession,
  getVuln,
  getMailingSettings,
  patchMailingSettings,
  listStatusBriefings,
  listAllVulns,
} from "./db.js";
import { listVulnDir, readFileGuarded } from "./files.js";
import { bus } from "./events.js";
import {
  bootResumeAll,
  broadcastUserMessage,
  changeSessionModel,
  createSession,
  interruptSession,
  listAllSessions,
  MAX_CONCURRENT,
  reinstallAllStatusTimers,
  renameSessionRuntime,
  runtimeCount,
  sendUserMessage,
  stopSession,
} from "./sessions.js";
import type { ModelId, WsClientEvent, WsServerEvent } from "./types.js";

const VALID_MODELS = new Set<ModelId>(["opus", "sonnet", "haiku"]);
bootResumeAll();

const PORT = Number(process.env.CCMUX_PORT ?? 8787);
const HOST = process.env.CCMUX_HOST ?? "127.0.0.1";

const app = new Hono();
app.use("/*", cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));

app.get("/api/health", (c) => c.json({ ok: true, max: MAX_CONCURRENT, active: runtimeCount() }));

app.get("/api/sessions", (c) => c.json(listAllSessions()));

app.post("/api/sessions", async (c) => {
  const body = await c.req.json<{ name?: string; target_dir?: string; model?: string }>();
  if (!body.name || !body.target_dir) return c.json({ error: "name and target_dir required" }, 400);

  const expanded = body.target_dir.startsWith("~")
    ? body.target_dir.replace(/^~/, homedir())
    : body.target_dir;
  const dir = resolve(expanded);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return c.json({ error: `target_dir not a directory: ${dir}` }, 400);
  }
  if (runtimeCount() >= MAX_CONCURRENT) {
    return c.json({ error: `max ${MAX_CONCURRENT} sessions` }, 429);
  }
  const model = (body.model && VALID_MODELS.has(body.model as ModelId) ? body.model : "sonnet") as ModelId;
  try {
    const s = createSession({ name: body.name, target_dir: dir, model });
    return c.json(s);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

app.patch("/api/sessions/:id/model", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ model?: string }>();
  if (!body.model || !VALID_MODELS.has(body.model as ModelId)) {
    return c.json({ error: "model must be one of opus|sonnet|haiku" }, 400);
  }
  try {
    await changeSessionModel(id, body.model as ModelId);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

app.delete("/api/sessions/:id", async (c) => {
  await stopSession(c.req.param("id"));
  return c.json({ ok: true });
});

app.patch("/api/sessions/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ name?: string }>();
  if (!body.name || !body.name.trim()) return c.json({ error: "name required" }, 400);
  const s = renameSessionRuntime(id, body.name.trim());
  if (!s) return c.json({ error: "not found" }, 404);
  return c.json(s);
});

app.post("/api/sessions/:id/interrupt", async (c) => {
  await interruptSession(c.req.param("id"));
  return c.json({ ok: true });
});

app.get("/api/sessions/:id/messages", (c) => c.json(listMessages(c.req.param("id"))));

app.get("/api/sessions/:id/vulns", (c) => c.json(listVulnsBySession(c.req.param("id"))));

app.patch("/api/vulns/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const v = dbUpdateVuln(id, body);
  if (!v) return c.json({ error: "not found" }, 404);
  bus.emitEvent({ type: "vuln.upsert", session_id: v.session_id, vuln: v });
  return c.json(v);
});

app.delete("/api/vulns/:id", (c) => {
  const id = c.req.param("id");
  const sid = (c.req.query("session_id") ?? "") as string;
  dbDeleteVuln(id);
  if (sid) bus.emitEvent({ type: "vuln.delete", session_id: sid, vuln_id: id });
  return c.json({ ok: true });
});

app.get("/api/vulns/:id/files", (c) => {
  const v = getVuln(c.req.param("id"));
  if (!v) return c.json({ error: "not found" }, 404);
  return c.json(listVulnDir(v.poc_path));
});

app.get("/api/file", (c) => {
  const p = c.req.query("path");
  if (!p) return c.json({ error: "path required" }, 400);
  const r = readFileGuarded(p);
  if (r.kind === "error") return c.json({ error: r.reason }, r.status as 400 | 403 | 404 | 413);
  if (r.kind === "binary") return c.json({ error: "binary", size: r.size, path: r.path }, 415);
  return c.json({ content: r.content, size: r.size, path: r.path });
});

// ---------------- status briefings + settings ----------------

app.get("/api/sessions/:id/status", (c) =>
  c.json(listStatusBriefings(c.req.param("id"))),
);

app.get("/api/settings", (c) => c.json(getMailingSettings()));

app.patch("/api/settings", async (c) => {
  const body = await c.req.json<{
    mailing_status_enabled?: boolean;
    mailing_status_interval_min?: number;
    mailing_vulns_enabled?: boolean;
  }>();
  const patch: Record<string, unknown> = {};
  if (typeof body.mailing_status_enabled === "boolean")
    patch.mailing_status_enabled = body.mailing_status_enabled;
  if (typeof body.mailing_vulns_enabled === "boolean")
    patch.mailing_vulns_enabled = body.mailing_vulns_enabled;
  if (typeof body.mailing_status_interval_min === "number") {
    patch.mailing_status_interval_min = Math.max(5, Math.min(300, Math.round(body.mailing_status_interval_min)));
  }
  const next = patchMailingSettings(patch);
  // Re-arm per-session timers if interval changed.
  if ("mailing_status_interval_min" in patch) reinstallAllStatusTimers();
  bus.emitEvent({ type: "settings.update", settings: next });
  return c.json(next);
});

// ---------------- broadcast + global vulns ----------------

app.post("/api/broadcast", async (c) => {
  const body = await c.req.json<{ text?: string }>();
  if (!body.text || !body.text.trim()) return c.json({ error: "text required" }, 400);
  const r = broadcastUserMessage(body.text.trim());
  return c.json(r);
});

app.get("/api/vulns", (c) => c.json(listAllVulns()));

const server = serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`[ccmux] http://${info.address}:${info.port}`);
});

const wss = new WebSocketServer({ server: server as unknown as HttpServer, path: "/ws" });

function send(ws: WebSocket, ev: WsServerEvent) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(ev));
}

wss.on("connection", (ws) => {
  // initial snapshot
  send(ws, { type: "session.list", sessions: listAllSessions() });
  send(ws, { type: "settings.update", settings: getMailingSettings() });

  const off = bus.onEvent((ev) => send(ws, ev));

  ws.on("message", (raw) => {
    let msg: WsClientEvent;
    try {
      msg = JSON.parse(raw.toString()) as WsClientEvent;
    } catch {
      return;
    }
    try {
      if (msg.type === "session.send") {
        sendUserMessage(msg.session_id, msg.text);
      } else if (msg.type === "session.interrupt") {
        interruptSession(msg.session_id);
      } else if (msg.type === "subscribe") {
        const s = getSession(msg.session_id);
        if (s) send(ws, { type: "session.upsert", session: s });
        send(ws, {
          type: "vuln.list",
          session_id: msg.session_id,
          vulns: listVulnsBySession(msg.session_id),
        });
        send(ws, {
          type: "status.list",
          session_id: msg.session_id,
          items: listStatusBriefings(msg.session_id),
        });
        // Replay history as a single batch — emitting one event per message
        // causes 100s of re-renders on long sessions and shakes the scroll.
        send(ws, {
          type: "messages.list",
          session_id: msg.session_id,
          messages: listMessages(msg.session_id),
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[ws] handler error", e);
    }
  });

  ws.on("close", () => off());
});
