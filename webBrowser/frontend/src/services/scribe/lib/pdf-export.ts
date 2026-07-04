import {
  LineCapStyle,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFString,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFRef,
} from 'pdf-lib';
import type { PDFPage, RGB } from 'pdf-lib';
import type { ScribeComment, Stroke } from '../api';
import { orderComments } from '../components/Comments';
import { layoutPages, pageIndexAt, type PageBox } from './pdf-layout';
import { strokeToPath } from './strokes';

const HIGHLIGHT_OPACITY = 0.4;

/**
 * Burns the note's strokes into a copy of the original PDF and returns it as
 * a downloadable blob. Strokes live in content px (the fixed-width page
 * stack from pdf-layout); each is assigned to the page under its bounding-box
 * center and converted to that page's point coordinates. Comments become
 * standard sticky-note annotations, so real PDF viewers show them.
 *
 * Known limitation (accepted): pages with a /Rotate entry are annotated in
 * their unrotated coordinate space, so strokes may appear rotated there.
 */
export async function exportAnnotatedPdf(
  original: ArrayBuffer,
  strokes: Stroke[],
  comments: ScribeComment[] = [],
): Promise<Blob> {
  const doc = await PDFDocument.load(original);
  const pages = doc.getPages();
  const layout = layoutPages(
    pages.map((p) => ({ width: p.getWidth(), height: p.getHeight() })),
  );

  drawStrokes(pages, layout, strokes);
  await addCommentAnnotations(doc, pages, layout, comments);

  return saveToBlob(doc);
}

/**
 * PDF export for a plain text note: the rendered note (the editor's content
 * box) is rasterized with html2canvas and sliced into US-Letter pages, then
 * the strokes and comments are laid over it with the same shared geometry —
 * so the export looks exactly like the note on screen, doodles included.
 */
export async function exportNotePdf(
  content: HTMLElement,
  strokes: Stroke[],
  comments: ScribeComment[] = [],
): Promise<Blob> {
  const { default: html2canvas } = await import('html2canvas');
  const contentWidth = Math.max(1, content.offsetWidth);
  const canvas = await html2canvas(content, {
    scale: 2,
    backgroundColor: '#ffffff',
    logging: false,
    // The doodle overlay and pins are drawn as vectors / annotations below —
    // don't bake them into the raster.
    ignoreElements: (el) => {
      const t = el.getAttribute('data-testid');
      return t === 'doodle-overlay' || t === 'comment-pin' || t === 'comment-pin-draft';
    },
  });

  const doc = await PDFDocument.create();
  const PAGE_W = 612;
  const PAGE_H = 792;
  const pxPerPt = contentWidth / PAGE_W; // PageBox.scale: content px per point
  const deviceScale = canvas.width / contentWidth;
  const pageHeightPx = PAGE_H * pxPerPt;
  const totalHeightPx = canvas.height / deviceScale;
  const pageCount = Math.max(1, Math.ceil(totalHeightPx / pageHeightPx));

  const pages: PDFPage[] = [];
  const layout: PageBox[] = [];
  for (let i = 0; i < pageCount; i++) {
    const top = i * pageHeightPx;
    const sliceHeightPx = Math.min(pageHeightPx, totalHeightPx - top);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.max(1, Math.round(sliceHeightPx * deviceScale));
    const ctx = slice.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(
      canvas,
      0,
      Math.round(top * deviceScale),
      canvas.width,
      slice.height,
      0,
      0,
      canvas.width,
      slice.height,
    );
    const png = await doc.embedPng(slice.toDataURL('image/png'));
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const heightPt = sliceHeightPx / pxPerPt;
    page.drawImage(png, { x: 0, y: PAGE_H - heightPt, width: PAGE_W, height: heightPt });
    pages.push(page);
    layout.push({ top, height: sliceHeightPx, scale: pxPerPt });
  }

  drawStrokes(pages, layout, strokes);
  await addCommentAnnotations(doc, pages, layout, comments);

  return saveToBlob(doc);
}

function drawStrokes(pages: PDFPage[], layout: PageBox[], strokes: Stroke[]): void {
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    const ys = stroke.points.map((p) => p[1]);
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const idx = pageIndexAt(layout, centerY);
    const { top, scale } = layout[idx];
    const page = pages[idx];

    const local: Stroke = {
      ...stroke,
      points: stroke.points.map(([x, y]) => [x / scale, (y - top) / scale]),
    };
    // pdf-lib's SVG-path parser handles M/L/H/V/Q/Z but arcs are unreliable —
    // circles get a cubic-bezier ellipse instead of strokeToPath's A commands.
    const d = stroke.kind === 'circle' ? ellipsePath(local) : strokeToPath(local);
    if (!d) continue;

    const isHighlight = stroke.kind === 'highlight';
    page.drawSvgPath(d, {
      x: 0,
      y: page.getHeight(), // SVG y-down origin at the page's top-left
      borderColor: hexToRgb(stroke.color),
      borderWidth: stroke.size / scale,
      borderLineCap: isHighlight ? LineCapStyle.Butt : LineCapStyle.Round,
      borderOpacity: isHighlight ? HIGHLIGHT_OPACITY : 1,
    });
  }
}

/**
 * Comments → /Text ("sticky note") annotations at their pinned spot, each
 * with a custom appearance stream: a numbered indigo pin matching the
 * in-app markers. Without /AP, viewers fall back to their own icon (a plain
 * yellow box in macOS Preview). Numbering follows the app's reading order,
 * so pin 2 in the PDF is comment 2 in the sidebar.
 */
async function addCommentAnnotations(
  doc: PDFDocument,
  pages: PDFPage[],
  layout: PageBox[],
  comments: ScribeComment[],
): Promise<void> {
  const ordered = orderComments(comments);
  const pinFont = ordered.some((c) => c.text.trim())
    ? await doc.embedFont(StandardFonts.Helvetica)
    : null;
  ordered.forEach((comment, i) => {
    if (!comment.text.trim() || !pinFont) return;
    const idx = pageIndexAt(layout, comment.y);
    const { top, scale } = layout[idx];
    const page = pages[idx];
    // Center the icon on the pinned point, like the in-app pin.
    const cx = comment.x / scale;
    const cy = page.getHeight() - (comment.y - top) / scale; // PDF y-axis points up
    const half = PIN_SIZE / 2;
    const appearance = makePinAppearance(doc, pinFont, String(i + 1));
    // Mirror the structure Acrobat writes for its own sticky notes — that's
    // the shape every viewer (especially macOS Preview) is tested against:
    // /Text annot with metadata + a /Popup child holding the note window.
    const now = pdfDate(new Date());
    const annotDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [cx - half, cy - half, cx + half, cy + half],
      Contents: PDFString.of(comment.text),
      T: PDFString.of('Scribe'),
      Subj: PDFString.of('Comment'),
      NM: PDFString.of(comment.id),
      M: PDFString.of(now),
      CreationDate: PDFString.of(pdfDate(new Date(comment.createdAt))),
      Name: 'Comment',
      // Viewers use /C for their note-window background (Preview paints the
      // whole opened note with it) — keep it a pale tint, NOT the pin color,
      // or the note opens as a giant solid indigo block.
      C: NOTE_WINDOW_COLOR,
      // Acrobat's exact sticky-note flags: print + no-zoom + no-rotate.
      // Deliberately NOT Locked (128): macOS Preview refuses to open Locked
      // annotations at all, which is worse than a draggable pin.
      F: 4 | 8 | 16,
      AP: { N: appearance },
    }) as PDFDict;
    const annotRef = doc.context.register(annotDict);
    const popupW = 180;
    const popupH = 70;
    const px = Math.max(4, Math.min(cx + half + 2, page.getWidth() - popupW - 4));
    const py = Math.min(page.getHeight() - 4, Math.max(popupH + 4, cy + half));
    const popupRef = doc.context.register(
      doc.context.obj({
        Type: 'Annot',
        Subtype: 'Popup',
        Rect: [px, py - popupH, px + popupW, py],
        Parent: annotRef,
        Open: false,
      }),
    );
    annotDict.set(PDFName.of('Popup'), popupRef);
    const existing = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (existing) {
      existing.push(annotRef);
      existing.push(popupRef);
    } else {
      page.node.set(PDFName.of('Annots'), doc.context.obj([annotRef, popupRef]));
    }
  });
}

async function saveToBlob(doc: PDFDocument): Promise<Blob> {
  // Copy into a fresh ArrayBuffer-backed view; Blob rejects ArrayBufferLike.
  const bytes = new Uint8Array(await doc.save());
  return new Blob([bytes.buffer], { type: 'application/pdf' });
}

/** In-app pin accent, rgb(79 70 229) — keep in sync with --accent in index.css. */
const PIN_COLOR = '0.3098 0.2745 0.898';
/** Pale indigo tint for the viewer's opened-note window (/C). */
const NOTE_WINDOW_COLOR = [0.94, 0.94, 0.99];
const PIN_SIZE = 14;
const PIN_OPACITY = 0.65;

/**
 * Form XObject drawing the pin icon: a small, semi-transparent indigo speech
 * bubble (rounded rectangle + tail) with a centered white number. Rounded
 * corners are cubic-bézier quarter arcs (kappa · r control offset).
 */
function makePinAppearance(doc: PDFDocument, font: PDFFont, label: string): PDFRef {
  // Bubble body spans x 1..13, y 4..13 (of a 14×14 box); tail points down-left.
  const [x1, y1, x2, y2] = [1, 4, PIN_SIZE - 1, PIN_SIZE - 1];
  const r = 2;
  const k = r * 0.5522847498;
  const n = (v: number) => v.toFixed(3);
  const fontSize = label.length > 1 ? 5 : 6;
  const cx = (x1 + x2) / 2;
  const tx = cx - font.widthOfTextAtSize(label, fontSize) / 2;
  // Helvetica cap height ≈ 0.717em; center the digits inside the bubble body.
  const ty = y1 + (y2 - y1 - 0.717 * fontSize) / 2;
  const ops = [
    'q',
    '/GS1 gs', // semi-transparent fill
    `${PIN_COLOR} rg`,
    // rounded-rect bubble body
    `${n(x1 + r)} ${n(y1)} m`,
    `${n(x2 - r)} ${n(y1)} l`,
    `${n(x2 - r + k)} ${n(y1)} ${n(x2)} ${n(y1 + r - k)} ${n(x2)} ${n(y1 + r)} c`,
    `${n(x2)} ${n(y2 - r)} l`,
    `${n(x2)} ${n(y2 - r + k)} ${n(x2 - r + k)} ${n(y2)} ${n(x2 - r)} ${n(y2)} c`,
    `${n(x1 + r)} ${n(y2)} l`,
    `${n(x1 + r - k)} ${n(y2)} ${n(x1)} ${n(y2 - r + k)} ${n(x1)} ${n(y2 - r)} c`,
    `${n(x1)} ${n(y1 + r)} l`,
    `${n(x1)} ${n(y1 + r - k)} ${n(x1 + r - k)} ${n(y1)} ${n(x1 + r)} ${n(y1)} c`,
    'h',
    // tail
    `${n(x1 + 2.5)} ${n(y1 + 0.4)} m`,
    `${n(x1 + 1.2)} 1 l`,
    `${n(x1 + 6)} ${n(y1 + 0.4)} l`,
    'h',
    'f',
    '1 1 1 rg',
    'BT',
    `/F1 ${fontSize} Tf`,
    `${n(tx)} ${n(ty)} Td`,
    `(${label}) Tj`,
    'ET',
    'Q',
  ].join('\n');
  return doc.context.register(
    doc.context.stream(ops, {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, PIN_SIZE, PIN_SIZE],
      Resources: {
        Font: { F1: font.ref },
        ExtGState: { GS1: { Type: 'ExtGState', ca: PIN_OPACITY, CA: PIN_OPACITY } },
      },
    }),
  );
}

function ellipsePath(stroke: Stroke): string {
  const xs = stroke.points.map((p) => p[0]);
  const ys = stroke.points.map((p) => p[1]);
  const x1 = Math.min(...xs);
  const y1 = Math.min(...ys);
  const x2 = Math.max(...xs);
  const y2 = Math.max(...ys);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = (x2 - x1) / 2;
  const ry = (y2 - y1) / 2;
  const ox = rx * 0.5522847498; // kappa: cubic approximation of a quarter arc
  const oy = ry * 0.5522847498;
  return (
    `M ${x1} ${cy} ` +
    `C ${x1} ${cy - oy} ${cx - ox} ${y1} ${cx} ${y1} ` +
    `C ${cx + ox} ${y1} ${x2} ${cy - oy} ${x2} ${cy} ` +
    `C ${x2} ${cy + oy} ${cx + ox} ${y2} ${cx} ${y2} ` +
    `C ${cx - ox} ${y2} ${x1} ${cy + oy} ${x1} ${cy} Z`
  );
}

/** PDF date string (D:YYYYMMDDHHmmSS, UTC) for annotation M/CreationDate. */
function pdfDate(d: Date): string {
  const p = (v: number, len = 2) => String(v).padStart(len, '0');
  return (
    `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return rgb(0, 0, 0);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
