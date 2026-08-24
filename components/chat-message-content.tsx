import type { ReactNode } from "react";

type MessageSegment = { kind: "text" | "math"; value: string };

const LATEX_SYMBOLS: Readonly<Record<string, string>> = {
  "\\approx": " ≈ ",
  "\\cdot": " · ",
  "\\ge": " ≥ ",
  "\\le": " ≤ ",
  "\\neq": " ≠ ",
  "\\pm": " ± ",
  "\\rightarrow": " → ",
  "\\to": " → ",
  "\\times": " × ",
  "\\!": "",
  "\\,": " ",
  "\\;": " ",
  "\\%": "%",
  "\\left": "",
  "\\right": "",
};

const LATEX_COMMAND_PATTERN = /\\(?:frac|text|approx|cdot|ge|le|neq|pm|rightarrow|to|times|left|right|[%!,;])/u;
const DISPLAY_MATH_PATTERN = /\\\[([\s\S]*?)(?:\\\]|$)|\$\$([\s\S]*?)(?:\$\$|$)/g;
const INLINE_TOKEN_PATTERN = /(\*\*[^*\r\n]+\*\*|\\\([^\\r\n]*?\\\))/g;

function readBalancedGroup(source: string, start: number): { content: string; nextIndex: number } | null {
  let index = start;
  while (/\s/u.test(source[index] ?? "")) index += 1;
  if (source[index] !== "{") return null;

  const contentStart = index + 1;
  let depth = 1;
  index += 1;
  while (index < source.length) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return { content: source.slice(contentStart, index), nextIndex: index + 1 };
    }
    index += 1;
  }

  return null;
}

/** Converts the small LaTeX subset emitted by Falco into readable text. */
export function normalizeChatMath(expression: string): string {
  let output = "";
  let index = 0;

  while (index < expression.length) {
    if (expression.startsWith("\\frac", index)) {
      const numerator = readBalancedGroup(expression, index + "\\frac".length);
      const denominator = numerator ? readBalancedGroup(expression, numerator.nextIndex) : null;
      if (numerator && denominator) {
        output += `${normalizeChatMath(numerator.content)} / ${normalizeChatMath(denominator.content)}`;
        index = denominator.nextIndex;
        continue;
      }
    }

    if (expression.startsWith("\\text", index)) {
      const textGroup = readBalancedGroup(expression, index + "\\text".length);
      if (textGroup) {
        const normalizedText = normalizeChatMath(textGroup.content);
        output += `${/^\s/u.test(textGroup.content) ? " " : ""}${normalizedText}${/\s$/u.test(textGroup.content) ? " " : ""}`;
        index = textGroup.nextIndex;
        continue;
      }
    }

    if (expression[index] === "\\") {
      const command = expression.slice(index).match(/^\\(?:[a-z]+|[%!,;])/iu)?.[0] ?? "";
      if (command) {
        output += LATEX_SYMBOLS[command] ?? command;
        index += command.length;
        continue;
      }
    }

    if (expression[index] !== "{" && expression[index] !== "}") output += expression[index];
    index += 1;
  }

  return output.replace(/\s+/gu, " ").trim();
}

function formatPlainText(text: string): string {
  return LATEX_COMMAND_PATTERN.test(text) ? normalizeChatMath(text) : text;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenPattern = new RegExp(INLINE_TOKEN_PATTERN.source, "g");
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(<span key={`text-${key++}`}>{formatPlainText(text.slice(cursor, match.index))}</span>);

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`bold-${key++}`} className="font-bold">
          {renderInline(token.slice(2, -2))}
        </strong>,
      );
    } else {
      nodes.push(
        <span key={`math-${key++}`} data-chat-math="inline" className="font-mono text-[0.95em]">
          {normalizeChatMath(token.slice(2, -2))}
        </span>,
      );
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) nodes.push(<span key={`text-${key}`}>{formatPlainText(text.slice(cursor))}</span>);
  return nodes;
}

function renderTextBlocks(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let unorderedItems: string[] = [];
  let orderedItems: string[] = [];

  function flushLists(index: string) {
    if (unorderedItems.length > 0) {
      nodes.push(
        <ul key={`${keyPrefix}-ul-${index}`} className="list-disc space-y-1 pl-5">
          {unorderedItems.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      unorderedItems = [];
    }
    if (orderedItems.length > 0) {
      nodes.push(
        <ol key={`${keyPrefix}-ol-${index}`} className="list-decimal space-y-1 pl-5">
          {orderedItems.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      orderedItems = [];
    }
  }

  text.split(/\r?\n/u).forEach((line, index) => {
    const trimmed = line.trim();
    const unorderedMatch = trimmed.match(/^(?:[-*])\s+(.+)$/u);
    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/u);

    if (unorderedMatch) {
      if (orderedItems.length > 0) flushLists(String(index));
      unorderedItems.push(unorderedMatch[1]);
      return;
    }
    if (orderedMatch) {
      if (unorderedItems.length > 0) flushLists(String(index));
      orderedItems.push(orderedMatch[1]);
      return;
    }

    flushLists(String(index));
    if (trimmed.length === 0) return;

    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/u);
    if (headingMatch) {
      nodes.push(
        <h3 key={`${keyPrefix}-heading-${index}`} className="font-bold">
          {renderInline(headingMatch[1])}
        </h3>,
      );
      return;
    }

    nodes.push(<p key={`${keyPrefix}-paragraph-${index}`}>{renderInline(trimmed)}</p>);
  });

  flushLists("end");
  return nodes;
}

function splitMessageSegments(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = DISPLAY_MATH_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) segments.push({ kind: "text", value: text.slice(cursor, match.index) });
    segments.push({ kind: "math", value: match[1] ?? match[2] ?? "" });
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) segments.push({ kind: "text", value: text.slice(cursor) });
  return segments;
}

export function ChatMessageContent({ text }: { text: string }) {
  const nodes: ReactNode[] = [];

  splitMessageSegments(text).forEach((segment, index) => {
    if (segment.kind === "math") {
      nodes.push(
        <div key={`math-${index}`} data-chat-math="block" role="math" className="rounded-[var(--radius-control)] bg-muted px-3 py-2 font-mono text-sm">
          {normalizeChatMath(segment.value)}
        </div>,
      );
      return;
    }

    nodes.push(...renderTextBlocks(segment.value, `segment-${index}`));
  });

  return <div className="flex flex-col gap-2">{nodes}</div>;
}
