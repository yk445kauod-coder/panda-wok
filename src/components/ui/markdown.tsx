import { Fragment, type ReactNode } from "react";
import { parseInline, parseMarkdown, type InlineToken } from "@/lib/markdown";
import { cn } from "@/lib/utils/format";

/**
 * A deliberately tiny Markdown renderer for assistant answers.
 *
 * It builds React elements rather than HTML, so there is no
 * `dangerouslySetInnerHTML` and no way for a model response (or anything
 * injected into one) to introduce markup, scripts or event handlers.
 *
 * The parse itself lives in `@/lib/markdown`, shared with the PDF/Word/Excel
 * exporters, so a table reads the same in the chat as it does in the document
 * generated from the same answer. This module only decides how a block looks.
 *
 * Anything unrecognised is rendered as literal text, which is the safe default.
 */

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.type) {
          case "bold":
            return (
              <strong key={index} className="font-semibold text-ink-900">
                {token.text}
              </strong>
            );
          case "italic":
            return (
              <em key={index} className="italic">
                {token.text}
              </em>
            );
          case "code":
            return (
              <code key={index} className="rounded bg-ink-900/8 px-1 py-0.5 font-mono text-[0.85em]">
                {token.text}
              </code>
            );
          case "link":
            // Only http(s) and same-site paths become links; anything else
            // (javascript:, data:, …) stays inert text.
            return /^https?:\/\//i.test(token.href) || token.href.startsWith("/") ? (
              <a
                key={index}
                href={token.href}
                target={token.href.startsWith("/") ? undefined : "_blank"}
                rel={token.href.startsWith("/") ? undefined : "noopener noreferrer"}
                className="font-medium text-vermilion-700 underline underline-offset-2"
              >
                {token.text}
              </a>
            ) : (
              <Fragment key={index}>{token.text}</Fragment>
            );
          default:
            return <Fragment key={index}>{token.text}</Fragment>;
        }
      })}
    </>
  );
}

const inline = (text: string) => <Inline tokens={parseInline(text)} />;

/** Renders assistant Markdown. Spacing is per block so short answers stay compact. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  const blocks = parseMarkdown(children);

  return (
    <div className={cn("space-y-2 text-sm leading-relaxed", className)}>
      {blocks.map((block, index): ReactNode => {
        const key = `b-${index}`;
        switch (block.type) {
          case "heading": {
            const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
            return (
              <Tag
                key={key}
                className={cn(
                  "font-display font-semibold text-ink-900",
                  block.level === 1 ? "text-base" : "text-sm",
                )}
              >
                {inline(block.text)}
              </Tag>
            );
          }

          case "bullets":
            return (
              <ul key={key} className="list-disc space-y-1 ps-4 marker:text-ink-700/50">
                {block.items.map((item, i) => (
                  <li key={`${key}-${i}`}>{inline(item)}</li>
                ))}
              </ul>
            );

          case "numbers":
            return (
              <ol key={key} className="list-decimal space-y-1 ps-4 marker:text-ink-700/50">
                {block.items.map((item, i) => (
                  <li key={`${key}-${i}`}>{inline(item)}</li>
                ))}
              </ol>
            );

          case "table":
            return (
              <div key={key} className="overflow-x-auto rounded-lg border border-ink-900/12">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-ink-900/6">
                      {block.headers.map((header, i) => (
                        <th
                          key={i}
                          scope="col"
                          className="border-b border-ink-900/12 px-2.5 py-1.5 text-start font-semibold text-ink-900"
                        >
                          {inline(header)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r} className={r % 2 ? "bg-ink-900/[0.02]" : undefined}>
                        {row.map((cell, c) => (
                          <td
                            key={c}
                            className="border-b border-ink-900/8 px-2.5 py-1.5 text-ink-800 last:border-b-0"
                          >
                            {inline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "code":
            return (
              <pre
                key={key}
                className="overflow-x-auto rounded-lg bg-ink-950/90 px-3 py-2 text-xs text-rice-100"
              >
                <code className="font-mono">{block.text}</code>
              </pre>
            );

          case "note":
            return (
              <p key={key} className="text-xs italic text-ink-700">
                {inline(block.text)}
              </p>
            );

          default:
            return <p key={key}>{inline(block.text)}</p>;
        }
      })}
    </div>
  );
}
