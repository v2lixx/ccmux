import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import type { ModelId, Session, SessionStatus } from "../lib/types";
import { PencilIcon, PlusIcon, XIcon } from "./icons";
import { ModelPicker } from "./ModelPicker";

const MAX = 3;

const statusDot = (s: SessionStatus) =>
  s === "running"
    ? "bg-accent animate-pulse"
    : s === "error"
    ? "bg-danger"
    : s === "stopped"
    ? "bg-muted/50"
    : "bg-ok/70";

export function SessionSidebar() {
  const sessions = useStore((s) => s.sessions);
  const activeId = useStore((s) => s.activeId);
  const setActive = useStore((s) => s.setActive);
  const [adding, setAdding] = useState(false);

  return (
    <aside className="w-[260px] shrink-0 border-r border-line bg-panel flex flex-col">
      <div className="p-3 border-b border-line">
        <button
          disabled={sessions.length >= MAX || adding}
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 rounded-md border border-dashed border-line py-2 text-sm text-muted hover:bg-elev hover:text-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={sessions.length >= MAX ? `Max ${MAX} sessions` : "New session"}
        >
          <PlusIcon /> New Session
          <span className="text-[10px] tabular-nums opacity-60 ml-1">
            {sessions.length}/{MAX}
          </span>
        </button>
      </div>

      {adding && <NewSessionForm onClose={() => setAdding(false)} />}

      <div className="flex-1 overflow-y-auto scrollbar p-2 space-y-1">
        {sessions.length === 0 && !adding && (
          <div className="text-xs text-muted text-center mt-8 px-4 leading-5">
            No active session.<br />
            Click <span className="text-text">+ New Session</span> to begin.
          </div>
        )}
        {sessions.map((s) => (
          <SessionRow
            key={s.id}
            s={s}
            active={s.id === activeId}
            onSelect={() => setActive(s.id)}
          />
        ))}
      </div>
    </aside>
  );
}

function SessionRow({
  s,
  active,
  onSelect,
}: {
  s: Session;
  active: boolean;
  onSelect: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const activity = useStore((st) => st.activityBySession[s.id] ?? null);

  useEffect(() => {
    if (editing) {
      setDraft(s.name);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, s.name]);

  const close = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`End session "${s.name}"? This cannot be undone.`)) return;
    await fetch(`/api/sessions/${s.id}`, { method: "DELETE" });
  };

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
  };

  const commitRename = async () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === s.name) return;
    await fetch(`/api/sessions/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
  };

  return (
    <button
      onClick={editing ? undefined : onSelect}
      onDoubleClick={startRename}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={[
        "group relative w-full text-left rounded-md px-3 py-2 transition-colors",
        active ? "bg-elev" : "hover:bg-elev/60",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${statusDot(s.status)}`} />
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commitRename();
                else if (e.key === "Escape") setEditing(false);
              }}
              onBlur={commitRename}
              className="w-full bg-bg border border-accent/60 rounded px-1.5 py-0.5 text-sm text-text focus:outline-none"
            />
          ) : (
            <div className="text-sm text-text truncate">{s.name}</div>
          )}
          <div className="text-[11px] text-muted truncate font-mono">{s.target_dir}</div>
          {activity && (
            <div className="text-[10px] text-accent/85 truncate mt-0.5 font-mono">
              {activity}
            </div>
          )}
        </div>
      </div>
      {hover && !editing && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          <span
            onClick={startRename}
            role="button"
            aria-label="Rename"
            className="inline-flex items-center justify-center w-5 h-5 rounded text-muted hover:text-text hover:bg-bg/80"
            title="Rename (or double-click)"
          >
            <PencilIcon width={12} height={12} />
          </span>
          <span
            onClick={close}
            role="button"
            aria-label="End session"
            className="inline-flex items-center justify-center w-5 h-5 rounded text-muted hover:text-danger hover:bg-bg/80"
            title="End session"
          >
            <XIcon />
          </span>
        </div>
      )}
    </button>
  );
}

function NewSessionForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [dir, setDir] = useState("~/research/");
  const [model, setModel] = useState<ModelId>("sonnet");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !dir.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), target_dir: dir.trim(), model }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? `error ${res.status}`);
      return;
    }
    onClose();
  };

  return (
    <form
      onSubmit={submit}
      className="border-b border-line p-3 space-y-2 bg-bg/40"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Session name (e.g. libssh-recon)"
        className="w-full rounded-md bg-panel border border-line px-2.5 py-1.5 text-sm placeholder:text-muted/70 focus:outline-none focus:border-accent/60"
      />
      <input
        value={dir}
        onChange={(e) => setDir(e.target.value)}
        placeholder="Target directory"
        className="w-full rounded-md bg-panel border border-line px-2.5 py-1.5 text-sm font-mono placeholder:text-muted/70 focus:outline-none focus:border-accent/60"
      />
      <div className="flex items-center justify-between text-[11px] text-muted px-0.5">
        <span>Model</span>
        <ModelPicker value={model} onChange={setModel} />
      </div>
      {err && <div className="text-xs text-danger">{err}</div>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-md bg-accent/90 text-white text-sm py-1.5 hover:bg-accent disabled:opacity-50"
        >
          {busy ? "Starting…" : "Start"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-md border border-line text-sm py-1.5 text-muted hover:bg-elev"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
