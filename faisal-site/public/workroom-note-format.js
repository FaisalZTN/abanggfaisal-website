const escapeNoteHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function noteInline(text, plain = false) {
  const emit = plain ? value => value : escapeNoteHtml;
  const tokens = /(!?)\[([^\]]*)\]\((https:\/\/[^\s)]+)\)|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*([^*]+)\*|\^([^^]+)\^|~([^~]+)~/g;
  let html = '', offset = 0;
  for (const match of text.matchAll(tokens)) {
    const [token, image, label, url, both, bold, italic, sup, sub] = match;
    html += emit(text.slice(offset, match.index));
    if (url) {
      html += plain ? (label || (image ? 'Gambar' : url)) : image ? `<img src="${escapeNoteHtml(url)}" alt="${escapeNoteHtml(label)}" referrerpolicy="no-referrer">`
        : `<a href="${escapeNoteHtml(url)}" rel="noopener noreferrer">${escapeNoteHtml(label)}</a>`;
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

export function notePreview(body, limit = 120) {
  const text = noteLines(body)
    .map(line => noteInline(line.replace(/^(?:## |- (?:\[[ xX]\] )?)/, ''), true))
    .join(' ').replace(/\s+/g, ' ').trim();
  const characters = Array.from(text);
  return characters.length > limit ? characters.slice(0, limit).join('').trimEnd() + '…' : text;
}
