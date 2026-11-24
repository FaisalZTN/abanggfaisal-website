const escapeNoteHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function noteInline(text, plain = false) {
  // Only these editor-generated tags and strictly validated attributes are rendered.
  const style = /<(u|font (?:color="#[a-f0-9]{6}"|size="[1-7]"))>([\s\S]*?)<\/(?:u|font)>/i.exec(text);
  if (style) {
    const inner = noteInline(style[2], plain);
    const tag = style[1].toLowerCase();
    return noteInline(text.slice(0, style.index), plain) +
      (plain ? inner : '<' + tag + '>' + inner + '</' + tag.split(' ')[0] + '>') +
      noteInline(text.slice(style.index + style[0].length), plain);
  }
  const emit = plain ? value => value : escapeNoteHtml;
  const tokens = /(!?)\[([^\]]*)\]\((https:\/\/[^\s)]+)\)|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*([^*]+)\*|\^([^^]+)\^|~([^~]+)~|(https?:\/\/[^\s<>"'\[\]{}]+)/g;
  let html = '', offset = 0;
  for (const match of text.matchAll(tokens)) {
    const [token, image, label, url, both, bold, italic, sup, sub, bare] = match;
    html += emit(text.slice(offset, match.index));
    if (url) {
      html += plain ? (label || (image ? 'Gambar' : url)) : image ? `<img src="${escapeNoteHtml(url)}" alt="${escapeNoteHtml(label)}" referrerpolicy="no-referrer" loading="lazy" decoding="async">`
        : `<a href="${escapeNoteHtml(url)}" rel="noopener noreferrer">${escapeNoteHtml(label)}</a>`;
    } else if (bare) {
      const label = bare.replace(/[.,;:!?]+$/, '').replace(/\)+$/, ending => {
        const opens = (bare.match(/\(/g) || []).length;
        const closes = (bare.match(/\)/g) || []).length;
        return ending.slice(Math.max(0, closes - opens));
      });
      html += plain ? bare : `<a data-note-autolink href="${escapeNoteHtml(label)}" rel="noopener noreferrer">${escapeNoteHtml(label)}</a>${escapeNoteHtml(bare.slice(label.length))}`;
    } else if (both) {
      const content = noteInline(both, plain);
      html += plain ? content : `<strong><em>${content}</em></strong>`;
    } else {
      const [tag, value] = bold ? ['strong', bold] : italic ? ['em', italic] : sup ? ['sup', sup] : ['sub', sub];
      const content = noteInline(value, plain);
      html += plain ? content : `<${tag}>${content}</${tag}>`;
    }
    offset = match.index + token.length;
  }
  return html + emit(text.slice(offset));
}

export function noteLines(body) {
  // Older editors could insert a checklist marker in the middle of a line.
  return body.replace(/\r\n?/g, '\n').replace(/([^\n]) +(?=- \[[ xX]\] )/g, '$1\n').split('\n');
}

export function readBlockNote(body) {
  const prefix = 'workroom-blocks-v1:';
  if (!body?.startsWith(prefix)) return null;
  try {
    const document = JSON.parse(body.slice(prefix.length));
    let count = 0;
    function valid(node, depth = 0) {
      return node && typeof node.type === 'string' && depth <= 40 && ++count <= 5000 &&
        (node.text === undefined || typeof node.text === 'string') &&
        (node.content === undefined || Array.isArray(node.content) && node.content.every(child => valid(child, depth + 1)));
    }
    return document?.type === 'doc' && valid(document) ? document : null;
  } catch {
    return null;
  }
}

export function blockNoteBody(document) {
  return 'workroom-blocks-v1:' + JSON.stringify(document);
}

export function noteBodyText(body) {
  const document = readBlockNote(body);
  if (!document) return body;
  function text(node) {
    if (node.type === 'image') return node.attrs?.alt || 'Gambar';
    return node.text ?? (node.content ?? []).map(text).join(node.type === 'paragraph' || node.type === 'heading' ? '' : '\n');
  }
  return text(document);
}

export function notePreview(body, limit = 120) {
  const text = (readBlockNote(body) ? noteBodyText(body) : noteLines(body)
    .map(line => noteInline(line.replace(/^(?:#{1,6} |- (?:\[[ xX]\] )?)/, ''), true))
    .join(' ')).replace(/\s+/g, ' ').trim();
  const characters = Array.from(text);
  return characters.length > limit ? characters.slice(0, limit).join('').trimEnd() + '…' : text;
}
