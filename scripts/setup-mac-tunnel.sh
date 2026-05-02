#!/usr/bin/env bash
# Set up an always-on autossh tunnel from this Mac to a remote linux host,
# forwarding ports 5173 (Vite) and 8787 (server). Runs at login + auto-recovers.
#
# Usage:
#   ./setup-mac-tunnel.sh <host-alias>
#
# Pre-reqs:
#   1. brew install autossh
#   2. ~/.ssh/config has a `Host <host-alias>` entry with HostName/Port/User
#      and `LocalForward 5173 localhost:5173` + `LocalForward 8787 localhost:8787`
#   3. Passwordless SSH (ssh-keygen + ssh-copy-id <host-alias>) — autossh runs
#      headless via launchd and cannot prompt for a password.
#
# Example ~/.ssh/config block:
#   Host myhost
#     HostName example.com
#     Port 22
#     User you
#     LocalForward 5173 localhost:5173
#     LocalForward 8787 localhost:8787

set -euo pipefail

HOST_ALIAS="${1:-}"
if [ -z "$HOST_ALIAS" ]; then
  echo "Usage: $0 <ssh-host-alias>" >&2
  echo "       (the alias must be defined in ~/.ssh/config with LocalForward lines)" >&2
  exit 1
fi

LABEL="com.user.${HOST_ALIAS}-tunnel"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_OUT="/tmp/${HOST_ALIAS}-tunnel.out"
LOG_ERR="/tmp/${HOST_ALIAS}-tunnel.err"

if ! command -v autossh >/dev/null 2>&1; then
  echo "ERROR: autossh not found. Install with: brew install autossh" >&2
  exit 1
fi
AUTOSSH="$(command -v autossh)"
echo "[1/5] autossh: $AUTOSSH"

if ! grep -qE "^[[:space:]]*Host[[:space:]]+${HOST_ALIAS}([[:space:]]|$)" "$HOME/.ssh/config" 2>/dev/null; then
  echo "ERROR: ~/.ssh/config has no 'Host ${HOST_ALIAS}' entry." >&2
  exit 1
fi
echo "[2/5] ~/.ssh/config has '${HOST_ALIAS}'"

if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "${HOST_ALIAS}" "echo ok" >/dev/null 2>&1; then
  echo "ERROR: 'ssh ${HOST_ALIAS}' is asking for a password (or failing)." >&2
  echo "       Run: ssh-keygen -t ed25519 -N \"\" -f ~/.ssh/id_ed25519 ; ssh-copy-id ${HOST_ALIAS}" >&2
  exit 1
fi
echo "[3/5] passwordless SSH ok"

mkdir -p "$HOME/Library/LaunchAgents"
launchctl unload "$PLIST" 2>/dev/null || true

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${AUTOSSH}</string>
    <string>-M</string><string>0</string>
    <string>-N</string>
    <string>-o</string><string>ServerAliveInterval=30</string>
    <string>-o</string><string>ServerAliveCountMax=3</string>
    <string>-o</string><string>ExitOnForwardFailure=yes</string>
    <string>${HOST_ALIAS}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>${LOG_ERR}</string>
  <key>StandardOutPath</key><string>${LOG_OUT}</string>
</dict>
</plist>
EOF
echo "[4/5] wrote $PLIST"

pkill -f "ssh.*${HOST_ALIAS}" 2>/dev/null || true
sleep 1
launchctl load "$PLIST"
sleep 2
echo "[5/5] launchctl load done"

echo
echo "==== status ===="
launchctl list | grep -F "${LABEL}" || echo "(label not in launchctl list yet — give it a sec)"
lsof -nP -iTCP:5173 -iTCP:8787 -sTCP:LISTEN 2>/dev/null || echo "(no listener yet)"
echo
echo "If both 5173 and 8787 show LISTEN above, open http://localhost:5173 in your browser."
echo "Logs: ${LOG_ERR}  ${LOG_OUT}"
echo "To remove later:  launchctl unload \"$PLIST\" && rm \"$PLIST\""
