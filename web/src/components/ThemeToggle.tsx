import { useStore } from "../lib/store";
import { MoonIcon, SunIcon } from "./icons";

export function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => setTheme(next)}
      className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-muted hover:bg-elev hover:text-text transition-colors"
      title={`Switch to ${next} mode`}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      <span className="text-xs font-medium capitalize">{next}</span>
    </button>
  );
}
