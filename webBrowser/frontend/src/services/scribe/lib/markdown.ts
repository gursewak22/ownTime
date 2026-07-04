import type { JSONContent } from '@tiptap/core';

/**
 * TipTap JSON → Markdown for the .md export. Covers everything our editor can
 * produce (StarterKit + highlight). Styling that Markdown can't express —
 * text color, font family/size — is dropped; highlight becomes `==text==`
 * (the common extended-Markdown marker).
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
  let text = node.text ?? '';
  let href: string | null = null;
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'code':
        text = `\`${text}\``;
        break;
      case 'bold':
        text = `**${text}**`;
        break;
      case 'italic':
        text = `*${text}*`;
        break;
      case 'strike':
        text = `~~${text}~~`;
        break;
      case 'highlight':
        text = `==${text}==`;
        break;
      case 'link':
        href = (mark.attrs?.href as string) ?? null;
        break;
      // textStyle (color/font/size) and underline have no Markdown form
    }
  }
  return href ? `[${text}](${href})` : text;
}

function textOf(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map((child) => textOf(child)).join('');
}
