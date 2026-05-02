import { useState } from "react";
import { useStore } from "../lib/store";
import type { Session, StatusBriefing } from "../lib/types";
import { MailIcon } from "./icons";
import { Markdown } from "./Markdown";
import { MailingPopover } from "./MailingPopover";

const EMPTY: StatusBriefing[] = [];

export function StatusPane({ session }: { session: Session | null }) {
  const items = useStore((s) =>
    session ? s.statusBySession[session.id] ?? EMPTY : EMPTY,
  );
  const mailing = useStore((s) => s.mailing);
  const [mailingOpen, setMailingOpen] = useState(false);

  const intervalLabel = mailing.mailing_status_interval_min;
  const anyOn = mailing.mailing_status_enabled || mailing.mailing_vulns_enabled;

  return (
    <section className="flex flex-col h-full overflow-hidden border-b border-line">
      <header className="relative flex items-center gap-2 px-4 py-2.5 border-b border-line">
        <div className="text-[13px] text-text font-medium">Status</div>
        <span className="text-[11px] text-muted tabular-nums">{items.length}</span>
        <button
          onClick={() => setMailingOpen((o) => !o)}
          className={[
            "ml-auto flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] border transition-colors",
            anyOn
              ? "border-accent/40 text-accent hover:bg-accent/10"
              : "border-line text-muted hover:bg-elev hover:text-text",
          ].join(" ")}
          title="Mailing settings"
        >
          <MailIcon width={13} height={13} />
          <span className="font-medium tracking-tight">Mailing</span>
          {anyOn && (
            <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-accent" />
          )}
        </button>
        {mailingOpen && <MailingPopover onClose={() => setMailingOpen(false)} />}
      </header>

      {!session && (
        <div className="text-xs text-muted text-center mt-6 px-6 leading-5">
          Select a session to see status briefings.
        </div>
      )}

      {session && items.length === 0 && (
        <div className="text-[11.5px] text-muted text-center mt-6 px-5 leading-5">
          No briefings yet.
          {mailing.mailing_status_enabled ? (
            <> Next check ≤ <span className="text-accent">{intervalLabel} min</span>.</>
          ) : (
            <> Server pings Claude every <span className="text-text">{intervalLabel} min</span> for a summary.</>
          )}
        </div>
      )}

      {session && (
        <div className="flex-1 overflow-y-auto scrollbar p-3 space-y-2">
          {[...items].reverse().map((b) => (
            <BriefingCard key={b.id} b={b} />
          ))}
        </div>
      )}
    </section>
  );
}

function BriefingCard({ b }: { b: StatusBriefing }) {
  const [open, setOpen] = useState(false);
  const date = new Date(b.created_at);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const day = date.toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <div
      onClick={() => setOpen((o) => !o)}
      className="rounded-lg border border-line bg-bg/40 hover:bg-elev/40 px-3 py-2 cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 text-[10px] text-muted">
        <span className="font-mono tabular-nums">{day} · {time}</span>
        {b.mailed === 1 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-accent/80">
            <MailIcon width={10} height={10} /> sent
          </span>
        )}
      </div>
      <div className="mt-1 text-[12.5px] text-text/95 leading-snug">
        {open ? <Markdown source={b.text} /> : <Truncated text={b.text} />}
      </div>
    </div>
  );
}

function Truncated({ text }: { text: string }) {
  const collapsed = text.length > 220 ? text.slice(0, 220) + "…" : text;
  return <div className="whitespace-pre-wrap">{collapsed}</div>;
}
