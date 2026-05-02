import { Children, isValidElement } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { CopyButton } from "./CopyButton";

function getCodeText(children: ReactNode): string {
  let acc = "";
  Children.forEach(children, (child) => {
    if (typeof child === "string") acc += child;
    else if (typeof child === "number") acc += String(child);
    else if (isValidElement<{ children?: ReactNode }>(child)) {
      acc += getCodeText(child.props.children);
    }
  });
  return acc;
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          a: ({ href, children, ...rest }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
              {children}
            </a>
          ),
          // Wrap fenced code blocks in a relative container with a hover-shown copy button.
          pre: ({ children, ...rest }) => {
            const text = getCodeText(children);
            return (
              <div className="group relative">
                <pre {...rest}>{children}</pre>
                <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <CopyButton text={text} />
                </div>
              </div>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
