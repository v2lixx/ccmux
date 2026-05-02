import type { Session } from "../lib/types";
import { StatusPane } from "./StatusPane";
import { VulnPane } from "./VulnPane";

export function RightColumn({ session }: { session: Session | null }) {
  return (
    <aside className="w-[340px] shrink-0 border-l border-line bg-panel flex flex-col">
      <div className="h-[42%] min-h-[180px] flex flex-col">
        <StatusPane session={session} />
      </div>
      <div className="flex-1 flex flex-col">
        <VulnPane session={session} />
      </div>
    </aside>
  );
}
