import type { Editor } from '@tiptap/react';
import {
  Baseline,
  Bold,
  Circle,
  Code,
  Download,
  Eraser,
  FileText,
  FileUp,
  FileX2,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Lock,
  MessageSquarePlus,
  Minus,
  MousePointer2,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  PenLine,
  Quote,
  Redo2,
  Square,
  Strikethrough,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { useRef, type ComponentType } from 'react';
import { cn } from '@/lib/cn';
import { ColorWheelPopover } from './ColorWheel';
import type { DoodleMode, DrawTool } from './DoodleOverlay';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

type Props = {
  editor: Editor | null;
  readOnly: boolean;
  mode: DoodleMode;
  onModeChange: (mode: DoodleMode) => void;
  tool: DrawTool;
  onToolChange: (tool: DrawTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  penSize: number;
  onPenSizeChange: (size: number) => void;
  canUndoStroke: boolean;
  canRedoStroke: boolean;
  hasStrokes: boolean;
  onUndoStroke: () => void;
  onRedoStroke: () => void;
  onClearStrokes: () => void;
  saveStatus: SaveStatus;
  commentCount: number;
  showComments: boolean;
  onToggleComments: () => void;
  hasPdf: boolean;
  onAttachPdf: (file: File) => void;
  uploadingPdf: boolean;
  onExportPdf: () => void;
  onExportMarkdown: () => void;
  exportingPdf: boolean;
  onRemovePdf: () => void;
};

export const PEN_COLORS = ['#1f2937', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
export const PEN_SIZES = [1, 2, 4, 6, 8, 12, 16];

// Web-safe stacks only — anything here must render without loading a font.
const FONTS: { label: string; value: string }[] = [
  { label: 'Font', value: '' },
  { label: 'Sans', value: 'ui-sans-serif, system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, ui-serif, serif' },
  { label: 'Mono', value: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  { label: 'Handwriting', value: '"Comic Sans MS", "Comic Sans", cursive' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet', value: '"Trebuchet MS", Tahoma, sans-serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Palatino', value: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
  { label: 'Impact', value: 'Impact, "Arial Black", sans-serif' },
];

const FONT_SIZES = [
  '10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px', '48px',
];

const HIGHLIGHT_PRESETS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8'];

const MODES: { id: DoodleMode; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'type', label: 'Type', icon: Type },
  { id: 'draw', label: 'Draw', icon: Pencil },
  { id: 'erase', label: 'Erase', icon: Eraser },
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'comment', label: 'Comment', icon: MessageSquarePlus },
];

const TOOLS: { id: DrawTool; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'pen', label: 'Pen', icon: PenLine },
  { id: 'highlight', label: 'Highlighter', icon: Highlighter },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'circle', label: 'Circle', icon: Circle },
  { id: 'rect', label: 'Square', icon: Square },
];

const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved',
  error: 'Note was deleted',
};

export function EditorToolbar({
  editor,
  readOnly,
  mode,
  onModeChange,
  tool,
  onToolChange,
  color,
  onColorChange,
  penSize,
  onPenSizeChange,
  canUndoStroke,
  canRedoStroke,
  hasStrokes,
  onUndoStroke,
  onRedoStroke,
  onClearStrokes,
  saveStatus,
  commentCount,
  showComments,
  onToggleComments,
  hasPdf,
  onAttachPdf,
  uploadingPdf,
  onExportPdf,
  onExportMarkdown,
  exportingPdf,
  onRemovePdf,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textColor = editor ? ((editor.getAttributes('textStyle').color as string) ?? '') : '';
  const highlightColor = editor
    ? ((editor.getAttributes('highlight').color as string) ?? '')
    : '';
  // A PDF note has no text layer, so the Type mode disappears with it.
  const modes = hasPdf ? MODES.filter((m) => m.id !== 'type') : MODES;

  const commentsToggle = (commentCount > 0 || mode === 'comment') && (
    <FormatButton
      icon={showComments ? PanelRightClose : PanelRightOpen}
      label={showComments ? 'Hide comments' : `Show comments (${commentCount})`}
      active={showComments}
      onClick={onToggleComments}
    />
  );

  if (readOnly) {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <Lock className="h-3.5 w-3.5" />
          Read-only — this note is open in another panel or tab
        </span>
        <Divider />
        <FormatButton
          icon={Download}
          label={hasPdf ? 'Export annotated PDF' : 'Export as PDF'}
          disabled={exportingPdf}
          onClick={onExportPdf}
        />
        {!hasPdf && (
          <FormatButton
            icon={FileText}
            label="Export as Markdown"
            onClick={onExportMarkdown}
          />
        )}
        {commentsToggle && <Divider />}
        {commentsToggle}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
      {/* Rich-text formatting (type mode) */}
      {editor && mode === 'type' && (
        <>
          <select
            aria-label="Font family"
            title="Font family"
            className="h-7 max-w-[7.5rem] rounded border border-border bg-bg px-1 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            value={(editor.getAttributes('textStyle').fontFamily as string) ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v) editor.chain().focus().setFontFamily(v).run();
              else editor.chain().focus().unsetFontFamily().run();
            }}
          >
            {FONTS.map((f) => (
              <option key={f.label} value={f.value} style={f.value ? { fontFamily: f.value } : undefined}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Font size"
            title="Font size"
            className="h-7 rounded border border-border bg-bg px-1 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            value={(editor.getAttributes('textStyle').fontSize as string) ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v) editor.chain().focus().setFontSize(v).run();
              else editor.chain().focus().unsetFontSize().run();
            }}
          >
            <option value="">Size</option>
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {parseInt(s, 10)}
              </option>
            ))}
          </select>
          <Divider />
          <FormatButton
            icon={Bold}
            label="Bold"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <FormatButton
            icon={Italic}
            label="Italic"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <FormatButton
            icon={Strikethrough}
            label="Strikethrough"
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          />
          <Divider />
          <FormatButton
            icon={Heading1}
            label="Heading 1"
            active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          />
          <FormatButton
            icon={Heading2}
            label="Heading 2"
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          />
          <FormatButton
            icon={List}
            label="Bullet list"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <FormatButton
            icon={ListOrdered}
            label="Ordered list"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <FormatButton
            icon={Quote}
            label="Blockquote"
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
          <FormatButton
            icon={Code}
            label="Code block"
            active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          />
          <Divider />
          <ColorWheelPopover
            label="Text color"
            color={textColor || '#1f2937'}
            onChange={(hex) => editor.chain().focus().setColor(hex).run()}
            trigger={
              <span className="relative flex flex-col items-center">
                <Baseline className="h-4 w-4" />
                <span
                  className="absolute -bottom-0.5 h-1 w-4 rounded-full"
                  style={{ backgroundColor: textColor || 'currentColor' }}
                />
              </span>
            }
            extra={
              <button
                type="button"
                className="block w-full border-t border-border px-3 py-1.5 text-left text-xs text-muted hover:bg-muted/10 hover:text-fg"
                onClick={() => editor.chain().focus().unsetColor().run()}
              >
                Reset to default
              </button>
            }
          />
          <ColorWheelPopover
            label="Highlight"
            color={highlightColor || HIGHLIGHT_PRESETS[0]}
            onChange={(hex) => editor.chain().focus().setHighlight({ color: hex }).run()}
            trigger={
              <span className="relative flex flex-col items-center">
                <Highlighter className="h-4 w-4" />
                <span
                  className="absolute -bottom-0.5 h-1 w-4 rounded-full"
                  style={{ backgroundColor: highlightColor || 'currentColor' }}
                />
              </span>
            }
            extra={
              <>
                <div className="flex items-center gap-1.5 border-t border-border px-3 py-1.5">
                  {HIGHLIGHT_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Highlight ${c}`}
                      title={c}
                      onClick={() => editor.chain().focus().setHighlight({ color: c }).run()}
                      className={cn(
                        'h-5 w-5 rounded-full border-2',
                        highlightColor === c ? 'border-accent' : 'border-transparent',
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="block w-full border-t border-border px-3 py-1.5 text-left text-xs text-muted hover:bg-muted/10 hover:text-fg"
                  onClick={() => editor.chain().focus().unsetHighlight().run()}
                >
                  Remove highlight
                </button>
              </>
            }
          />
          <Divider />
          <FormatButton
            icon={Undo2}
            label="Undo"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          />
          <FormatButton
            icon={Redo2}
            label="Redo"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          />
          <Divider />
        </>
      )}

      {/* Shape tool + pen options (draw + comment modes; picking one while
          commenting hops back into draw mode so the choice is usable) */}
      {(mode === 'draw' || mode === 'comment') && (
        <>
          <div className="flex overflow-hidden rounded-md border border-border" role="tablist" aria-label="Draw tool">
            {TOOLS.map((t) => {
              const Icon = t.icon;
              const isActive = tool === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={t.label}
                  title={t.label}
                  onClick={() => {
                    onToolChange(t.id);
                    if (mode === 'comment') onModeChange('draw');
                  }}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center',
                    isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-muted/10',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
          <Divider />
          {PEN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Pen color ${c}`}
              title={`Pen color ${c}`}
              onClick={() => {
                onColorChange(c);
                if (mode === 'comment') onModeChange('draw');
              }}
              className={cn(
                'h-5 w-5 rounded-full border-2 transition-transform',
                color === c ? 'scale-110 border-accent' : 'border-transparent',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          <ColorWheelPopover
            label="Custom pen color"
            color={color}
            onChange={onColorChange}
            trigger={
              <span className="relative">
                <Palette className="h-4 w-4" />
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-bg"
                  style={{ backgroundColor: color }}
                />
              </span>
            }
          />
          <Divider />
          {PEN_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              aria-label={`Pen size ${s}`}
              title={`Pen size ${s}px`}
              onClick={() => {
                onPenSizeChange(s);
                if (mode === 'comment') onModeChange('draw');
              }}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded',
                penSize === s ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-muted/10',
              )}
            >
              <span
                className="rounded-full bg-current"
                style={{ width: s + 2, height: s + 2 }}
              />
            </button>
          ))}
          <Divider />
        </>
      )}

      {/* Drawing history */}
      {mode !== 'type' && (
        <>
          <FormatButton
            icon={Undo2}
            label="Undo stroke"
            disabled={!canUndoStroke}
            onClick={onUndoStroke}
          />
          <FormatButton
            icon={Redo2}
            label="Redo stroke"
            disabled={!canRedoStroke}
            onClick={onRedoStroke}
          />
          <FormatButton
            icon={Trash2}
            label="Clear drawing"
            disabled={!hasStrokes}
            onClick={onClearStrokes}
          />
          <Divider />
        </>
      )}

      {/* Type / Draw / Erase / Select mode toggle */}
      <div className="flex overflow-hidden rounded-md border border-border" role="tablist" aria-label="Scribe mode">
        {modes.map((m) => {
          const Icon = m.icon;
          const isActive = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              title={m.label}
              onClick={() => onModeChange(m.id)}
              className={cn(
                'flex h-7 items-center gap-1 px-2 text-xs font-medium',
                isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-muted/10',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* PDF attach / export / remove */}
      <Divider />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        data-testid="pdf-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onAttachPdf(file);
          e.target.value = '';
        }}
      />
      {hasPdf ? (
        <>
          <FormatButton
            icon={Download}
            label="Export annotated PDF"
            disabled={exportingPdf}
            onClick={onExportPdf}
          />
          <FormatButton icon={FileX2} label="Remove PDF" onClick={onRemovePdf} />
        </>
      ) : (
        <>
          <FormatButton
            icon={Download}
            label="Export as PDF"
            disabled={exportingPdf}
            onClick={onExportPdf}
          />
          <FormatButton
            icon={FileText}
            label="Export as Markdown"
            onClick={onExportMarkdown}
          />
          <FormatButton
            icon={FileUp}
            label="Attach PDF"
            disabled={uploadingPdf}
            onClick={() => fileInputRef.current?.click()}
          />
        </>
      )}

      {commentsToggle && <Divider />}
      {commentsToggle}

      <span
        className={cn(
          'ml-auto pl-2 text-[11px]',
          saveStatus === 'error' ? 'text-danger' : 'text-muted',
        )}
      >
        {uploadingPdf ? 'Uploading PDF…' : SAVE_LABEL[saveStatus]}
      </span>
    </div>
  );
}

function FormatButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded',
        active ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-muted/10 hover:text-fg',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-border" />;
}
