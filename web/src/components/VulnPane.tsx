import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import type {
  Severity,
  Session,
  VulnFileEntry,
  VulnFilesResponse,
  Vulnerability,
  VulnStatus,
} from "../lib/types";
import { fileKind } from "../lib/lang";
import { FileIcon, ShieldIcon, XIcon } from "./icons";

const EMPTY_VULNS: Vulnerability[] = [];
const EMPTY_FILES: VulnFileEntry[] = [];

const sevColor: Record<Severity, string> = {
  critical: "bg-danger/20 text-danger border-danger/40",
  high: "bg-accent/15 text-accent border-accent/40",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  info: "bg-elev text-muted border-line",
};

const statusColor: Record<VulnStatus, string> = {
  confirmed: "text-ok",
  candidate: "text-muted",
  false_positive: "text-muted/50 line-through",
};

export function VulnPane({ session }: { session: Session | null }) {
  const list = useStore((s) =>
    session ? s.vulnsBySession[session.id] ?? EMPTY_VULNS : EMPTY_VULNS,
  );

  return (
    <section className="flex flex-col h-full overflow-hidden">
      <header className="border-b border-line px-4 py-2.5 flex items-center gap-2">
        <ShieldIcon className="text-accent" width={14} height={14} />
        <div className="text-[13px] text-text font-medium">Vulnerabilities</div>
        <span className="ml-auto text-[11px] text-muted tabular-nums">{list.length}</span>
      </header>

      {!session && (
        <div className="text-xs text-muted text-center mt-6 px-6 leading-5">
          Select a session to see findings.
        </div>
      )}

      {session && (
        <div className="flex-1 overflow-y-auto scrollbar p-3 space-y-2">
          {list.length === 0 && (
            <div className="text-[11.5px] text-muted text-center mt-6 px-4 leading-5">
              No findings yet.<br />
              Claude will populate this panel as it confirms vulnerabilities.
            </div>
          )}
          {list.map((v) => (
            <VulnCard key={v.id} v={v} />
          ))}
        </div>
      )}
    </section>
  );
}

function VulnCard({ v }: { v: Vulnerability }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<VulnFileEntry[]>(EMPTY_FILES);
  const [dir, setDir] = useState<string | null>(null);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const openArtifact = useStore((s) => s.openArtifact);

  useEffect(() => {
    if (!open || filesLoaded) return;
    fetch(`/api/vulns/${v.id}/files`)
      .then((r) => r.json() as Promise<VulnFilesResponse>)
      .then((j) => {
        setFiles(j.files ?? EMPTY_FILES);
        setDir(j.dir);
      })
      .catch(() => {})
      .finally(() => setFilesLoaded(true));
  }, [open, filesLoaded, v.id]);

  // Refresh file list when card is open and the vuln gets updated (e.g. poc_path added).
  useEffect(() => {
    if (open) setFilesLoaded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.poc_path, v.updated_at]);

  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${v.title}"?`)) return;
    await fetch(`/api/vulns/${v.id}?session_id=${v.session_id}`, { method: "DELETE" });
  };

  return (
    <div
      onClick={() => setOpen((o) => !o)}
      className="group rounded-lg border border-line bg-bg/40 hover:bg-elev/40 p-3 cursor-pointer transition-colors"
    >
      <div className="flex items-start gap-2">
        <span
          className={`shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${sevColor[v.severity]}`}
        >
          {v.severity}
        </span>
        <div className="flex-1 min-w-0">
          <div className={`text-[13px] leading-snug ${statusColor[v.status]}`}>
            {v.title}
          </div>
          <div className="text-[11px] text-muted mt-0.5 truncate">
            {v.type}
            {v.file_path && (
              <>
                {" · "}
                <span className="font-mono">
                  {shortPath(v.file_path)}
                  {v.line ? `:${v.line}` : ""}
                </span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={remove}
          className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-danger transition-opacity"
          title="Delete"
        >
          <XIcon />
        </button>
      </div>

      {open && (
        <div
          className="mt-2 pt-2 border-t border-line/60 space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          {v.description && (
            <div className="text-[12px] text-text/90 whitespace-pre-wrap leading-relaxed">
              {v.description}
            </div>
          )}

          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted/70">Files</div>
            {!filesLoaded && (
              <div className="text-[11px] text-muted">Loading…</div>
            )}
            {filesLoaded && files.length === 0 && (
              <div className="text-[11px] text-muted">
                {dir
                  ? "(report directory exists but is empty)"
                  : "No PoC path on this finding yet — Claude will populate this list once a directory is set."}
              </div>
            )}
            {filesLoaded && dir && (
              <div className="text-[10px] text-muted/60 font-mono truncate" title={dir}>
                {shortPath(dir)}
              </div>
            )}
            <div className="space-y-0.5">
              {files.map((f) => (
                <button
                  key={f.name}
                  onClick={() =>
                    openArtifact({
                      vulnId: v.id,
                      fileName: f.name,
                      filePath: `${dir}/${f.name}`,
                    })
                  }
                  className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-left hover:bg-elev/60 transition-colors"
                  title={`Open ${f.name}`}
                >
                  <FileIcon className="text-muted shrink-0" />
                  <span className="text-[12px] text-text truncate">{f.name}</span>
                  <span className="ml-auto text-[10px] text-muted tabular-nums shrink-0">
                    {humanSize(f.size)}
                  </span>
                  <span className="text-[10px] text-muted/60 uppercase tracking-wider shrink-0">
                    {fileKind(f.name) === "markdown" ? "md" : fileKind(f.name) === "code" ? "code" : "txt"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="text-[10px] text-muted/70 pt-1">
            id: <span className="font-mono">{v.id}</span> · status: {v.status}
          </div>
        </div>
      )}
    </div>
  );
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function shortPath(p: string) {
  const parts = p.split("/");
  if (parts.length <= 3) return p;
  return ".../" + parts.slice(-2).join("/");
}
