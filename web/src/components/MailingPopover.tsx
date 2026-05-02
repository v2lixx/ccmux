import { useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { MailIcon, XIcon } from "./icons";

const MIN = 5;
const MAX = 300;

export function MailingPopover({ onClose }: { onClose: () => void }) {
  const mailing = useStore((s) => s.mailing);
  const patch = useStore((s) => s.patchMailing);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1.5 w-[300px] rounded-lg border border-line bg-panel shadow-2xl shadow-black/40 z-30 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
        <MailIcon className="text-accent" width={14} height={14} />
        <div className="text-[12px] text-text font-medium">Mailing</div>
        <button
          onClick={onClose}
          className="ml-auto p-1 rounded text-muted hover:bg-elev hover:text-text"
        >
          <XIcon width={13} height={13} />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Mailing Status */}
        <div
          className={[
            "rounded-md border transition-colors",
            mailing.mailing_status_enabled
              ? "border-line bg-bg/40"
              : "border-line/50 bg-bg/20",
          ].join(" ")}
        >
          <label className="flex items-start gap-2.5 px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={mailing.mailing_status_enabled}
              onChange={(e) =>
                patch({ mailing_status_enabled: e.target.checked })
              }
              className="mt-0.5 accent-accent"
            />
            <div className="flex-1 min-w-0">
              <div
                className={[
                  "text-[12.5px] font-medium",
                  mailing.mailing_status_enabled ? "text-text" : "text-muted/70",
                ].join(" ")}
              >
                Mailing Status
              </div>
              <div
                className={[
                  "text-[11px] leading-snug mt-0.5",
                  mailing.mailing_status_enabled ? "text-muted" : "text-muted/50",
                ].join(" ")}
              >
                Email a status briefing every N minutes.
              </div>
            </div>
          </label>
          {mailing.mailing_status_enabled && (
            <div className="px-3 pb-3 pt-1">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted mb-1">
                <span>Interval</span>
                <span className="text-accent tabular-nums font-mono normal-case tracking-normal">
                  {mailing.mailing_status_interval_min} min
                </span>
              </div>
              <input
                type="range"
                min={MIN}
                max={MAX}
                step={1}
                value={mailing.mailing_status_interval_min}
                onChange={(e) =>
                  patch({ mailing_status_interval_min: Number(e.target.value) })
                }
                className="w-full ccmux-range"
              />
              <div className="flex justify-between text-[9px] text-muted/60 mt-0.5 font-mono">
                <span>{MIN}m</span>
                <span>{MAX}m</span>
              </div>
            </div>
          )}
        </div>

        {/* Mailing Vulns */}
        <div
          className={[
            "rounded-md border transition-colors",
            mailing.mailing_vulns_enabled
              ? "border-line bg-bg/40"
              : "border-line/50 bg-bg/20",
          ].join(" ")}
        >
          <label className="flex items-start gap-2.5 px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={mailing.mailing_vulns_enabled}
              onChange={(e) =>
                patch({ mailing_vulns_enabled: e.target.checked })
              }
              className="mt-0.5 accent-accent"
            />
            <div className="flex-1 min-w-0">
              <div
                className={[
                  "text-[12.5px] font-medium",
                  mailing.mailing_vulns_enabled ? "text-text" : "text-muted/70",
                ].join(" ")}
              >
                Mailing Vulns
              </div>
              <div
                className={[
                  "text-[11px] leading-snug mt-0.5",
                  mailing.mailing_vulns_enabled ? "text-muted" : "text-muted/50",
                ].join(" ")}
              >
                Email each confirmed finding the moment it is recorded.
              </div>
            </div>
          </label>
        </div>

        <div className="text-[10px] text-muted/60 pt-1 border-t border-line/50">
          Settings persist across reloads.
        </div>
      </div>
    </div>
  );
}
