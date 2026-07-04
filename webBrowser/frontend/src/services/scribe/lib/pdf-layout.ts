/**
 * Shared page-stack geometry for PDF notes. The on-screen renderer
 * (PdfPages) and the annotated-PDF exporter (pdf-export) must agree exactly
 * on where each page sits in the content box — strokes are stored in content
 * pixels, and the exporter maps them back onto pages with this same math.
 *
 * Pages render at a FIXED pixel width regardless of panel size, so stroke
 * coordinates stay glued to the page content (the panel scrolls horizontally
 * if it's narrower).
 */

export const PDF_PAGE_WIDTH = 800;
export const PDF_PAGE_GAP = 12;

export type PageBox = {
  /** y of the page's top edge in content px */
  top: number;
  /** rendered page height in content px */
  height: number;
  /** content px per PDF point for this page */
  scale: number;
};

/** `sizes` are the pages' intrinsic PDF dimensions in points. */
export function layoutPages(sizes: { width: number; height: number }[]): PageBox[] {
  let top = 0;
  return sizes.map((s) => {
    const scale = PDF_PAGE_WIDTH / s.width;
    const height = Math.round(s.height * scale);
    const box = { top, height, scale };
    top += height + PDF_PAGE_GAP;
    return box;
  });
}

/** Index of the page a content-space y coordinate belongs to (gaps and overflow clamp to the nearest page). */
export function pageIndexAt(layout: PageBox[], y: number): number {
  for (let i = 0; i < layout.length; i++) {
    if (y < layout[i].top + layout[i].height + PDF_PAGE_GAP / 2) return i;
  }
  return layout.length - 1;
}
