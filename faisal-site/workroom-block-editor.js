import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import DragHandle from '@tiptap/extension-drag-handle';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';

const blocks = [
  ['Paragraf', 'text paragraph', chain => chain.setParagraph()],
  ['Judul 1', 'heading h1', chain => chain.setHeading({ level: 1 })],
  ['Judul 2', 'heading h2', chain => chain.setHeading({ level: 2 })],
  ['Daftar bullet', 'list unordered', chain => chain.toggleBulletList()],
  ['Daftar bernomor', 'list numbered ordered', chain => chain.toggleOrderedList()],
  ['Checklist', 'todo tugas checkbox', chain => chain.toggleTaskList()],
  ['Kutipan', 'quote', chain => chain.toggleBlockquote()],
  ['Blok kode', 'code', chain => chain.toggleCodeBlock()],
  ['Pemisah', 'divider garis', chain => chain.setHorizontalRule()],
  ['Gambar', 'image foto', (chain, url) => chain.setImage({ src: url, alt: 'Gambar' })],
  ['Tabel', 'table', chain => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true })],
];

const allowedImage = src => typeof src === 'string' && /^https:\/\/[^\s]+$/i.test(src);
const SafeImage = Image.extend({
  parseHTML() {
    return [{ tag: 'img[src]', getAttrs: el => allowedImage(el.getAttribute('src')) ? null : false }];
  },
});

export function mountBlockEditor(root, content, onChange) {
  const popup = document.createElement('div');
  popup.className = 'note-block-menu';
  popup.setAttribute('role', 'listbox');
  popup.setAttribute('aria-label', 'Jenis blok');
  popup.hidden = true;
  const handle = document.createElement('span');
  handle.className = 'note-block-handle';
  handle.textContent = '⋮⋮';
  handle.title = 'Geser blok';
  handle.setAttribute('aria-hidden', 'true');
  let match;
  let choices = [];
  let active = 0;
  let manual = false;

  function close() {
    match = undefined;
    manual = false;
    popup.hidden = true;
  }

  function choose(block) {
    const command = match;
    const url = block[0] === 'Gambar' ? prompt('URL gambar (HTTPS)')?.trim() : undefined;
    if (block[0] === 'Gambar' && !allowedImage(url)) return close();
    close();
    const chain = editor.chain().focus();
    if (command) {
      chain.deleteRange({ from: command.from, to: command.to });
      if (command.insertAfter) {
        const pos = command.insertAfter - (command.to - command.from);
        chain.insertContentAt(pos, { type: 'paragraph' }).setTextSelection(pos + 1);
      }
    }
    block[2](chain, url).run();
  }

  function draw(reset = false) {
    const { selection } = editor.state;
    const { $from } = selection;
    const before = $from.parent.isTextblock ? $from.parent.textBetween(0, $from.parentOffset, '\n', '\uFFFC') : '';
    const slash = !manual && selection.empty && $from.depth === 1 && $from.parent.type.name !== 'codeBlock'
      ? /(?:^|\s)\/([\p{L}\p{N} -]*)$/u.exec(before) : null;
    if (!manual && !slash) return close();
    const filter = slash ? slash[1].trim().toLowerCase() : '';
    const rangeStart = slash ? selection.from - slash[1].length - 1 : selection.from;
    const remainder = slash && (before.slice(0, -slash[1].length - 1).trim() || $from.parentOffset < $from.parent.content.size);
    match = slash ? { from: rangeStart, to: selection.from, insertAfter: remainder ? $from.after(1) : 0 } : undefined;
    choices = blocks.filter(([label, aliases]) => (label.toLowerCase() + ' ' + aliases).includes(filter));
    if (reset || active >= choices.length) active = 0;
    popup.replaceChildren(...choices.map((block, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.tabIndex = -1;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === active));
      button.textContent = block[0];
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => choose(block));
      return button;
    }));
    if (!choices.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Blok tidak ditemukan';
      popup.append(empty);
    }
    popup.hidden = false;
    const caret = editor.view.coordsAtPos(selection.from);
    popup.style.left = Math.max(8, Math.min(caret.left, window.innerWidth - popup.offsetWidth - 8)) + 'px';
    const above = caret.bottom + popup.offsetHeight > window.innerHeight && caret.top > popup.offsetHeight;
    popup.style.top = Math.max(8, above ? caret.top - popup.offsetHeight : caret.bottom + 4) + 'px';
    const option = popup.children[active];
    if (option && choices.length) {
      if (option.offsetTop < popup.scrollTop) popup.scrollTop = option.offsetTop;
      if (option.offsetTop + option.offsetHeight > popup.scrollTop + popup.clientHeight) {
        popup.scrollTop = option.offsetTop + option.offsetHeight - popup.clientHeight;
      }
    }
  }

  let editor;
  editor = new Editor({
    element: root,
    content,
    injectCSS: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, defaultProtocol: 'https' } }),
      TaskList, TaskItem.configure({ nested: true }), TableKit, TextStyleKit, Superscript, Subscript,
      SafeImage.configure({ allowBase64: false, HTMLAttributes: { loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' } }),
      DragHandle.configure({ render: () => handle, computePositionConfig: { placement: 'left-start' } }),
    ],
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': 'Isi catatan', 'aria-multiline': 'true' },
      handleKeyDown(_view, event) {
        if (popup.hidden) return false;
        if (event.key === 'Escape') { close(); return true; }
        if (event.key === 'Enter' && choices.length) { choose(choices[active]); return true; }
        if (choices.length && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
          active = (active + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
          draw();
          return true;
        }
        return false;
      },
    },
    onTransaction({ transaction }) {
      if (editor && (transaction.docChanged || transaction.selectionSet)) draw(transaction.docChanged);
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });
  document.body.append(popup);
  const dismiss = event => { if (!root.contains(event.target) && !popup.contains(event.target) && !event.target.closest('[data-mark="blocks"]')) close(); };
  document.addEventListener('pointerdown', dismiss);
  return {
    editor,
    showBlocks() { manual = true; editor.commands.focus(); draw(true); },
    image(url) {
      if (!allowedImage(url)) return false;
      return editor.chain().focus().setImage({ src: url, alt: 'Gambar' }).run();
    },
    destroy() {
      document.removeEventListener('pointerdown', dismiss);
      editor.destroy();
      popup.remove();
    },
  };
}
