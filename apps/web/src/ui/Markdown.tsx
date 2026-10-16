/**
 * The small slice of Markdown the assistant writes: headings, paragraphs,
 * bullet and numbered lists, pipe tables, horizontal rules, and inline bold,
 * italic and code. Built as React elements, never as HTML, so a message can't
 * inject markup. Anything else shows as plain text.
 *
 * Call site: chat/Conversation.tsx (assistant replies).
 */
import type { ReactNode } from "react";

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "rule" }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "paragraph"; lines: string[] };

const HEADING = /^(#{1,4})\s+(.*)$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    const heading = HEADING.exec(line.trim());
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length, text: heading[2]! });
      i++;
    } else if (RULE.test(line.trim())) {
      blocks.push({ kind: "rule" });
      i++;
    } else if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1]!)) {
      const header = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i]!)) rows.push(cells(lines[i++]!));
      blocks.push({ kind: "table", header, rows });
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line);
      const pattern = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i]!)) items.push(pattern.exec(lines[i++]!)![1]!);
      blocks.push({ kind: "list", ordered, items });
    } else {
      const paragraph: string[] = [];
      while (i < lines.length && lines[i]!.trim() !== "" && !HEADING.test(lines[i]!.trim()) && !RULE.test(lines[i]!.trim()) && !BULLET.test(lines[i]!) && !NUMBERED.test(lines[i]!) && !TABLE_ROW.test(lines[i]!)) {
        paragraph.push(lines[i++]!);
      }
      if (paragraph.length === 0) paragraph.push(lines[i++]!);
      blocks.push({ kind: "paragraph", lines: paragraph });
    }
  }
  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) return <code key={i}>{part.slice(1, -1)}</code>;
    if ((part.startsWith("*") && part.endsWith("*") && part.length > 2) || (part.startsWith("_") && part.endsWith("_") && part.length > 2)) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

const HEADING_TAG = ["h3", "h3", "h4", "h4", "h4"] as const;

export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      {parseBlocks(text).map((block, i) => {
        switch (block.kind) {
          case "heading": {
            const Tag = HEADING_TAG[block.level]!;
            return <Tag key={i}>{inline(block.text)}</Tag>;
          }
          case "rule":
            return <hr key={i} />;
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </Tag>
            );
          }
          case "table":
            return (
              <div key={i} className="markdown-table">
                <table>
                  <thead>
                    <tr>
                      {block.header.map((h, j) => (
                        <th key={j}>{inline(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((c, j) => (
                          <td key={j}>{inline(c)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "paragraph":
            return (
              <p key={i}>
                {block.lines.map((l, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    {inline(l)}
                  </span>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
