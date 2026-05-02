const EXT_TO_LANG: Record<string, string> = {
  c: "c", h: "c",
  cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp",
  py: "python",
  js: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript",
  jsx: "javascript",
  go: "go",
  rs: "rust",
  java: "java",
  rb: "ruby",
  sh: "bash", bash: "bash", zsh: "bash",
  json: "json",
  yaml: "yaml", yml: "yaml",
  toml: "toml",
  md: "markdown",
  html: "xml", htm: "xml", xml: "xml",
  css: "css",
  diff: "diff", patch: "diff",
  s: "x86asm", asm: "x86asm",
  sql: "sql",
  txt: "plaintext", log: "plaintext",
};

export function detectLang(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return EXT_TO_LANG[ext] ?? "plaintext";
}

export function isMarkdown(filename: string): boolean {
  return /\.(md|markdown)$/i.test(filename);
}

export function fileKind(filename: string): "markdown" | "code" | "text" {
  if (isMarkdown(filename)) return "markdown";
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "txt" || ext === "log" || ext === "") return "text";
  return "code";
}
