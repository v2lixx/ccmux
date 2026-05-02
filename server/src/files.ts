import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

// Colon-separated list of directories the artifact viewer is allowed to read.
// Set CCMUX_ALLOWED_ROOTS to override (e.g. "~/research:~/work").
const ALLOWED_ROOTS = (process.env.CCMUX_ALLOWED_ROOTS ?? "~/research")
  .split(":")
  .map((p) => resolve(expandTilde(p.trim())))
  .filter(Boolean);

const MAX_FILE_BYTES = 1_500_000;

export function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

function isInsideAllowed(abs: string): boolean {
  return ALLOWED_ROOTS.some((root) => abs === root || abs.startsWith(root + "/"));
}

export interface FileEntry {
  name: string;
  size: number;
  mtime: number;
}

export interface VulnDirListing {
  dir: string | null;
  files: FileEntry[];
}

export function listVulnDir(pocPath: string | null): VulnDirListing {
  if (!pocPath) return { dir: null, files: [] };
  const abs = resolve(expandTilde(pocPath));
  if (!isInsideAllowed(abs)) return { dir: null, files: [] };
  const dir = dirname(abs);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return { dir: null, files: [] };
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => {
      const full = join(dir, d.name);
      const s = statSync(full);
      return { name: d.name, size: s.size, mtime: s.mtimeMs };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { dir, files: entries };
}

export type ReadFileResult =
  | { kind: "text"; path: string; content: string; size: number }
  | { kind: "binary"; path: string; size: number }
  | { kind: "error"; status: number; reason: string };

export function readFileGuarded(rawPath: string): ReadFileResult {
  const abs = resolve(expandTilde(rawPath));
  if (!isInsideAllowed(abs)) return { kind: "error", status: 403, reason: "forbidden" };
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    return { kind: "error", status: 404, reason: "not found" };
  }
  const stat = statSync(abs);
  if (stat.size > MAX_FILE_BYTES) {
    return { kind: "error", status: 413, reason: `too large (${stat.size} > ${MAX_FILE_BYTES})` };
  }
  const buf = readFileSync(abs);
  if (looksBinary(buf)) return { kind: "binary", path: abs, size: stat.size };
  return { kind: "text", path: abs, content: buf.toString("utf-8"), size: stat.size };
}

function looksBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8192);
  for (let i = 0; i < len; i++) if (buf[i] === 0) return true;
  return false;
}
