// The CMS's Markdown editor: CodeMirror with optional vim keys, in the site's colours.
// Bundled into editor.js by `npm run cms:vendor` (in tools/), which is committed so the CMS needs no build step.
import { EditorView, minimalSetup } from 'codemirror';
import { Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { vim, Vim } from '@replit/codemirror-vim';

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--c4)', backgroundColor: 'transparent', fontSize: '16px' },
  '.cm-scroller': { fontFamily: 'var(--font)', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--accent)', padding: '12px 0' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '.cm-fat-cursor': { background: 'var(--accent) !important', color: 'var(--c0) !important' },
  '&:not(.cm-focused) .cm-fat-cursor': { background: 'none !important', outline: '1px solid var(--accent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--c2) !important' },
  '.cm-panels': { background: 'var(--c1)', color: 'var(--c4)' },
  '.cm-vim-panel input': { color: 'var(--c4)', fontFamily: 'var(--font)' },
}, { dark: true });

const colours = HighlightStyle.define([
  { tag: t.heading, color: 'var(--c4)', fontWeight: 'bold' },
  { tag: [t.link, t.url], color: 'var(--link)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: [t.monospace, t.quote], color: 'var(--c3)' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator, t.list], color: 'var(--accent)' },
]);

// createEditor(parent, { doc, vimMode, onChange(text), onFiles(files), onSave() }) → { get, set(text), insert(text), setVim(on) }
export function createEditor(parent, { doc = '', vimMode = false, onChange, onFiles, onSave }) {
  const vimSlot = new Compartment();  // vim has to come before the other keymaps
  Vim.defineEx('write', 'w', () => onSave?.());  // :w saves now (it autosaves anyway)
  const files = (list, e) => { if (list?.length && [...list].some((f) => f.type.startsWith('image/'))) { e.preventDefault(); onFiles([...list]); return true; } };
  const view = new EditorView({
    parent,
    doc,
    extensions: [
      vimSlot.of(vimMode ? vim() : []),
      minimalSetup,
      EditorView.lineWrapping,
      markdown(),
      theme,
      syntaxHighlighting(colours),
      EditorView.updateListener.of((u) => { if (u.docChanged) onChange(view.state.doc.toString()); }),
      EditorView.domEventHandlers({ paste: (e) => files(e.clipboardData?.files, e), drop: (e) => files(e.dataTransfer?.files, e) }),
    ],
  });
  return {
    view,
    get: () => view.state.doc.toString(),
    // replace the whole text (an outside save), keeping the cursor about where it was
    set: (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: Math.min(view.state.selection.main.head, text.length) } }),
    insert: (text) => { const { from, to } = view.state.selection.main; view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } }); view.focus(); },
    setVim: (on) => view.dispatch({ effects: vimSlot.reconfigure(on ? vim() : []) }),
  };
}
