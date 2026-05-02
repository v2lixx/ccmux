import { useEffect, useRef } from "react";
import hljs from "highlight.js/lib/common";
import { CopyButton } from "./CopyButton";

export function CodeBlock({ source, language }: { source: string; language: string }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.removeAttribute("data-highlighted");
    delete (ref.current.dataset as Record<string, string>).highlighted;
    try {
      hljs.highlightElement(ref.current);
    } catch {
      /* unknown language -> render plain */
    }
  }, [source, language]);

  return (
    <div className="group relative h-full">
      <pre className="codeblock scrollbar">
        <code ref={ref} className={`hljs language-${language}`}>{source}</code>
      </pre>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={source} />
      </div>
    </div>
  );
}
