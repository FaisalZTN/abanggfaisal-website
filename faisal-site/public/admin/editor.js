(() => {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cells = line => line.replace(/^\||\|$/g, '').split('|').map(s => s.trim());
  const line = values => '| ' + values.map(v => v.replace(/\r?\n/g, ' ')).join(' | ') + ' |';
  CMS.registerEditorComponent({
    id: 'table', label: 'Tabel',
    fields: [
      {name: 'headers', label: 'Judul kolom (pisahkan dengan |)', widget: 'string'},
      {name: 'rows', label: 'Isi: satu baris per baris baru, pisahkan kolom dengan |', widget: 'text'}
    ],
    pattern: /^(\|[^\n]+\|)\n\|[\s:|\-]+\|\n((?:\|[^\n]*\|(?:\n|$))+)/m,
    fromBlock: match => ({headers: cells(match[1]).join(' | '), rows: match[2].trim().split('\n').map(l => cells(l).join(' | ')).join('\n')}),
    toBlock: data => {
      const headers = cells(data.headers || 'Kolom 1 | Kolom 2');
      return line(headers) + '\n' + line(headers.map(() => '---')) + '\n' + String(data.rows || '').split('\n').filter(Boolean).map(row => line(cells(row).slice(0, headers.length))).join('\n');
    },
    toPreview: data => '<div style="overflow:auto"><table><thead><tr>' + cells(data.headers || '').map(h => '<th>' + escape(h) + '</th>').join('') + '</tr></thead><tbody>' + String(data.rows || '').split('\n').filter(Boolean).map(row => '<tr>' + cells(row).map(c => '<td>' + escape(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>'
  });
})();
