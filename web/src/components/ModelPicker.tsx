import { useEffect, useRef, useState } from "react";
import type { ModelId } from "../lib/types";

interface ModelOption {
  id: ModelId;
  label: string;
  blurb: string;
}

const MODELS: ModelOption[] = [
  { id: "opus", label: "Opus 4.7", blurb: "Smartest · slowest · highest quota cost" },
  { id: "sonnet", label: "Sonnet 4.6", blurb: "Balanced · default" },
  { id: "haiku", label: "Haiku 4.5", blurb: "Fastest · cheapest · lighter reasoning" },
];

const labelOf = (id: ModelId) => MODELS.find((m) => m.id === id)?.label ?? id;

export function ModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: ModelId;
  onChange: (next: ModelId) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-muted hover:bg-elev hover:text-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title="Change model for this session"
      >
        <span className="font-medium tracking-tight">{labelOf(value)}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-1.5 w-[220px] rounded-lg border border-line bg-panel shadow-2xl shadow-black/40 overflow-hidden z-20">
          {MODELS.map((m) => {
            const active = m.id === value;
            return (
              <button
                key={m.id}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={[
                  "w-full text-left px-3 py-2 transition-colors",
                  active ? "bg-elev" : "hover:bg-elev/60",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-text font-medium">{m.label}</span>
                  {active && <Check />}
                </div>
                <div className="text-[11px] text-muted mt-0.5 leading-snug">{m.blurb}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Check() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ml-auto text-accent"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
