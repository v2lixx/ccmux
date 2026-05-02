import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ChatMessage,
  ChatRole,
  MailingSettings,
  Session,
  SessionStatus,
  Severity,
  StatusBriefing,
  VulnStatus,
  Vulnerability,
} from "./types.js";

const DB_PATH = process.env.CCMUX_DB ?? `${process.env.HOME}/.local/share/ccmux/db.sqlite`;
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  target_dir      TEXT NOT NULL,
  model           TEXT NOT NULL DEFAULT 'sonnet',
  status          TEXT NOT NULL DEFAULT 'idle',
  sdk_session_id  TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  content      TEXT NOT NULL DEFAULT '',
  tool_name    TEXT,
  tool_input   TEXT,
  tool_result  TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS vulnerabilities (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  type         TEXT NOT NULL,
  severity     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'confirmed',
  file_path    TEXT,
  line         INTEGER,
  description  TEXT NOT NULL DEFAULT '',
  poc_path     TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vulns_session ON vulnerabilities(session_id, created_at);

CREATE TABLE IF NOT EXISTS status_briefings (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  mailed      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_status_session ON status_briefings(session_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
`);

// Lightweight migrations for new columns on existing DBs.
{
  const cols = db.prepare(`PRAGMA table_info(sessions)`).all() as Array<{ name: string }>;
  const has = (n: string) => cols.some((c) => c.name === n);
  if (!has("model")) db.exec(`ALTER TABLE sessions ADD COLUMN model TEXT NOT NULL DEFAULT 'sonnet'`);
  if (!has("sdk_session_id")) db.exec(`ALTER TABLE sessions ADD COLUMN sdk_session_id TEXT`);
}

const now = () => Date.now();

// ---------------- sessions ----------------

const stmtInsertSession = db.prepare(`
  INSERT INTO sessions (id, name, target_dir, model, status, sdk_session_id, created_at, updated_at)
  VALUES (@id, @name, @target_dir, @model, @status, @sdk_session_id, @created_at, @updated_at)
`);
const stmtGetSession = db.prepare(`SELECT * FROM sessions WHERE id = ?`);
const stmtListSessions = db.prepare(`SELECT * FROM sessions ORDER BY created_at ASC`);
const stmtUpdateSessionStatus = db.prepare(`
  UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?
`);
const stmtUpdateSessionName = db.prepare(`
  UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?
`);
const stmtUpdateSessionModel = db.prepare(`
  UPDATE sessions SET model = ?, updated_at = ? WHERE id = ?
`);
const stmtUpdateSdkSessionId = db.prepare(`
  UPDATE sessions SET sdk_session_id = ?, updated_at = ? WHERE id = ?
`);
const stmtDeleteSession = db.prepare(`DELETE FROM sessions WHERE id = ?`);

export function insertSession(
  s: Omit<Session, "created_at" | "updated_at" | "sdk_session_id"> & { sdk_session_id?: string | null },
): Session {
  const ts = now();
  const row: Session = { ...s, sdk_session_id: s.sdk_session_id ?? null, created_at: ts, updated_at: ts };
  stmtInsertSession.run(row);
  return row;
}
export const getSession = (id: string) => stmtGetSession.get(id) as Session | undefined;
export const listSessions = () => stmtListSessions.all() as Session[];
export function setSessionStatus(id: string, status: SessionStatus) {
  stmtUpdateSessionStatus.run(status, now(), id);
}
export function renameSession(id: string, name: string) {
  stmtUpdateSessionName.run(name, now(), id);
}
export function setSessionModel(id: string, model: string) {
  stmtUpdateSessionModel.run(model, now(), id);
}
export function setSdkSessionId(id: string, sdk_session_id: string) {
  stmtUpdateSdkSessionId.run(sdk_session_id, now(), id);
}
export const deleteSession = (id: string) => stmtDeleteSession.run(id);

// ---------------- messages ----------------

const stmtInsertMessage = db.prepare(`
  INSERT INTO messages (id, session_id, role, content, tool_name, tool_input, tool_result, created_at)
  VALUES (@id, @session_id, @role, @content, @tool_name, @tool_input, @tool_result, @created_at)
`);
const stmtListMessages = db.prepare(`
  SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC
`);

export function insertMessage(m: {
  id: string;
  session_id: string;
  role: ChatRole;
  content?: string;
  tool_name?: string | null;
  tool_input?: string | null;
  tool_result?: string | null;
}): ChatMessage {
  const row: ChatMessage = {
    id: m.id,
    session_id: m.session_id,
    role: m.role,
    content: m.content ?? "",
    tool_name: m.tool_name ?? null,
    tool_input: m.tool_input ?? null,
    tool_result: m.tool_result ?? null,
    created_at: now(),
  };
  stmtInsertMessage.run(row);
  return row;
}
export const listMessages = (sid: string) => stmtListMessages.all(sid) as ChatMessage[];

// ---------------- vulnerabilities ----------------

const stmtInsertVuln = db.prepare(`
  INSERT INTO vulnerabilities
    (id, session_id, title, type, severity, status, file_path, line, description, poc_path, created_at, updated_at)
  VALUES
    (@id, @session_id, @title, @type, @severity, @status, @file_path, @line, @description, @poc_path, @created_at, @updated_at)
`);
const stmtUpdateVuln = db.prepare(`
  UPDATE vulnerabilities SET
    title = COALESCE(@title, title),
    type = COALESCE(@type, type),
    severity = COALESCE(@severity, severity),
    status = COALESCE(@status, status),
    file_path = COALESCE(@file_path, file_path),
    line = COALESCE(@line, line),
    description = COALESCE(@description, description),
    poc_path = COALESCE(@poc_path, poc_path),
    updated_at = @updated_at
  WHERE id = @id
`);
const stmtGetVuln = db.prepare(`SELECT * FROM vulnerabilities WHERE id = ?`);
const stmtListVulnsBySession = db.prepare(`
  SELECT * FROM vulnerabilities WHERE session_id = ? ORDER BY created_at ASC
`);
const stmtDeleteVuln = db.prepare(`DELETE FROM vulnerabilities WHERE id = ?`);

export function insertVuln(v: Omit<Vulnerability, "created_at" | "updated_at">): Vulnerability {
  const ts = now();
  const row: Vulnerability = { ...v, created_at: ts, updated_at: ts };
  stmtInsertVuln.run(row);
  return row;
}
export function updateVuln(
  id: string,
  patch: Partial<Omit<Vulnerability, "id" | "session_id" | "created_at" | "updated_at">>,
): Vulnerability | undefined {
  stmtUpdateVuln.run({
    id,
    title: patch.title ?? null,
    type: patch.type ?? null,
    severity: (patch.severity as Severity | undefined) ?? null,
    status: (patch.status as VulnStatus | undefined) ?? null,
    file_path: patch.file_path ?? null,
    line: patch.line ?? null,
    description: patch.description ?? null,
    poc_path: patch.poc_path ?? null,
    updated_at: now(),
  });
  return getVuln(id);
}
export const getVuln = (id: string) => stmtGetVuln.get(id) as Vulnerability | undefined;
export const listVulnsBySession = (sid: string) =>
  stmtListVulnsBySession.all(sid) as Vulnerability[];
export const deleteVuln = (id: string) => stmtDeleteVuln.run(id);

// ---------------- status briefings ----------------

const stmtInsertBriefing = db.prepare(`
  INSERT INTO status_briefings (id, session_id, text, mailed, created_at)
  VALUES (@id, @session_id, @text, @mailed, @created_at)
`);
const stmtListBriefings = db.prepare(`
  SELECT * FROM status_briefings WHERE session_id = ? ORDER BY created_at ASC
`);
const stmtMarkBriefingMailed = db.prepare(`
  UPDATE status_briefings SET mailed = 1 WHERE id = ?
`);

export function insertStatusBriefing(b: {
  id: string;
  session_id: string;
  text: string;
}): StatusBriefing {
  const row: StatusBriefing = { ...b, mailed: 0, created_at: now() };
  stmtInsertBriefing.run(row);
  return row;
}
export const listStatusBriefings = (sid: string) =>
  stmtListBriefings.all(sid) as StatusBriefing[];
export const markBriefingMailed = (id: string) => stmtMarkBriefingMailed.run(id);

// ---------------- settings ----------------

const stmtGetSetting = db.prepare(`SELECT v FROM settings WHERE k = ?`);
const stmtSetSetting = db.prepare(`
  INSERT INTO settings (k, v) VALUES (?, ?)
  ON CONFLICT(k) DO UPDATE SET v = excluded.v
`);

export function getSetting<T>(key: string, fallback: T): T {
  const r = stmtGetSetting.get(key) as { v: string } | undefined;
  if (!r) return fallback;
  try {
    return JSON.parse(r.v) as T;
  } catch {
    return fallback;
  }
}
export function setSetting(key: string, value: unknown) {
  stmtSetSetting.run(key, JSON.stringify(value));
}

const DEFAULT_MAILING: MailingSettings = {
  mailing_status_enabled: false,
  mailing_status_interval_min: 30,
  mailing_vulns_enabled: false,
};

export function getMailingSettings(): MailingSettings {
  return {
    mailing_status_enabled: getSetting("mailing_status_enabled", DEFAULT_MAILING.mailing_status_enabled),
    mailing_status_interval_min: getSetting("mailing_status_interval_min", DEFAULT_MAILING.mailing_status_interval_min),
    mailing_vulns_enabled: getSetting("mailing_vulns_enabled", DEFAULT_MAILING.mailing_vulns_enabled),
  };
}
export function patchMailingSettings(patch: Partial<MailingSettings>): MailingSettings {
  const cur = getMailingSettings();
  const next: MailingSettings = { ...cur, ...patch };
  setSetting("mailing_status_enabled", next.mailing_status_enabled);
  setSetting("mailing_status_interval_min", next.mailing_status_interval_min);
  setSetting("mailing_vulns_enabled", next.mailing_vulns_enabled);
  return next;
}

// ---------------- aggregate queries ----------------

const stmtListAllVulns = db.prepare(`
  SELECT v.*, s.name AS session_name, s.target_dir AS session_target_dir
  FROM vulnerabilities v
  JOIN sessions s ON s.id = v.session_id
  ORDER BY v.created_at DESC
`);
export function listAllVulns(): Array<Vulnerability & { session_name: string; session_target_dir: string }> {
  return stmtListAllVulns.all() as Array<
    Vulnerability & { session_name: string; session_target_dir: string }
  >;
}
