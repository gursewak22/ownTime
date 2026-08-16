import type { TiptapDoc } from './scribe-client';

// Markdown → TipTap/ProseMirror JSON. The inverse of the UI's docToMarkdown
// export (services/ui/src/services/scribe/lib/markdown.ts), covering the same
// StarterKit subset so what the agent writes round-trips cleanly back out as
// .md. Hand-rolled on purpose — no parser dependency, matching the export's
// approach — so it targets the well-formed Markdown an LLM produces, not every
// CommonMark edge case.

type TextNode = { type: 'text'; text: string; marks?: { type: string; attrs?: object }[] };
type Node = { type: string; attrs?: object; content?: unknown[]; text?: string; marks?: unknown[] };

/** Convert a Markdown string to a TipTap doc. Empty input → one empty paragraph. */
export function markdownToDoc(markdown: string): TiptapDoc {
  const content = parseBlocks(markdown.replace(/\r\n?/g, '\n').split('\n'));
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function parseBlocks(lines: string[]): Node[] {
  const blocks: Node[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // blank line — skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // fenced code block
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})\s*(\S*)/);
    if (fence) {
      const marker = fence[1][0];
      const lang = fence[2] ?? '';
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${marker}{3,}\\s*$`).test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume closing fence (or EOF)
      blocks.push({
        type: 'codeBlock',
        attrs: { language: lang || null },
        content: body.length ? [{ type: 'text', text: body.join('\n') }] : [],
      });
      continue;
    }

    // ATX heading
    const heading = line.match(/^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: parseInline(heading[2]),
      });
      i++;
      continue;
    }

    // horizontal rule
    if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    // blockquote — gather consecutive `>` lines, recurse on the stripped body
    if (/^ {0,3}>/.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) {
        inner.push(lines[i].replace(/^ {0,3}>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', content: parseBlocks(inner) });
      continue;
    }

    // list (bullet or ordered)
    if (/^ {0,3}([-*+]|\d+[.)])\s+/.test(line)) {
      const [list, next] = parseList(lines, i);
      blocks.push(list);
      i = next;
      continue;
    }

    // paragraph — consecutive non-blank lines that don't start another block
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !startsNewBlock(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', content: parseInline(para.join('\n')) });
  }

  return blocks;
}

function startsNewBlock(line: string): boolean {
  return (
    /^ {0,3}(`{3,}|~{3,})/.test(line) ||
    /^ {0,3}#{1,6}\s/.test(line) ||
    /^ {0,3}>/.test(line) ||
    /^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(line) ||
    /^ {0,3}([-*+]|\d+[.)])\s+/.test(line)
  );
}

function parseList(lines: string[], start: number): [Node, number] {
  const first = lines[start].match(/^ {0,3}([-*+]|\d+[.)])\s+/)!;
  const ordered = /\d/.test(first[1]);
  const items: Node[] = [];
  let i = start;
  let current: string[] | null = null;

  const flush = () => {
    if (current) items.push({ type: 'listItem', content: parseBlocks(current) });
    current = null;
  };

  while (i < lines.length) {
    const line = lines[i];
    const marker = line.match(/^ {0,3}([-*+]|\d+[.)])\s+(.*)$/);
    const sameKind =
      marker && ordered === /\d/.test(marker[1]);
    if (sameKind) {
      flush();
      current = [marker![2]];
      i++;
    } else if (line.trim() === '') {
      // blank line: could end the list or separate item blocks — peek ahead
      if (i + 1 < lines.length && /^ {2,}\S/.test(lines[i + 1]) && current) {
        current.push('');
        i++;
      } else {
        break;
      }
    } else if (/^ {2,}\S/.test(line) && current) {
      // continuation / nested content indented under the item
      current.push(line.replace(/^ {2}/, ''));
      i++;
    } else {
      break;
    }
  }
  flush();

  const node: Node = {
    type: ordered ? 'orderedList' : 'bulletList',
    content: items,
  };
  if (ordered) {
    const startNum = parseInt(first[1], 10);
    node.attrs = { start: Number.isNaN(startNum) ? 1 : startNum };
  }
  return [node, i];
}

// --- inline -----------------------------------------------------------------

/** Parse inline Markdown into TipTap text nodes. Hard breaks become hardBreak. */
function parseInline(text: string): unknown[] {
  const out: unknown[] = [];
  // A trailing "  \n" (two spaces + newline) or "\n" inside a paragraph is a
  // hard break; split on newlines and interleave hardBreak nodes.
  const segments = text.split('\n');
  segments.forEach((seg, idx) => {
    for (const node of tokenizeInline(seg.replace(/ +$/, ''))) out.push(node);
    if (idx < segments.length - 1) out.push({ type: 'hardBreak' });
  });
  return out;
}

type Rule = { re: RegExp; mark?: (m: RegExpExecArray) => { type: string; attrs?: object }; terminal?: boolean };

// Ordered so double-char markers win over single-char at the same position.
const RULES: Rule[] = [
  { re: /`([^`]+)`/, mark: () => ({ type: 'code' }), terminal: true },
  { re: /\*\*([^*]+)\*\*/, mark: () => ({ type: 'bold' }) },
  { re: /__([^_]+)__/, mark: () => ({ type: 'bold' }) },
  { re: /~~([^~]+)~~/, mark: () => ({ type: 'strike' }) },
  { re: /\[([^\]]+)\]\(([^)\s]+)\)/, mark: (m) => ({ type: 'link', attrs: { href: m[2] } }) },
  { re: /\*([^*]+)\*/, mark: () => ({ type: 'italic' }) },
  { re: /_([^_]+)_/, mark: () => ({ type: 'italic' }) },
];

function tokenizeInline(text: string): TextNode[] {
  if (text === '') return [];

  // Find the earliest matching rule (ties broken by RULES order → bold/strike
  // before italic).
  let best: { rule: Rule; m: RegExpExecArray } | null = null;
  for (const rule of RULES) {
    const m = new RegExp(rule.re.source).exec(text);
    if (m && (best === null || m.index < best.m.index)) best = { rule, m };
  }

  if (!best) return [plain(text)];

  const { rule, m } = best;
  const nodes: TextNode[] = [];
  if (m.index > 0) nodes.push(plain(text.slice(0, m.index)));

  const inner = m[1];
  const mark = rule.mark!(m);
  const innerNodes = rule.terminal ? [plain(inner)] : tokenizeInline(inner);
  for (const node of innerNodes) nodes.push(addMark(node, mark));

  const rest = text.slice(m.index + m[0].length);
  for (const node of tokenizeInline(rest)) nodes.push(node);
  return nodes;
}

function plain(text: string): TextNode {
  return { type: 'text', text };
}

function addMark(node: TextNode, mark: { type: string; attrs?: object }): TextNode {
  // Don't duplicate a mark type; keep the outermost occurrence's attrs.
  const marks = node.marks ?? [];
  if (marks.some((x) => x.type === mark.type)) return node;
  return { ...node, marks: [...marks, mark] };
}
