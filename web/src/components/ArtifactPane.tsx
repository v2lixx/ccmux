import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { detectLang, fileKind } from "../lib/lang";
import { CodeBlock } from "./CodeBlock";
import { Markdown } from "./Markdown";
import { CodeIcon, EyeIcon, XIcon } from "./icons";

export function ArtifactPane() {
  const artifact = useStore((s) => s.artifact);
  const close = useStore((s) => s.closeArtifact);

  const [content, setContent] = useState<string | null>(null);
  const [size, setSize] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // For markdown: which view mode is shown.
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    if (!artifact) return;
    setContent(null);
    setSize(0);
    setError(null);
    setLoading(true);
    setShowSource(false);
    fetch(`/api/file?path=${encodeURIComponent(artifact.filePath)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? `error ${r.status}`);
        setContent(j.content);
        setSize(j.size);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [artifact?.filePath]);

  // close on Esc
  useEffect(() => {
    if (!artifact) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [artifact, close]);

  if (!artifact) return null;

  const kind = fileKind(artifact.fileName);
  const lang = detectLang(artifact.fileName);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onMouseDown={close}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full md:w-[min(900px,80vw)] h-full bg-panel border-l border-line shadow-2xl shadow-black/50 flex flex-col"
      >
        <header className="px-4 py-3 border-b border-line flex items-center gap-3">
          <div className="min-w-0">
            <div className="text-[13px] text-text truncate">{artifact.fileName}</div>
            <div className="text-[11px] text-muted font-mono truncate">{artifact.filePath}</div>
          </div>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-muted">
            {humanSize(size)} · {kind === "markdown" ? "markdown" : lang}
          </span>
          {kind === "markdown" && (
            <button
              onClick={() => setShowSource((v) => !v)}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-line text-muted hover:bg-elev hover:text-text"
              title={showSource ? "Show rendered preview" : "Show markdown source"}
            >
              {showSource ? <EyeIcon /> : <CodeIcon />}
              <span>{showSource ? "Preview" : "Source"}</span>
            </button>
          )}
          <button
            onClick={close}
            className="p-1.5 rounded-md text-muted hover:bg-elev hover:text-text"
            title="Close (Esc)"
          >
            <XIcon />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto scrollbar">
          {loading && <div className="p-6 text-muted text-sm">Loading…</div>}
          {error && (
            <div className="p-6 text-danger text-sm">
              <div className="font-medium mb-1">Failed to load file</div>
              <div className="font-mono text-xs">{error}</div>
            </div>
          )}
          {!loading && !error && content !== null && (
            kind === "markdown" && !showSource ? (
              <div className="px-8 py-8 max-w-3xl mx-auto">
                <Markdown source={content} />
              </div>
            ) : (
              <CodeBlock source={content} language={kind === "markdown" ? "markdown" : lang} />
            )
          )}
        </div>
      </div>
    </div>
  );
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
