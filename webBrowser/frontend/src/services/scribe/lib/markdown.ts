import type { JSONContent } from '@tiptap/core';

/**
 * TipTap JSON → Markdown for the .md export. Covers everything our editor can
 * produce (StarterKit + highlight + text styling). Marks Markdown has native
 * syntax for stay pure Markdown; the rest — highlight (with its color), text
 * color, font family/size, underline — are emitted as inline HTML, which is
 * part of Markdown by design and renders in VS Code/Obsidian/Typora previews.
 * (Platforms that sanitize style attributes, like GitHub, show those runs
 * unstyled — that's a platform restriction, not lost data.)
 */
export function docToMarkdown(doc: JSONContent): string {
  const md = (doc.content ?? []).map((n) => blockToMd(n)).filter(Boolean).join('\n\n');
  return `${md.trimEnd()}\n`;
}

function blockToMd(node: JSONContent): string {
  switch (node.type) {
    case 'paragraph':
      return inlineToMd(node);
    case 'heading':
      return `${'#'.repeat((node.attrs?.level as number) ?? 1)} ${inlineToMd(node)}`;
    case 'bulletList':
      return listToMd(node, () => '- ');
    case 'orderedList': {
      const start = (node.attrs?.start as number) ?? 1;
      return listToMd(node, (i) => `${start + i}. `);
    }
    case 'blockquote':
      return (node.content ?? [])
        .map((child) => blockToMd(child))
        .join('\n\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'codeBlock': {
      const lang = (node.attrs?.language as string) ?? '';
      return `\`\`\`${lang}\n${textOf(node)}\n\`\`\``;
    }
    case 'horizontalRule':
      return '---';
    default:
      return inlineToMd(node);
  }
}

function listToMd(node: JSONContent, marker: (index: number) => string): string {
  return (node.content ?? [])
    .map((item, i) => {
      const m = marker(i);
      const indent = ' '.repeat(m.length);
      const parts = (item.content ?? []).map((child) => blockToMd(child));
      return parts
        .join('\n\n')
        .split('\n')
        .map((line, lineIdx) => (lineIdx === 0 ? m + line : indent + line))
        .join('\n');
    })
    .join('\n');
}

function inlineToMd(node: JSONContent): string {
  return (node.content ?? []).map((child) => inlineNodeToMd(child)).join('');
}

function inlineNodeToMd(node: JSONContent): string {
  if (node.type === 'hardBreak') return '  \n';
  if (node.type !== 'text') return textOf(node);

  // Collect all marks first, then wrap innermost → outermost so the pure
  // Markdown tokens end up inside the HTML wrappers (CommonMark still
  // processes emphasis within inline HTML tags).
  let href: string | null = null;
  let underline = false;
  let highlight: { color: string | null } | null = null;
  const style: string[] = [];
  const md = { code: false, bold: false, italic: false, strike: false };
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'code':
        md.code = true;
        break;
      case 'bold':
        md.bold = true;
        break;
      case 'italic':
        md.italic = true;
        break;
      case 'strike':
        md.strike = true;
        break;
      case 'link':
        href = (mark.attrs?.href as string) ?? null;
        break;
      case 'underline':
        underline = true;
        break;
      case 'highlight':
        highlight = { color: styleValue(mark.attrs?.color) };
        break;
      case 'textStyle': {
        const attrs = (mark.attrs ?? {}) as Record<string, unknown>;
        const color = styleValue(attrs.color);
        const fontFamily = styleValue(attrs.fontFamily);
        const fontSize = styleValue(attrs.fontSize);
        if (color) style.push(`color: ${color};`);
        if (fontFamily) style.push(`font-family: ${fontFamily};`);
        if (fontSize) style.push(`font-size: ${fontSize};`);
        break;
      }
    }
  }

  let text = node.text ?? '';
  if (md.code) text = `\`${text}\``;
  if (md.bold) text = `**${text}**`;
  if (md.italic) text = `*${text}*`;
  if (md.strike) text = `~~${text}~~`;
  if (href) text = `[${text}](${href})`;
  if (underline) text = `<u>${text}</u>`;
  if (highlight) {
    text = highlight.color
      ? `<mark style="background-color: ${highlight.color};">${text}</mark>`
      : `<mark>${text}</mark>`;
  }
  if (style.length > 0) text = `<span style="${style.join(' ')}">${text}</span>`;
  return text;
}

/**
 * A style attr value that actually styles something. Text pasted from other
 * apps arrives with junk values — TipTap stores `color: "inherit"` or empty
 * strings for style props the source HTML never set — and emitting those
 * would wrap every run in a useless <span>.
 */
function styleValue(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s === 'inherit' || s === 'initial' || s === 'unset' || s === 'revert') return null;
  return s;
}

function textOf(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map((child) => textOf(child)).join('');
}
