import type { ReactNode } from "react";
import { cn } from "@/lib/utils/format";

/**
 * A deliberately tiny Markdown renderer for assistant answers.
 *
 * It builds React elements rather than HTML, so there is no
 * `dangerouslySetInnerHTML` and no way for a model response (or anything
 * injected into one) to introduce markup, scripts or event handlers. Only the
 * handful of constructs models actually emit is supported: headings, bold,
 * italic, inline code, links, and ordered/unordered lists.
 *
 * Anything unrecognised is rendered as literal text, which is the safe default.
 */

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "paragraph"; text: string };

const HEADING = /^(#{1,3})\s+(.*)$/;
const UNORDERED = /^\s*[-*•]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;

/** Splits source into block-level chunks. Consecutive list rows group together. */
function toBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list && list.items.length > 0) {
      blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
    }
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      continue;
    }

    const bullet = UNORDERED.exec(line);
    const numbered = ORDERED.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet?.[1] ?? numbered?.[1] ?? "").trim());
      continue;
    }

    // A plain line continues the current list item when one is open, which is
    // how models wrap long bullets. Otherwise it joins the open paragraph.
    if (list) {
      list.items[list.items.length - 1] = `${list.items[list.items.length - 1]} ${line.trim()}`.trim();
    } else {
      paragraph.push(line.trim());
    }
  }

  flushParagraph();
  flushList();
  return blocks;
}

/** Inline spans: `code`, **bold**, *italic* and [text](url). Order matters. */
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  INLINE.lastIndex = 0;

  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (match[1]) {
      nodes.push(
        <code key={key} className="rounded bg-ink-900/8 px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (match[2]) {
      nodes.push(
        <strong key={key} className="font-semibold text-ink-900">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (match[3]) {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (match[4]) {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const href = token.slice(split + 2, -1);
      // Only http(s) and same-site paths become links; anything else (javascript:,
      // data:, mailto: to odd places) stays inert text.
      const safe = /^https?:\/\//i.test(href) || href.startsWith("/");
      nodes.push(
        safe ? (
          <a
            key={key}
            href={href}
            target={href.startsWith("/") ? undefined : "_blank"}
            rel={href.startsWith("/") ? undefined : "noopener noreferrer"}
            className="font-medium text-vermilion-700 underline underline-offset-2"
          >
            {label}
          </a>
        ) : (
          label
        ),
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * Renders assistant Markdown. `className` styles the container; spacing is
 * applied per block so short answers stay compact and long ones stay readable.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  const blocks = toBlocks(children);

  return (
    <div className={cn("space-y-2 text-sm leading-relaxed", className)}>
      {blocks.map((block, index) => {
        const key = `b-${index}`;

        if (block.kind === "heading") {
          const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
          return (
            <Tag
              key={key}
              className={cn(
                "font-display font-semibold text-ink-900",
                block.level === 1 ? "text-base" : "text-sm",
              )}
            >
              {renderInline(block.text, key)}
            </Tag>
          );
        }

        if (block.kind === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={key}
              className={cn(
                "space-y-1 ps-4",
                block.ordered ? "list-decimal" : "list-disc",
                "marker:text-ink-700/50",
              )}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </ListTag>
          );
        }

        return <p key={key}>{renderInline(block.text, key)}</p>;
      })}
    </div>
  );
}
