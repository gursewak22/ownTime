import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { layoutPages, PDF_PAGE_GAP, PDF_PAGE_WIDTH } from '../lib/pdf-layout';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type Props = {
  data: ArrayBuffer;
};

/**
 * Renders every page of a PDF as a stacked canvas at the fixed content width
 * from pdf-layout (crisp via devicePixelRatio backing store). The canvases are
 * managed imperatively inside one container so a render pass can't fight
 * React reconciliation.
 */
export function PdfPages({ data }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    // pdf.js transfers the buffer to its worker (detaching it) — hand it a
    // copy so the cached bytes stay usable for the annotated-PDF export.
    const task = pdfjs.getDocument({ data: data.slice(0) });

    (async () => {
      const doc = await task.promise;
      if (cancelled) return;

      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) pages.push(await doc.getPage(i));
      if (cancelled) return;

      const layout = layoutPages(
        pages.map((p) => {
          const v = p.getViewport({ scale: 1 });
          return { width: v.width, height: v.height };
        }),
      );

      container.innerHTML = '';
      const dpr = window.devicePixelRatio || 1;
      for (let i = 0; i < pages.length; i++) {
        const viewport = pages[i].getViewport({ scale: layout[i].scale * dpr });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${PDF_PAGE_WIDTH}px`;
        canvas.style.height = `${layout[i].height}px`;
        canvas.style.display = 'block';
        canvas.style.marginBottom = `${PDF_PAGE_GAP}px`;
        canvas.className = 'border border-border bg-white shadow-sm';
        canvas.dataset.testid = 'pdf-page';
        container.appendChild(canvas);
        await pages[i].render({ canvas, viewport }).promise;
        if (cancelled) return;
      }
    })().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to render PDF');
    });

    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [data]);

  if (error) {
    return (
      <div className="grid h-40 place-items-center text-sm text-danger">
        Couldn’t render this PDF: {error}
      </div>
    );
  }
  return <div ref={containerRef} style={{ width: PDF_PAGE_WIDTH }} />;
}
