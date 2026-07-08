import type { JSONContent } from '@tiptap/core';
import { api, apiBinary } from '@/lib/api-client';

/**
 * Absent kind = freehand pen (all strokes saved before shapes existed).
 * 'highlight' is freehand too, but rendered as a wide translucent marker.
 */
export type StrokeKind = 'pen' | 'line' | 'circle' | 'rect' | 'highlight';

/**
 * One doodle stroke. Points are integer px in the note's content box.
 * Shapes (line/circle/rect) store exactly [start, end] of the drag; circle and
 * rect are drawn inside that bounding box.
 */
export type Stroke = {
  id: string;
  color: string;
  size: number;
  kind?: StrokeKind;
  points: [number, number][];
};

/** A comment pinned to a point in the note's content box (px coordinates). */
export type ScribeComment = {
  id: string;
  x: number;
  y: number;
  text: string;
  createdAt: string;
};

export type ScribeNoteSummary = {
  id: string;
  title: string;
  /** Set when a PDF is attached — the note is then a PDF annotation canvas. */
  pdfName: string | null;
  updatedAt: string;
};

export type ScribeNote = ScribeNoteSummary & {
  doc: JSONContent;
  strokes: Stroke[];
  comments: ScribeComment[];
  createdAt: string;
};

export type UpdateNoteInput = Partial<{
  title: string;
  doc: JSONContent;
  strokes: Stroke[];
  comments: ScribeComment[];
}>;

export const scribeApi = {
  list: () => api<ScribeNoteSummary[]>('/scribe/notes'),
  create: (title?: string) =>
    api<ScribeNote>('/scribe/notes', { method: 'POST', body: title ? { title } : {} }),
  get: (id: string) => api<ScribeNote>(`/scribe/notes/${id}`),
  update: (id: string, input: UpdateNoteInput) =>
    api<ScribeNoteSummary>(`/scribe/notes/${id}`, { method: 'PATCH', body: input }),
  delete: (id: string) => api<void>(`/scribe/notes/${id}`, { method: 'DELETE' }),
  uploadPdf: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api<ScribeNoteSummary>(`/scribe/notes/${id}/pdf`, { method: 'POST', body: form });
  },
  getPdf: (id: string) => apiBinary(`/scribe/notes/${id}/pdf`),
  removePdf: (id: string) =>
    api<ScribeNoteSummary>(`/scribe/notes/${id}/pdf`, { method: 'DELETE' }),
};
