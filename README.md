# ccmux

**Claude Code multiplexer.** A self-hosted web UI that runs multiple parallel Claude Code sessions through the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript) — like `tmux` but for Claude Code, with a dashboard.

Built with security/vulnerability-research workflows in mind — run several Claude instances against different target codebases at once, watch their tool calls live, and let each session populate a unified findings dashboard via MCP — but the orchestration layer is general enough for any multi-target Claude Code use case.

> **Status:** personal hobby project. Bind to localhost; do not expose publicly without putting authentication in front of it.

---

## Features

- **3-column dark/light UI** (sessions / chat / status + findings)
- **Up to 3 concurrent Claude Code sessions**, each in its own working directory
- **Sessions persist across server restarts** — the SDK session id is captured and replayed on boot so Claude restores its prior context
- **Real-time streaming** of assistant text and tool calls over WebSocket
- **Markdown rendering** for assistant output (code blocks with syntax highlighting + copy buttons)
- **MCP-driven Vulnerabilities panel** — Claude calls tools to write findings (`vuln_create / update / delete / list / list_all`)
- **Status panel** — periodic `status_briefing` summaries optionally forwarded to email
- **Mailing toggles** with persisted settings (Status: 5–300 min interval slider, Vulns: per-finding)
- **Cross-session vuln reference** — read-only view across all sessions for cross-target pattern hunting
- **Broadcast mode** — send the same prompt to every active session at once
- **Per-session model picker** (Opus / Sonnet / Haiku) with mid-conversation switching
- **Inline session rename** (double-click)
- **Live activity indicator** — current tool call shown beneath each session in the sidebar
- **Artifact viewer** — click a finding to see related files; markdown rendered, code highlighted
- **Rate-limit detection banner** — clear message when the SDK reports a rate limit
- **Cached state hydration** — refreshes are flash-free; scroll position is preserved per session

## Architecture

```
web (React + Vite + Tailwind + zustand)
   └─ WebSocket ─┐
                 ▼
server (Hono + ws + better-sqlite3)
   ├─ SessionManager   per-session Agent SDK query()
   ├─ SDK MCP server   vuln_create / update / delete / list / list_all + status_briefing
   ├─ SQLite           sessions, messages, findings, briefings, settings
   └─ Optional mailer  spawns an external script for email notifications
```

Auth: by default the Agent SDK reuses the OAuth token written by `claude login` (Max/Pro subscription). No API key required. If you prefer API-key auth, set `ANTHROPIC_API_KEY`.

## Requirements

- Node 18+
- `claude` CLI installed and logged in (or `ANTHROPIC_API_KEY` set)
- Optional: any executable script (Python/Node/Bash/etc.) for email notifications

## Setup

```bash
git clone <this-repo>
cd ccmux
npm install
npm run dev
```

- Server: `http://localhost:8787`
- Web (dev): `http://localhost:5173`

For production-style serving:

```bash
npm run build
npm start
```

## Accessing from another machine

The server binds to `127.0.0.1` by default. To use the UI from your laptop while the server runs on a remote box, the simplest option is an SSH tunnel:

```bash
# from your laptop
ssh -L 5173:localhost:5173 -L 8787:localhost:8787 user@host
# then open http://localhost:5173 in the browser
```

For an always-on macOS LaunchAgent tunnel (auto-reconnects on sleep/wake/network change), see `scripts/setup-mac-tunnel.sh`. Pre-reqs are listed in the script header.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `CCMUX_PORT` | `8787` | HTTP / WS port |
| `CCMUX_HOST` | `127.0.0.1` | Bind interface (do **not** change to `0.0.0.0` without putting auth in front) |
| `CCMUX_DB` | `~/.local/share/ccmux/db.sqlite` | SQLite path |
| `CCMUX_ALLOWED_ROOTS` | `~/research` | Colon-separated list of dirs the artifact viewer is allowed to read from |
| `CCMUX_MAILER_SCRIPT` | (none) | Absolute path to an executable taking `(subject, body)` as args. If unset, all email is a no-op. |

### Example mailer script

`CCMUX_MAILER_SCRIPT` is invoked as `<script> <subject> <body>`. It can be any executable. Example using [Resend](https://resend.com):

```python
#!/usr/bin/env python3
# /path/to/send-mail.py — chmod +x this file
import os, sys, resend
resend.api_key = os.environ["RESEND_API_KEY"]
resend.Emails.send({
    "from": "you@yourdomain.com",
    "to": os.environ["MAIL_TO"],
    "subject": sys.argv[1],
    "html": sys.argv[2],
})
```

```bash
export CCMUX_MAILER_SCRIPT=/path/to/send-mail.py
export RESEND_API_KEY=re_...
export MAIL_TO=you@example.com
npm run dev
```

## How Claude uses the dashboard

Each session has access to MCP tools under the `office` namespace (defined in `server/src/mcp-vulns.ts`):

| Tool | Purpose |
|---|---|
| `office.vuln_create` | Record a finding (title, severity, type, file_path, line, description, poc_path, status) |
| `office.vuln_update` | Patch fields (e.g. promote candidate → confirmed) |
| `office.vuln_delete` | Remove (prefer `status='false_positive'`) |
| `office.vuln_list` | List this session's findings |
| `office.vuln_list_all` | Read-only across all sessions |
| `office.status_briefing` | Short progress summary that appears in the Status panel |

A short usage guide is appended to the system prompt of every session, so Claude knows when and how to call the tools without extra prompting.

## Status briefings

When **Mailing Status** is toggled on (right-pane Mailing button), the server periodically pushes a synthetic prompt asking Claude to call `status_briefing` with a short summary. Cadence is set by the slider (5–300 min, default 30). The briefing appears in the Status panel and (if Mailing Status is on) is sent via the configured mailer script.

When **Mailing Vulns** is toggled on, every confirmed `vuln_create` triggers a finding email immediately.

Both toggles are persisted in the SQLite `settings` table and survive server restarts.

## Notes

- The **artifact viewer is path-guarded**. Only files under one of `CCMUX_ALLOWED_ROOTS` can be read; binaries and files >1.5 MB are refused.
- The concurrent-session cap is **3** — set in `MAX_CONCURRENT` in `server/src/sessions.ts`. Bumping this is fine but Max-plan rate limits can kick in fast on multiple Opus turns.
- Status-briefing triggers are filtered out of the main chat transcript and rendered as compact pills, so the chat stays clean even when timers fire every few minutes.
- The localStorage cache caps the active session's chat at the last 500 messages for instant hydration. The full transcript is always read from the server's SQLite DB.
- Built as a personal tool. Code style is pragmatic over polished. Issues / PRs welcome.

## License

MIT.
