import { useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

export function CopyButton({
  text,
  className = "",
  size = 14,
}: {
  text: string;
  className?: string;
  size?: number;
}) {
  const [copied, setCopied] = useState(false);
  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-muted hover:text-text hover:bg-elev/80 transition-colors",
        className,
      ].join(" ")}
      title={copied ? "Copied!" : "Copy"}
    >
      {copied ? (
        <CheckIcon width={size} height={size} className="text-ok" />
      ) : (
        <CopyIcon width={size} height={size} />
      )}
    </button>
  );
}
