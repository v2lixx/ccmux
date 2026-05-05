import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  deleteVuln,
  getMailingSettings,
  getSession,
  getVuln,
  insertStatusBriefing,
  insertVuln,
  listAllVulns,
  listVulnsBySession,
  markBriefingMailed,
  updateVuln,
} from "./db.js";
import { bus } from "./events.js";
import { sendMail, statusEmailBody, vulnEmailBody } from "./mailer.js";
import type { Severity, VulnStatus } from "./types.js";

const severitySchema = z.enum(["critical", "high", "medium", "low", "info"]);
const statusSchema = z.enum(["candidate", "confirmed", "false_positive"]);

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });

/**
 * Per-session SDK MCP server. Each tool is bound to `session_id` via closure
 * so a session cannot read or mutate another session's data, except via the
 * read-only `vuln_list_all` aggregator.
 */
export function createVulnMcpServer(session_id: string) {
  const tools = [
    tool(
      "vuln_create",
      "Record a finding in the right-pane Vulnerabilities panel. Use this only after you have validated the issue (e.g. an irrefutable PoC or sanitizer crash). Severity reflects exploit impact, not just sanitizer noise.",
      {
        title: z.string().min(1).describe("Short headline."),
        type: z.string().min(1).describe("Class, e.g. 'Heap-Buffer-Overflow', 'UAF', 'Integer-Overflow', 'OOB-Read', 'Type-Confusion'."),
        severity: severitySchema.describe("critical | high | medium | low | info"),
        status: statusSchema.optional().describe("Defaults to 'confirmed'. Use 'candidate' for in-progress leads."),
        file_path: z.string().optional().describe("Absolute or repo-relative source path of the sink."),
        line: z.number().int().optional().describe("Line number of the sink."),
        description: z.string().describe("Markdown summary: source, sink, taint flow, validation evidence."),
        poc_path: z.string().optional().describe("Path to the standalone PoC artifact."),
      },
      async (args) => {
        const v = insertVuln({
          id: nanoid(10),
          session_id,
          title: args.title,
          type: args.type,
          severity: args.severity as Severity,
          status: (args.status ?? "confirmed") as VulnStatus,
          file_path: args.file_path ?? null,
          line: args.line ?? null,
          description: args.description,
          poc_path: args.poc_path ?? null,
        });
        bus.emitEvent({ type: "vuln.upsert", session_id, vuln: v });
        const settings = getMailingSettings();
        if (settings.mailing_vulns_enabled && v.status !== "false_positive") {
          const s = getSession(session_id);
          const label = s ? `${s.name} (${s.target_dir})` : session_id;
          sendMail(`[${v.severity}] ${v.title}`, vulnEmailBody(v, label));
        }
        return ok(`vuln_create: stored id=${v.id} title="${v.title}"`);
      },
    ),
    tool(
      "vuln_update",
      "Patch fields of an existing finding (e.g. promote status from candidate to confirmed, refine description).",
      {
        id: z.string(),
        title: z.string().optional(),
        type: z.string().optional(),
        severity: severitySchema.optional(),
        status: statusSchema.optional(),
        file_path: z.string().optional(),
        line: z.number().int().optional(),
        description: z.string().optional(),
        poc_path: z.string().optional(),
      },
      async (args) => {
        const existing = getVuln(args.id);
        if (!existing || existing.session_id !== session_id) {
          return ok(`vuln_update: id=${args.id} not found in this session`);
        }
        const v = updateVuln(args.id, args);
        if (!v) return ok(`vuln_update: id=${args.id} not found`);
        bus.emitEvent({ type: "vuln.upsert", session_id, vuln: v });
        return ok(`vuln_update: updated id=${args.id}`);
      },
    ),
    tool(
      "vuln_delete",
      "Delete a finding. Prefer setting status='false_positive' if the trail might still be informative.",
      { id: z.string() },
      async (args) => {
        const existing = getVuln(args.id);
        if (!existing || existing.session_id !== session_id) {
          return ok(`vuln_delete: id=${args.id} not found in this session`);
        }
        deleteVuln(args.id);
        bus.emitEvent({ type: "vuln.delete", session_id, vuln_id: args.id });
        return ok(`vuln_delete: removed id=${args.id}`);
      },
    ),
    tool(
      "vuln_list",
      "List the findings already recorded in this session.",
      {},
      async () => {
        const rows = listVulnsBySession(session_id);
        if (rows.length === 0) return ok("vuln_list: (empty)");
        const lines = rows.map(
          (v) => `- ${v.id} [${v.severity}/${v.status}] ${v.type} :: ${v.title}`,
        );
        return ok(`vuln_list (${rows.length}):\n${lines.join("\n")}`);
      },
    ),
    tool(
      "vuln_list_all",
      "Read-only view of findings across ALL sessions (other targets). Useful for spotting recurring patterns.",
      {},
      async () => {
        const rows = listAllVulns();
        if (rows.length === 0) return ok("vuln_list_all: (empty)");
        const lines = rows.map(
          (v) =>
            `- [${v.session_name}] ${v.id} [${v.severity}/${v.status}] ${v.type} :: ${v.title}` +
            (v.file_path ? ` @ ${v.file_path}${v.line ? `:${v.line}` : ""}` : ""),
        );
        return ok(`vuln_list_all (${rows.length}):\n${lines.join("\n")}`);
      },
    ),
    tool(
      "status_briefing",
      "Record a short progress summary (2–4 sentences) in the right-pane Status panel. The server pushes a 'STATUS_BRIEFING_TRIGGER' user prompt at a configurable cadence — when you receive that, call this tool from existing context (do not run additional tools) and reply with just 'ok'.",
      {
        text: z.string().min(1).describe("Markdown allowed. 2–4 sentences."),
      },
      async (args) => {
        const b = insertStatusBriefing({
          id: nanoid(10),
          session_id,
          text: args.text,
        });
        bus.emitEvent({ type: "status.append", session_id, item: b });
        const settings = getMailingSettings();
        if (settings.mailing_status_enabled) {
          const s = getSession(session_id);
          const label = s ? `${s.name} (${s.target_dir})` : session_id;
          sendMail(`Status — ${label}`, statusEmailBody(args.text, label));
          markBriefingMailed(b.id);
        }
        return ok(`status_briefing: stored id=${b.id}`);
      },
    ),
  ];

  return createSdkMcpServer({
    name: "office",
    version: "0.1.0",
    tools,
  });
}

export const VULN_TOOL_GUIDE = `
# Office MCP tools

You are connected to a UI with two panels on the right side of the window:
**Status** (top) and **Vulnerabilities** (bottom). Both are populated through
the following MCP tools (namespace: \`office\`).

## Vulnerabilities
- \`mcp__office__vuln_create\` — record a new finding (only after validation)
- \`mcp__office__vuln_update\` — refine or promote (e.g. candidate -> confirmed)
- \`mcp__office__vuln_delete\` — remove (prefer status='false_positive' if uncertain)
- \`mcp__office__vuln_list\`   — list this session's findings (avoid duplicates)
- \`mcp__office__vuln_list_all\` — read-only view across all sessions

Default \`status\` is \`confirmed\`. Required fields for serious findings:
\`title\`, \`type\`, \`severity\`, \`description\`. Provide \`file_path\` + \`line\`
when known and \`poc_path\` once you have a PoC. Severity reflects exploit
impact, not just sanitizer noise.

### Deduplication against an operator tracking log

If a Markdown file at \`<cwd>/README.md\` (or another path the operator
points you at) tracks already-found / already-disclosed vulnerabilities,
read it BEFORE calling \`vuln_create\` and skip candidates that match an
existing entry by **package + bug class + sink file/function**. After
a successful \`vuln_create\` for a genuinely new finding, append a brief
entry to that same log using the file's existing Markdown shape (use the
\`Edit\` tool). This keeps disclosed and pending findings de-duplicated
across long-running parallel sessions. If no such log exists, just record
via \`vuln_create\` and skip the append step.

## Status briefings
- \`mcp__office__status_briefing\` — 2–4 sentence progress summary that appears
  in the Status panel and is optionally emailed.

The server periodically pushes a user message containing
\`STATUS_BRIEFING_TRIGGER\`. When you see that, call \`status_briefing\`
immediately with a short summary covering: (1) analyzed so far, (2) current
focus, (3) preliminary findings, (4) blockers. Do not run additional tools when
responding to a trigger — summarize from existing context. After the tool call,
reply with just "ok" to keep the chat clean.

## Mailing — IMPORTANT OVERRIDE

This environment has a **UI-controlled mailing system**. The operator toggles
"Mailing Status" and "Mailing Vulns" in the right panel; the server then
automatically emails status briefings and confirmed findings on their behalf
through the configured \`CCMUX_MAILER_SCRIPT\`.

**DO NOT \`Bash\` any \`send_email\` / \`mail\` / \`sendmail\` / \`curl\`-to-
mail-API command. DO NOT spawn any process whose purpose is to send email.**
Any rule in user-level CLAUDE.md (or elsewhere) that tells you to email
progress briefings or findings via an external script is **superseded by
this notice for sessions running inside ccmux**. The operator does not want
duplicate emails. If they want to be notified, they will turn on the toggle —
your job is just to record findings and briefings via the MCP tools above;
the server handles the rest.
`.trim();
