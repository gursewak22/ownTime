import type { JSONContent } from '@tiptap/core';
import { api } from '@/lib/api-client';

/** Absent kind = freehand pen (all strokes saved before shapes existed). */
export type StrokeKind = 'pen' | 'line' | 'circle' | 'rect';

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

export type ScribeNoteSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export type ScribeNote = ScribeNoteSummary & {
  doc: JSONContent;
  strokes: Stroke[];
  createdAt: string;
};

export type UpdateNoteInput = Partial<{
  title: string;
  doc: JSONContent;
  strokes: Stroke[];
}>;

export const scribeApi = {
  list: () => api<ScribeNoteSummary[]>('/scribe/notes'),
  create: (title?: string) =>
    api<ScribeNote>('/scribe/notes', { method: 'POST', body: title ? { title } : {} }),
  get: (id: string) => api<ScribeNote>(`/scribe/notes/${id}`),
  update: (id: string, input: UpdateNoteInput) =>
    api<ScribeNoteSummary>(`/scribe/notes/${id}`, { method: 'PATCH', body: input }),
  delete: (id: string) => api<void>(`/scribe/notes/${id}`, { method: 'DELETE' }),
};
