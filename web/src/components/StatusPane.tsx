import { useEffect, useMemo, useState } from "react";
import { useStore } from "../lib/store";
import type { Session, StatusBriefing } from "../lib/types";
import { ChevronLeftIcon, ChevronRightIcon, MailIcon } from "./icons";
import { Markdown } from "./Markdown";
import { MailingPopover } from "./MailingPopover";

const EMPTY: StatusBriefing[] = [];

export function StatusPane({ session }: { session: Session | null }) {
  const items = useStore((s) =>
    session ? s.statusBySession[session.id] ?? EMPTY : EMPTY,
  );
  const mailing = useStore((s) => s.mailing);
  const [mailingOpen, setMailingOpen] = useState(false);

  // display = newest first. Track activeId so navigation survives reordering;
  // null means "show whichever is currently newest".
  const display = useMemo(() => [...items].reverse(), [items]);
  const total = display.length;
  const newestId = display[0]?.id ?? null;
  const [activeId, setActiveId] = useState<string | null>(null);

  // Reset to newest on session switch or new briefing arrival. Manual arrow
  // navigation keeps the explicit id and is not disturbed by render-only changes.
  useEffect(() => {
    setActiveId(null);
  }, [session?.id, newestId]);

  const activeIdx = activeId
    ? Math.max(0, display.findIndex((x) => x.id === activeId))
    : 0;
  const active = display[activeIdx] ?? null;

  const goOlder = () => {
    if (activeIdx >= total - 1) return;
    setActiveId(display[activeIdx + 1].id);
  };
  const goNewer = () => {
    if (activeIdx <= 0) return;
    setActiveId(display[activeIdx - 1].id);
  };

  const intervalLabel = mailing.mailing_status_interval_min;
  const anyOn = mailing.mailing_status_enabled || mailing.mailing_vulns_enabled;

  return (
    <section className="flex flex-col h-full overflow-hidden border-b border-line">
      <header className="relative flex items-center gap-2 px-4 py-2.5 border-b border-line">
        <div className="text-[13px] text-text font-medium">Status</div>
        {total > 0 && (
          <span className="text-[11px] text-muted tabular-nums">
            {activeIdx + 1}/{total}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {total > 1 && (
            <div className="flex items-center mr-0.5">
              <button
                onClick={goOlder}
                disabled={activeIdx >= total - 1}
                className="p-1 rounded text-muted hover:bg-elev hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Older briefing"
              >
                <ChevronLeftIcon width={13} height={13} />
              </button>
              <button
                onClick={goNewer}
                disabled={activeIdx === 0}
                className="p-1 rounded text-muted hover:bg-elev hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Newer briefing"
              >
                <ChevronRightIcon width={13} height={13} />
              </button>
            </div>
          )}
          <button
            onClick={() => setMailingOpen((o) => !o)}
            className={[
              "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] border transition-colors",
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
        </div>
        {mailingOpen && <MailingPopover onClose={() => setMailingOpen(false)} />}
      </header>

      {!session && (
        <div className="text-xs text-muted text-center mt-6 px-6 leading-5">
          Select a session to see status briefings.
        </div>
      )}

      {session && total === 0 && (
        <div className="text-[11.5px] text-muted text-center mt-6 px-5 leading-5">
          No briefings yet.
          {mailing.mailing_status_enabled ? (
            <> Next check ≤ <span className="text-accent">{intervalLabel} min</span>.</>
          ) : (
            <> Server pings Claude every <span className="text-text">{intervalLabel} min</span> for a summary.</>
          )}
        </div>
      )}

      {session && active && <BriefingView b={active} />}
    </section>
  );
}

function BriefingView({ b }: { b: StatusBriefing }) {
  const date = new Date(b.created_at);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const day = date.toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 text-[10px] text-muted px-4 py-1.5 border-b border-line/40 shrink-0">
        <span className="font-mono tabular-nums">{day} · {time}</span>
        {b.mailed === 1 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-accent/80">
            <MailIcon width={10} height={10} /> sent
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto scrollbar px-4 py-3">
        <Markdown source={b.text} />
      </div>
    </div>
  );
}
