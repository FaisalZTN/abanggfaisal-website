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

CMS.registerEventListener({
  name: 'preSave',
  handler: ({ entry }) => {
    const collection = entry.get('collection');
    const data = entry.get('data');
    const validDate = value => {
      if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000')) {
        return false;
      }
      const parsed = new Date(value + 'T00:00:00Z');
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };

    if (collection === 'study_guidelines') {
      data.get('entries')?.forEach(item => {
        const reviewed = item.get('reviewed_on');
        if (reviewed && !validDate(reviewed)) {
          throw new Error(`${item.get('title')}: Terakhir ditinjau harus tanggal kalender yang valid (YYYY-MM-DD).`);
        }
      });
    }

    if (collection !== 'study_lectures') return;
    const { title, lecture_date: day, schedule_page: page, schedule_week: week, lecture_start: start, lecture_end: end } = data.toJS();
    const hasDay = day != null && day !== '';
    const hasPage = page != null && page !== '';
    const hasWeek = week != null && week !== '';
    if (hasDay && !validDate(day)) {
      throw new Error(`${title}: Tanggal kuliah harus tanggal kalender yang valid (YYYY-MM-DD).`);
    }
    if (hasPage && (!Number.isInteger(page) || page < 1)) {
      throw new Error(`${title}: Halaman PDF jadwal harus bilangan bulat minimal 1.`);
    }
    if (hasWeek && (!Number.isInteger(week) || week < 1)) {
      throw new Error(`${title}: Minggu jadwal harus bilangan bulat minimal 1.`);
    }
    if (hasDay !== (hasPage || hasWeek) || (hasPage && hasWeek)) {
      throw new Error(`${title}: Isi tanggal kuliah dan salah satu sumber (halaman atau minggu) bersama-sama.`);
    }
    const time = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
    if ((start || end) && !(hasDay && time.test(start) && time.test(end) && start < end)) {
      throw new Error(`${title}: Isi tanggal, sumber jadwal, dan jam mulai–selesai WITA yang valid.`);
    }
  }
});
