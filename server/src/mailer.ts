import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

// Set CCMUX_MAILER_SCRIPT to the absolute path of an executable that takes
// (subject, body) as positional args. If unset, all mailing is a no-op.
const SCRIPT = process.env.CCMUX_MAILER_SCRIPT;

export function sendMail(subject: string, body: string): void {
  if (!SCRIPT) return;
  if (!existsSync(SCRIPT)) {
    console.warn(`[mailer] script not found: ${SCRIPT}`);
    return;
  }
  const proc = spawn(SCRIPT, [subject, body], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  proc.on("error", (e) => console.warn("[mailer] spawn error:", e.message));
  proc.unref();
}

export function vulnEmailBody(
  v: {
    title: string;
    type: string;
    severity: string;
    status: string;
    file_path: string | null;
    line: number | null;
    description: string;
    poc_path: string | null;
  },
  sessionLabel: string,
): string {
  const fileRef = v.file_path ? `${v.file_path}${v.line ? `:${v.line}` : ""}` : "(unknown)";
  return [
    `<h2>${escapeHtml(v.title)}</h2>`,
    `<p><b>Session:</b> ${escapeHtml(sessionLabel)}</p>`,
    `<p><b>Type:</b> ${escapeHtml(v.type)} &nbsp; <b>Severity:</b> ${escapeHtml(v.severity)} &nbsp; <b>Status:</b> ${escapeHtml(v.status)}</p>`,
    `<p><b>Sink:</b> <code>${escapeHtml(fileRef)}</code></p>`,
    v.poc_path ? `<p><b>PoC:</b> <code>${escapeHtml(v.poc_path)}</code></p>` : "",
    `<hr/>`,
    `<pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px;">${escapeHtml(v.description)}</pre>`,
  ].join("\n");
}

export function statusEmailBody(text: string, sessionLabel: string): string {
  return [
    `<p><b>Session:</b> ${escapeHtml(sessionLabel)}</p>`,
    `<pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px;">${escapeHtml(text)}</pre>`,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
