import { noteInline, noteLines, notePreview, readBlockNote, blockNoteBody } from './workroom-note-format.js';
import { mountBlockEditor } from '/workroom-block-editor.js';

export function mount(panel, signal) {
  const el = id => panel.querySelector('#' + id);
  const listen = (target, type, handler, options) => target.addEventListener(type, handler, {
    capture: options === true, signal,
  });
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const noteCategories = {all:'Semua',none:'Tanpa kategori'};
  let archivedCategories = [];
  const clock = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Makassar',dateStyle:'short',timeStyle:'short'});
  const noteTime = item => item.updated ? clock.format(new Date(item.updated)) : '';
  let fromTime='', toTime='';
  let blockEditor;
  let fullscreenNotes = false;
  let splitNote;
  let splitPreview;

  let leftReadOnly = false;
  let rightReadOnly = true;
  let toolbarSide = 'left';

  function splitTarget() {
    return fullscreenNotes && splitNote !== undefined
      ? entries.find(note => note.id === (splitNote === 'current' ? activeNote : splitNote))
      : undefined;
  }

  function formatEditor() {
    return toolbarSide === 'right' ? splitPreview : blockEditor;
  }

  function showFormatting(side) {
    toolbarSide = side;
    const toolbar = el('view').querySelector('.note-toolbar');
    const host = el(side === 'right' ? 'note-split-body' : 'edit-body');
    if (!toolbar || !host) return;
    if (toolbar.nextElementSibling !== host) host.before(toolbar);
    toolbar.hidden = side === 'right' ? rightReadOnly : leftReadOnly;
    syncLayout(formatEditor()?.editor.state.selection.$from.parent.attrs);
  }

  function applyPaneModes() {
    const split = Boolean(splitTarget());
    blockEditor?.editor.setEditable(!split || !leftReadOnly, false);
    if (el('edit-title')) el('edit-title').readOnly = split && leftReadOnly;
    splitPreview?.editor.setEditable(!rightReadOnly, false);
    blockEditor?.editor.view.dom.setAttribute('aria-readonly', String(split && leftReadOnly));
    splitPreview?.editor.view.dom.setAttribute('aria-readonly', String(rightReadOnly));
    for (const [side, readOnly] of [['left', leftReadOnly], ['right', rightReadOnly]]) {
      const button = el('note-mode-' + side);
      if (!button) continue;
      button.textContent = readOnly ? 'Baca' : 'Edit';
      button.setAttribute('aria-label', (side === 'left' ? 'Panel kiri' : 'Panel kanan') +
        (readOnly ? ' dalam mode baca. Beralih ke edit' : ' dalam mode edit. Beralih ke baca'));
    }
    showFormatting(!split || (toolbarSide === 'right' && rightReadOnly && !leftReadOnly) ? 'left' : toolbarSide);
  }

  function updateNoteBody(note, document, side) {
    note.body = blockNoteBody(document);
    if (splitTarget()?.id === activeNote) {
      const other = side === 'left' ? splitPreview : blockEditor;
      other?.editor.commands.setContent(document, { emitUpdate: false });
    }
    scheduleSave(note);
    renderNoteIndex();
  }

  function refreshSplitView() {
    showFormatting('left');
    splitPreview?.destroy();
    splitPreview = undefined;
    const view = el('view');
    const target = splitTarget();
    el('note-split-pane').hidden = !target;
    view.classList.toggle('notes-split', Boolean(target));
    if (target) {
      el('note-split-title').textContent = target.title || 'Catatan baru';
      splitPreview = mountBlockEditor(el('note-split-body'), readBlockNote(target.body) ?? legacyContent(target.body),
        document => updateNoteBody(target, document, 'right'),
        attrs => { if (toolbarSide === 'right') syncLayout(attrs); }, 'Isi catatan panel kanan', requestImageUrl);
    }
    applyPaneModes();
  }

  function legacyContent(body) {
    const html = noteLines(body).map(line => {
      const task = /^- \[([ xX])\] (.*)$/.exec(line);
      if (task) return `<ul data-type="taskList"><li data-type="taskItem" data-checked="${task[1] !== ' '}"><p>${noteInline(task[2])}</p></li></ul>`;
      const heading = /^(#{1,6}) (.*)$/.exec(line);
      if (heading) return `<h${heading[1].length}>${noteInline(heading[2])}</h${heading[1].length}>`;
      if (line.startsWith('- ')) return `<ul><li><p>${noteInline(line.slice(2))}</p></li></ul>`;
      return `<p>${noteInline(line)}</p>`;
    }).join('');
    return html.replace(/<font (color|size)="([^"]+)">/g, (_, type, value) => {
      const px = [0, 10, 13, 16, 18, 24, 32, 48];
      return `<span style="${type === 'color' ? 'color:' + value : 'font-size:' + px[Number(value)] + 'px'}">`;
    }).replaceAll('</font>', '</span>');
  }

  const toolbar = [
    ['blocks', 'Tambah blok', 'plus'], ['bold', 'Tebal', 'bold'], ['italic', 'Miring', 'italic'],
    ['underline', 'Garis bawah', 'underline'], ['sup', 'Superskrip', 'superscript'],
    ['sub', 'Subskrip', 'subscript'], ['link', 'Sisipkan tautan', 'link'],
  ];

  const paragraphMenus = [
    ['alignment', 'Perataan paragraf', 'M3 5h18M3 10h13M3 15h18M3 20h13', 'left',
      [['left', 'Rata kiri'], ['center', 'Rata tengah'], ['right', 'Rata kanan'], ['justify', 'Rata kiri-kanan (Justify)']]],
    ['leading', 'Spasi antarbaris', 'M5 4v16M2 7l3-3 3 3m-6 10 3 3 3-3M11 5h10m-10 7h10m-10 7h10', 'normal',
      [['1', '1,0'], ['1.15', '1,15'], ['1.5', '1,5'], ['2', '2,0'], ['2.5', '2,5'], ['3', '3,0'], ['compact', '1,25 (lama)'], ['normal', '1,65 (bawaan)']]],
    ['spacing', 'Jarak antarparagraf', 'M3 4h18M3 7h18M12 10v4m-2-2 2-2 2 2m-4 0 2 2 2-2M3 17h18M3 20h18', 'normal',
      [['none', 'Tanpa jarak'], ['normal', 'Normal'], ['wide', 'Lebar']]],
  ];

  function layoutControls() {
    return paragraphMenus.map(([key, label, path, , options]) => `
      <button type="button" data-layout-trigger="${key}" popovertarget="note-layout-${key}" aria-label="${label}" title="${label}">
        <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="${path}"/></svg>
      </button>
      <div id="note-layout-${key}" class="note-layout-popover" popover aria-label="${label}" role="group">
        ${options.map(([value, text]) => `<button type="button" data-layout-key="${key}" data-layout-value="${value}" aria-pressed="false"><span aria-hidden="true">✓</span>${text}</button>`).join('')}
      </div>`).join('');
  }

  function syncLayout(attrs = {}) {
    for (const [key, label, , fallback, options] of paragraphMenus) {
      const value = key === 'leading' && attrs.leading === 'wide' ? '2' : attrs[key] ?? fallback;
      const menu = el('note-layout-' + key);
      if (!menu) continue;
      for (const option of menu.querySelectorAll('button')) {
        option.setAttribute('aria-pressed', String(option.dataset.layoutValue === value));
        if (key === 'leading' && option.dataset.layoutValue === 'compact') option.hidden = value !== 'compact';
      }
      const trigger = panel.querySelector(`[data-layout-trigger="${key}"]`);
      const current = options.find(option => option[0] === value)?.[1];
      trigger.title = current ? `${label} · ${current}` : label;
    }
  }

  const urlDialog = document.createElement('dialog');
  urlDialog.className = 'workroom-url-dialog';
  urlDialog.setAttribute('aria-labelledby', 'workroom-url-title');
  urlDialog.innerHTML = `<form novalidate>
    <div class="workroom-url-heading">${noteActionIcon('link')}<h2 id="workroom-url-title"></h2></div>
    <label>Alamat URL<input name="url" type="url" inputmode="url" autocomplete="off" autocapitalize="off"
      spellcheck="false" placeholder="https://…" required autofocus aria-describedby="workroom-url-error"></label>
    <p id="workroom-url-error" role="alert" hidden>Masukkan URL lengkap yang diawali https://.</p>
    <div class="workroom-url-actions">
      <button type="button" data-remove-link hidden>Hapus tautan</button>
      <button type="button" data-cancel-url>Batal</button>
      <button type="submit"></button>
    </div>
  </form>`;
  panel.append(urlDialog);
  const urlInput = urlDialog.querySelector('input');
  const urlError = urlDialog.querySelector('[role="alert"]');
  const removeLink = urlDialog.querySelector('[data-remove-link]');
  let urlAction;
  let removeAction;

  function clearUrlError() {
    urlInput.removeAttribute('aria-invalid');
    urlError.hidden = true;
  }

  function openUrlDialog({ title, button, value = '', apply, remove }) {
    if (urlDialog.open) return;
    urlDialog.querySelector('h2').textContent = title;
    urlDialog.querySelector('[type="submit"]').textContent = button;
    urlInput.value = value;
    clearUrlError();
    urlAction = apply;
    removeAction = remove;
    removeLink.hidden = !remove;
    urlDialog.showModal();
    urlInput.select();
  }

  listen(urlDialog, 'submit', event => {
    event.preventDefault();
    const href = urlInput.value.trim();
    if (!/^https:\/\/[^\s]+$/i.test(href) || !URL.canParse(href) || new URL(href).protocol !== 'https:') {
      urlInput.setAttribute('aria-invalid', 'true');
      urlError.hidden = false;
      urlInput.focus();
      return;
    }
    const apply = urlAction;
    urlDialog.close();
    apply(href);
  });
  listen(urlInput, 'input', clearUrlError);
  listen(urlDialog.querySelector('[data-cancel-url]'), 'click', () => urlDialog.close());
  listen(removeLink, 'click', () => {
    const remove = removeAction;
    urlDialog.close();
    remove();
  });
  listen(urlDialog, 'close', () => {
    if (urlDialog.open) return;
    urlAction = removeAction = undefined;
    urlInput.value = '';
  });

  function requestImageUrl(apply) {
    openUrlDialog({ title: 'Sisipkan gambar dari URL', button: 'Sisipkan gambar', apply });
  }

  function editFormat(mark) {
    const target = formatEditor();
    if (!target?.editor.isEditable) return;
    if (mark === 'blocks') return target.showBlocks();
    const { editor } = target;
    const commands = { bold: 'toggleBold', italic: 'toggleItalic', underline: 'toggleUnderline',
      sup: 'toggleSuperscript', sub: 'toggleSubscript' };
    if (Object.hasOwn(commands, mark)) return editor.chain().focus()[commands[mark]]().run();
    if (mark !== 'link') return;

    const { selection, doc } = editor.state;
    const currentHref = editor.getAttributes('link').href;
    const changeLink = href => {
      if (editor.isDestroyed || !editor.isEditable || editor.state.doc !== doc) return;
      const chain = editor.chain().focus().setTextSelection({ from: selection.from, to: selection.to });
      if (currentHref && selection.empty) chain.extendMarkRange('link');
      if (!href) chain.unsetLink().run();
      else if (currentHref || !selection.empty) chain.setLink({ href }).run();
      else chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    };
    openUrlDialog({
      title: currentHref ? 'Edit tautan' : 'Sisipkan tautan',
      button: currentHref ? 'Simpan tautan' : 'Sisipkan tautan',
      value: currentHref,
      apply: changeLink,
      remove: currentHref ? () => changeLink() : undefined,
    });
  }

  let noteCategory='all', noteQuery='', noteEditing=false, activeNote;
  let entries=[];
  const dirty = new Set();
  let busy=false;
  let saveTimer;
  let saving;
  function scheduleSave(note) {
    if (note) dirty.add(note);
    clearTimeout(saveTimer);
    if (!dirty.size || signal.aborted) return;
    saveTimer = setTimeout(flushNotes, 700);
  }

  async function flushNotes() {
    if (saving || signal.aborted) return;
    if (busy) { scheduleSave(); return; }
    const note = dirty.values().next().value;
    if (!note) return;
    const { id, title, body, category } = note;
    const payload = { action:'save', id, title:title.trim() || 'Catatan baru', body, category:category || 'none' };
    if (id === null) payload.createKey = note.createKey ??= crypto.randomUUID();
    message('Menyimpan otomatis…');
    saving = request(payload);
    let succeeded = false;
    try {
      const result = await saving;
      note.id = result.id;
      note.updated = result.updated;
      if (activeNote === id) activeNote = result.id;
      if (splitNote === id && id === null) splitNote = result.id;
      if (note.title === title && note.body === body && note.category === category) dirty.delete(note);
      if (signal.aborted) return;
      renderNoteIndex();
      if (id === null) {
        const tab = el('view').querySelector('.note-tabs [data-open="new"]');
        if (tab) tab.dataset.open = String(result.id);
        if (activeNote === result.id) {
          el('delete-note')?.setAttribute('aria-label', 'Hapus catatan');
          if (el('delete-note')) el('delete-note').title = 'Hapus catatan';
          if (el('pin-note')) el('pin-note').hidden = false;
        }
      }
      const tab = el('view').querySelector('.note-tabs [data-open="' + result.id + '"]');
      if (tab) tab.textContent = note.title || 'Catatan baru';
      succeeded = true;
      message(dirty.size ? 'Menunggu simpan otomatis…' : 'Tersimpan otomatis.');
    } catch (error) {
      if (!signal.aborted) {
        message(error.message);
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.id = 'retry-note-autosave';
        retry.textContent = 'Coba lagi';
        el('note-status').append(' ', retry);
      }
    } finally {
      saving = undefined;
      if (succeeded) scheduleSave();
    }
  }
  const render = () => renderNotes(entries);
  let trash = [];
  let trashOpen = false;
  function message(value, undoId, type = 'restoreNote') {
    const status = el('note-status');
    status.textContent = value;
    if (!undoId) return;
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.dataset[type] = undoId;
    undo.textContent = 'Urungkan';
    status.append(' ', undo);
  }
  async function request(data) {
    const response=await fetch('/workroom/notes/?notes-data', data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {});
    const result=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(result.error || 'Workroom tidak bisa menyimpan atau memuat catatan. Coba lagi setelah masuk.');
    return result;
  }
  function noteActionIcon(name, label = '') {
    return `<svg class="ui-icon" viewBox="0 0 24 24" focusable="false"${label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"'}><use href="/gentleface-icons.svg#${name}"/></svg>`;
  }
  const pinNoteLabel = pinned => pinned ? 'Lepas pin' : 'Pin catatan';

  function renderNoteIndex() {
    const q = noteQuery.trim().toLocaleLowerCase('id');
    const notes = entries.filter(item => item.kind === 'note' &&
      (noteCategory === 'all' || (item.category || 'none') === noteCategory) &&
      (!q || (item.title + ' ' + item.body + ' ' + notePreview(item.body, Infinity) + ' ' + noteTime(item)).toLocaleLowerCase('id').includes(q)) &&
      (!fromTime || (noteTime(item) && noteTime(item).replace(' ','T') >= fromTime)) &&
      (!toTime || (noteTime(item) && noteTime(item).replace(' ','T') <= toTime)));
    notes.sort((a, b) => (b.pinned || 0) - (a.pinned || 0) || (b.updated || 0) - (a.updated || 0));
    el('note-list').innerHTML = notes.map(note => `<button data-open="${note.id ?? 'new'}"${note.id === activeNote ? ' aria-current="true"' : ''}>
      <span class="note-row-head"><span class="note-row-title">${note.pinned ? noteActionIcon('pin', 'Catatan dipin') : ''}<strong>${escape(note.title)}</strong></span>${noteTime(note) ? `<time title="${noteTime(note)} WITA">${noteTime(note).slice(-5)}</time>` : ''}</span><small>${escape(notePreview(note.body) || 'Catatan kosong')}</small><small class="note-tag">${escape(noteCategories[note.category || 'none'])}</small></button>`).join('') || '<p class="empty">Tidak ada catatan.</p>';
  }
  function renderNotes(notes) {
    if (urlDialog.open) urlDialog.close();
    const note = notes.find(item => item.id === activeNote) || notes[0];
    activeNote = note?.id;
    const options = Object.entries(noteCategories).filter(([key]) => key !== 'all');
    const deleteCategory = !['all', 'none'].includes(noteCategory) && Object.hasOwn(noteCategories, noteCategory)
      ? `<button type="button" data-delete-category aria-label="Hapus kategori" title="Hapus kategori">${noteActionIcon('trash')}</button>` : '';
    const trashPanel = `<details class="note-trash"${trashOpen ? ' open' : ''}>
      <summary>${noteActionIcon('trash')} Sampah <small>${trash.length + archivedCategories.length}</small></summary>
      ${trash.length ? '<ul>' + trash.map(note => `<li><span>${escape(note.title)}</span>
        <button type="button" data-restore-note="${note.id}">Pulihkan</button></li>`).join('') + '</ul>' : ''}
      ${archivedCategories.length ? '<ul aria-label="Kategori dihapus">' + archivedCategories.map(category => `<li><span>Kategori · ${escape(category.name)}</span>
        <button type="button" data-restore-category="${escape(category.id)}">Pulihkan</button></li>`).join('') + '</ul>' : ''}
      ${trash.length || archivedCategories.length ? '' : '<p>Sampah kosong.</p>'}
    </details>`;
    splitPreview?.destroy();
    splitPreview = undefined;
    blockEditor?.destroy();
    blockEditor = undefined;
    toolbarSide = 'left';
    el('view').classList.toggle('notes-fullscreen', fullscreenNotes);
    el('view').innerHTML = `<div class="note-fullscreen-bar">
      <nav class="note-tabs" aria-label="Buka catatan lain">${notes.map(item =>
        `<button type="button" data-open="${item.id ?? 'new'}"${item.id === note?.id ? ' aria-current="true"' : ''}>${escape(item.title || 'Catatan baru')}</button>`).join('')}</nav>
      ${note ? `<details class="note-split-menu">
        <summary title="Split View" aria-label="Split View"><span aria-hidden="true" class="note-split-icon"></span></summary>
        <div class="note-split-options">
          <button type="button" data-split-note="current">Catatan sekarang</button>
          ${notes.some(item => item.id !== note.id) ? `<label>Catatan lain
            <select id="note-split-select"><option value="">Pilih catatan</option>${notes.filter(item => item.id !== note.id).map(item =>
              `<option value="${item.id ?? 'new'}">${escape(item.title || 'Catatan baru')}</option>`).join('')}</select>
          </label>` : ''}
        </div>
      </details>` : ''}
      <button type="button" class="note-fullscreen-exit note-screen-button" data-note-fullscreen aria-label="Keluar layar penuh" title="Keluar layar penuh"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v5H3m13-5v5h5M3 16h5v5m13-5h-5v5"/></svg></button>
    </div><div class="notes-head"><h1>Catatan</h1><div class="notes-head-actions"><a class="notes-private-link" href="/workroom/private-notes/" aria-label="Catatan Rahasia">${noteActionIcon('lock')}<span>Catatan Rahasia</span></a><button class="primary" data-new-note>${noteActionIcon('plus')}<span>Catatan baru</span></button></div></div>
      <div class="notes-desk${noteEditing ? ' is-editing' : ''}">
        <section class="note-categories" aria-label="Kategori"><div class="category-head"><h2>Kategori</h2><div class="category-head-actions"><button type="button" id="add-category" aria-label="Kategori baru" title="Kategori baru">${noteActionIcon('plus')}</button>${deleteCategory}</div></div>${Object.entries(noteCategories).map(([key, label]) =>
          `<button data-category="${key}" aria-pressed="${key === noteCategory}"><span>${escape(label)}</span><small class="note-category-count">${notes.filter(item => key === 'all' || (item.category || 'none') === key).length}</small></button>`).join('')}</section>
        <section class="note-index" aria-label="Daftar catatan"><input type="search" id="note-query" aria-label="Cari catatan" placeholder="Cari catatan…" value="${escape(noteQuery)}"><div class="note-mobile-category">
          <label><span class="note-sr-only">Kategori</span>${noteActionIcon('filter')}
            <select id="note-category-filter">${Object.entries(noteCategories).map(([key, label]) =>
              `<option value="${key}"${key === noteCategory ? ' selected' : ''}>${escape(label)}</option>`).join('')}</select>
          </label>
          <button type="button" data-add-category aria-label="Kategori baru" title="Kategori baru">${noteActionIcon('plus')}</button>
          ${deleteCategory}
        </div><details ${fromTime || toTime ? "open" : ""}><summary>Filter waktu<span class="muted"> · WITA</span></summary><label>Dari<input type="datetime-local" id="note-from" value="${escape(fromTime)}"></label><label>Sampai<input type="datetime-local" id="note-to" value="${escape(toTime)}"></label><button id="clear-time">Hapus filter waktu</button></details><div id="note-list"></div>${trashPanel}</section>
        <section class="note-sheet" aria-label="Editor catatan">${note ? `<div><button class="note-back" id="note-back">${noteActionIcon('arrow-left')} Daftar catatan</button></div>
          <div class="note-split-mode-left"><button type="button" id="note-mode-left">Edit</button></div>
          <div class="note-title-row"><div class="note-title-field" data-title="${escape(note.title)}"><textarea id="edit-title" rows="1" placeholder="Catatan baru" aria-label="Judul catatan" maxlength="160">${escape(note.title)}</textarea></div>
          <button type="button" class="note-screen-button" data-note-fullscreen aria-label="Layar penuh" title="Layar penuh"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg></button></div>
          <div class="note-toolbar" role="group" aria-label="Format catatan">${toolbar.map(([mark, label, icon]) =>
            `<button type="button" data-mark="${mark}"${mark === 'link' ? ' aria-haspopup="dialog"' : ''} aria-label="${label}" title="${label}">${noteActionIcon(icon)}</button>`).join('')}
            <label class="note-icon-field" title="Palet warna">
              <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1.4 1.4 0 0 1 1.1-2.3H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3Z"/>
                <path stroke-linecap="round" stroke-width="2.8" d="M7.5 11h.01M10 7.5h.01M14 7.5h.01M17.5 10.5h.01"/>
              </svg>
              <input type="color" id="note-text-color" aria-label="Palet warna" value="#1d97f1">
            </label>
            <label class="note-icon-field" title="Ukuran teks">
              <span class="note-text-size-icon" aria-hidden="true">A↕</span>
              <select id="note-text-size" aria-label="Ukuran teks">
                <option value="">Ukuran teks</option>
                ${[10, 13, 16, 18, 24, 32, 48].map(px => `<option value="${px}px">${px} px</option>`).join('')}
              </select>
            </label>
            ${layoutControls()}
            <label class="note-icon-field" title="Sisipkan tanggal">
              ${noteActionIcon('calendar-day')}
              <input type="date" id="insert-date" aria-label="Sisipkan tanggal">
            </label>
          </div>
          <div id="edit-body" class="note-rendered"></div>
          <div class="note-footer"><button type="button" id="copy-note-whatsapp">Salin untuk WhatsApp</button><label>Kategori <select id="note-category">${options.map(([key,label]) => `<option value="${key}"${key === (note.category || 'none') ? ' selected' : ''}>${escape(label)}</option>`).join('')}</select></label>
            <button type="button" id="pin-note"${note.id === null ? ' hidden' : ''} aria-pressed="${Boolean(note.pinned)}" aria-label="${pinNoteLabel(note.pinned)}" title="${pinNoteLabel(note.pinned)}">${noteActionIcon('pin')}</button>
            <button type="button" id="delete-note" aria-label="${note.id === null ? 'Buang draf' : 'Hapus catatan'}" title="${note.id === null ? 'Buang draf' : 'Hapus catatan'}">${noteActionIcon('trash')}</button>
          </div>` : '<p>Tambah catatan untuk mulai menulis.</p>'}</section>
        <section id="note-split-pane" class="note-sheet" aria-label="Panel catatan kanan" hidden>
          <div class="note-split-heading"><h2 id="note-split-title"></h2><button type="button" id="note-mode-right">Baca</button><button type="button" id="close-note-split" aria-label="Tutup Split View" title="Tutup Split View">×</button></div>
          <div id="note-split-body" class="note-rendered"></div>
        </section>
      </div>`;
    if (note) {
      blockEditor = mountBlockEditor(el('edit-body'), readBlockNote(note.body) ?? legacyContent(note.body),
        document => updateNoteBody(note, document, 'left'),
        attrs => { if (toolbarSide === 'left') syncLayout(attrs); }, 'Isi catatan', requestImageUrl);
      for (const menu of panel.querySelectorAll('.note-layout-popover')) {
        menu.addEventListener('beforetoggle', event => {
          if (event.newState !== 'open') return;
          const trigger = panel.querySelector(`[popovertarget="${menu.id}"]`);
          const rect = trigger.getBoundingClientRect();
          menu.style.left = Math.max(8, Math.min(rect.left, innerWidth - 216)) + 'px';
          const below = innerHeight - rect.bottom - 12;
          const above = rect.top - 12;
          const openAbove = below < 256 && above > below;
          menu.style.top = (openAbove ? rect.top - 4 : rect.bottom + 4) + 'px';
          menu.style.transform = openAbove ? 'translateY(-100%)' : '';
          menu.style.maxHeight = Math.min(256, Math.max(48, openAbove ? above : below)) + 'px';
        });
      }
    }
    el('view').querySelector('.note-trash').addEventListener('toggle', event => { trashOpen = event.target.open; });
    renderNoteIndex();
    refreshSplitView();
  }

  listen(document, 'click', async event=>{
    const button=event.target.closest('#view button, #note-status button');
    if(!button || busy)return;
    if (button.id === 'retry-note-autosave') { clearTimeout(saveTimer); void flushNotes(); return; }
    if (button.id === 'note-mode-left' || button.id === 'note-mode-right') {
      const side = button.id === 'note-mode-left' ? 'left' : 'right';
      if (side === 'left') leftReadOnly = !leftReadOnly;
      else rightReadOnly = !rightReadOnly;
      toolbarSide = side;
      applyPaneModes();
      return;
    }
    if (button.dataset.splitNote || button.id === 'close-note-split') {
      splitNote = button.dataset.splitNote;
      const menu = el('view').querySelector('.note-split-menu');
      if (menu) menu.open = false;
      refreshSplitView();
      menu?.querySelector('summary')?.focus();
      return;
    }
    if (button.hasAttribute('data-note-fullscreen')) {
      blockEditor?.editor.commands.setMeta('hideDragHandle', true);
      fullscreenNotes = !fullscreenNotes;
      if (!fullscreenNotes) splitNote = undefined;
      refreshSplitView();
      el('view').classList.toggle('notes-fullscreen', fullscreenNotes);
      el('view').querySelector(fullscreenNotes ? '.note-fullscreen-bar [data-note-fullscreen]' : '.note-sheet [data-note-fullscreen]')?.focus();
      return;
    }
    if(button.id==='clear-time'){fromTime='';toTime='';render();el('note-query').focus();}
    if(button.dataset.category){noteCategory=button.dataset.category;noteEditing=false;render();}
    if(button.id==='note-back'){noteEditing=false;render();el('note-query').focus();}
    if(button.dataset.open){activeNote=button.dataset.open==='new'?null:Number(button.dataset.open);noteEditing=true;render();el('edit-title').focus();}
    if(button.hasAttribute('data-new-note')){
      if(!entries.some(note=>note.id===null))entries.unshift({id:null,kind:'note',title:'',body:'',category:noteCategory==='all'?'none':noteCategory});
      noteQuery=''; activeNote=null;noteEditing=true;render();el('edit-title').focus();
      scheduleSave(entries.find(item => item.id === null));
    }
    if (button.dataset.layoutKey && formatEditor()?.editor.isEditable) {
      button.closest('[popover]').hidePopover();
      formatEditor().editor.chain().focus().setParagraphLayout(button.dataset.layoutKey, button.dataset.layoutValue).run();
      return;
    }
    if (button.id === 'copy-note-whatsapp' && blockEditor) {
      const title = el('edit-title').value.trim();
      const text = [title ? '*' + title + '*' : '', blockEditor.whatsappText()].filter(Boolean).join('\n\n');
      if (!text.trim()) { message('Catatan masih kosong.'); return; }
      try {
        await navigator.clipboard.writeText(text);
        message('Catatan tersalin untuk WhatsApp.');
      } catch {
        message('Clipboard tidak dapat diakses. Periksa izin browser.');
      }
      return;
    }
    if(button.dataset.mark) editFormat(button.dataset.mark);

    if (button.hasAttribute('data-delete-category') || button.dataset.restoreNote || button.dataset.restoreCategory) {
      const deletingCategory = button.hasAttribute('data-delete-category');
      const category = button.dataset.restoreCategory ?? noteCategory;
      if (deletingCategory && !confirm(`Hapus kategori “${noteCategories[category]}”? Catatannya akan dipindah ke Tanpa kategori.`)) return;
      busy = true;
      el('view').inert = true;
      try {
        if (saving) await saving.catch(() => {});
        if (deletingCategory) {
          const removed = await request({ action: 'delete-category', id: category });
          archivedCategories = [removed, ...archivedCategories.filter(item => item.id !== category)];
          delete noteCategories[category];
          for (const note of entries) {
            if (note.category === category) {
              note.category = 'none';
              note.archivedCategory = category;
            }
          }
          noteCategory = 'none';
          render();
          message('Kategori dihapus. Catatan tersedia di Tanpa kategori.', category, 'restoreCategory');
        } else if (button.dataset.restoreCategory) {
          const restored = await request({ action: 'restore-category', id: category });
          noteCategories[category] = restored.name;
          archivedCategories = archivedCategories.filter(item => item.id !== category);
          const restoredNotes = new Set(restored.notes);
          for (const note of entries) {
            if ((!note.category || note.category === 'none') && (
              restoredNotes.has(note.id) || (note.id === null && note.archivedCategory === category)
            )) note.category = category;
            if (note.archivedCategory === category) delete note.archivedCategory;
          }
          noteCategory = category;
          noteQuery = fromTime = toTime = '';
          noteEditing = false;
          render();
          message('Kategori dipulihkan.');
        } else {
          const id = Number(button.dataset.restoreNote);
          const note = await request({ action: 'restore', id });
          trash = trash.filter(item => item.id !== id);
          entries.push(note);
          activeNote = id;
          noteEditing = true;
          noteCategory = 'all';
          noteQuery = '';
          fromTime = toTime = '';
          render();
          message('Catatan dipulihkan.');
        }
      } catch (error) {
        if (deletingCategory) message(error.message);
        else if (button.dataset.restoreCategory) message(error.message, category, 'restoreCategory');
        else message(error.message, Number(button.dataset.restoreNote));
      } finally {
        busy = false;
        el('view').inert = false;
      }
      return;
    }

    if (button.id === 'pin-note' || button.id === 'delete-note') {
      const note = entries.find(item => item.id === activeNote);
      if (!note) return;
      const deleting = button.id === 'delete-note';
      if (deleting && !confirm(note.id === null ? 'Buang draf ini?' : 'Pindahkan catatan ini ke Sampah? Perubahan yang belum disimpan akan dibuang.')) return;
      busy = true;
      el('view').inert = true;
      try {
        if (deleting) {
          if (note.id !== null) {
            const removed = await request({ action: 'delete', id: note.id });
            trash.unshift(removed);
          }
          entries = entries.filter(item => item !== note);
          dirty.delete(note);
          activeNote = undefined;
          noteEditing = false;
          const url = new URL(location.href);
          if (url.searchParams.get('edit') === String(note.id)) {
            url.searchParams.delete('edit');
            history.replaceState(history.state, '', url);
          }
          render();
          el('note-query').focus();
          message(note.id === null ? 'Draf dibuang.' : 'Catatan dipindah ke Sampah.', note.id);
        } else {
          const result = await request({ action: 'pin', id: note.id, pinned: !note.pinned });
          note.pinned = result.pinned;
          button.setAttribute('aria-label', pinNoteLabel(note.pinned));
          button.title = pinNoteLabel(note.pinned);
          button.setAttribute('aria-pressed', String(Boolean(note.pinned)));
          renderNoteIndex();
          message(note.pinned ? 'Catatan dipin.' : 'Pin dilepas.');
        }
      } catch (error) {
        message(error.message);
      } finally {
        busy = false;
        el('view').inert = false;
      }
      return;
    }

    const addingCategory = button.id === 'add-category' || button.hasAttribute('data-add-category');
    if (addingCategory) {
      const name = prompt('Nama kategori baru')?.trim();
      if (!name) return;
      if (Object.values(noteCategories).some(label => label.toLowerCase() === name.toLowerCase())) {
        message('Kategori sudah ada.');
        return;
      }
      const note = entries.find(item => item.id === activeNote);
      busy = true;
      el('view').inert = true;
      message('Membuat kategori…');
      try {
        if (saving) await saving.catch(() => {});
        const category = await request({action:'category', name});
        noteCategories[category.id] = category.name;
        if (note) { note.category = category.id; scheduleSave(note); }
        else noteCategory = category.id;
        render();
        message('Kategori dibuat.');
      } catch (error) { message(error.message); }
      finally { busy = false; el('view').inert = false; }
    }
  });
  listen(document, 'change', event=>{
    const target=event.target;
    if (target.id === 'note-split-select' && target.value) {
      splitNote = target.value === 'new' ? null : Number(target.value);
      target.closest('details').open = false;
      target.value = '';
      refreshSplitView();
      target.closest('details').querySelector('summary').focus();
      return;
    }
    if (target.id === 'note-category-filter') {
      noteCategory = target.value;
      render();
      el('note-category-filter').focus();
      return;
    }
    if(target.id==='note-from' || target.id==='note-to'){
      if(target.id==='note-from')fromTime=target.value;else toTime=target.value;
      renderNoteIndex();
    }
    if (target.id === 'note-text-color') formatEditor()?.editor.chain().focus().setColor(target.value).run();
    if (target.id === 'note-text-size') {
      const chain = formatEditor()?.editor.chain().focus();
      if (chain) (target.value ? chain.setFontSize(target.value) : chain.unsetFontSize()).run();
    }
    if(target.id==='insert-date' && target.value){
      formatEditor()?.editor.chain().focus().insertContent(target.value).run();
      target.value='';
    }

    if(target.id==='note-category'){
      const item=entries.find(entry=>entry.id===activeNote);
      item.category=target.value;scheduleSave(item);renderNoteIndex();
    }
  });
  listen(document, 'input', event=>{
    if(event.target.id==='note-query'){noteQuery=event.target.value;renderNoteIndex();return;}
    if (event.target.id !== 'edit-title') return;
    const note=entries.find(item=>item.id===activeNote);
    note.title = event.target.value.replace(/\n/g, ' ');
    if (note.title !== event.target.value) event.target.value = note.title;
    event.target.parentElement.dataset.title = note.title;
    scheduleSave(note);renderNoteIndex();
  });
  listen(document, 'focusin', event => {
    if (!splitTarget()) return;
    if (event.target.closest('#note-split-body') && !rightReadOnly) showFormatting('right');
    if (event.target.closest('#edit-body') && !leftReadOnly) showFormatting('left');
  });
  listen(document, 'mousedown', event => {
    if (event.target.closest('.note-toolbar [data-mark]')) event.preventDefault();
  });
  listen(document, 'workroom-image', event => {
    const target = event.target === el('edit-body') ? blockEditor
      : event.target === el('note-split-body') ? splitPreview : null;
    if (!busy && target?.editor.isEditable && target.image(event.detail.url, event.detail.layout)) event.preventDefault();
  });
  listen(window, 'beforeunload',event=>{if(dirty.size){event.preventDefault();event.returnValue='';}});
  const bootstrap = el('workroom-notes-data');
  const initialNotes = bootstrap ? Promise.resolve().then(() => JSON.parse(bootstrap.textContent)) : request();
  initialNotes.then(data=>{
    bootstrap?.remove();
    entries=data.notes;
    trash=data.trash ?? [];
    archivedCategories=data.archivedCategories ?? [];
    for(const {id,name} of data.categories)noteCategories[id]=name;
    const selected=Number(new URLSearchParams(location.search).get('edit'));
    if(entries.some(note=>note.id===selected)){activeNote=selected;noteEditing=true;}
    render();
  }).catch(error=>{el('view').textContent=error.message;}).finally(()=>el('view').removeAttribute('aria-busy'));

  signal.addEventListener('abort', () => { if (urlDialog.open) urlDialog.close(); clearTimeout(saveTimer); splitPreview?.destroy(); blockEditor?.destroy(); }, { once: true });
  return () => busy || saving ? "busy" : dirty.size > 0;
}
