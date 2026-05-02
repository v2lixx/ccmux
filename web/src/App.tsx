import { useEffect } from "react";
import { ArtifactPane } from "./components/ArtifactPane";
import { ChatPane } from "./components/ChatPane";
import { RightColumn } from "./components/RightColumn";
import { SessionSidebar } from "./components/SessionSidebar";
import { ThemeToggle } from "./components/ThemeToggle";
import { useStore } from "./lib/store";

export default function App() {
  const connect = useStore((s) => s.connect);
  const sessions = useStore((s) => s.sessions);
  const activeId = useStore((s) => s.activeId);
  const wsReady = useStore((s) => s.wsReady);

  useEffect(() => {
    connect();
  }, [connect]);

  const active = sessions.find((s) => s.id === activeId) ?? null;

  return (
    <div className="h-full flex flex-col">
      <TopBar wsReady={wsReady} />
      <div className="flex-1 flex min-h-0">
        <SessionSidebar />
        <ChatPane session={active} />
        <RightColumn session={active} />
      </div>
      <ArtifactPane />
    </div>
  );
}

function TopBar({ wsReady }: { wsReady: boolean }) {
  return (
    <div className="h-11 border-b border-line bg-panel/80 flex items-center px-4 gap-3">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-accent" />
        <span className="text-[13px] font-medium text-text tracking-tight">ccmux</span>
      </div>
      <span
        className={[
          "text-[10px] uppercase tracking-wider",
          wsReady ? "text-ok" : "text-muted",
        ].join(" ")}
        title={wsReady ? "Connected" : "Disconnected — retrying"}
      >
        {wsReady ? "online" : "offline"}
      </span>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}
