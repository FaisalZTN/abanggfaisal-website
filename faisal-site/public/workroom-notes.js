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

  function editFormat(mark) {
    if (!blockEditor) return;
    if (mark === 'blocks') return blockEditor.showBlocks();
    const chain = blockEditor.editor.chain().focus();
    const commands = { bold: 'toggleBold', italic: 'toggleItalic', underline: 'toggleUnderline',
      sup: 'toggleSuperscript', sub: 'toggleSubscript' };
    if (Object.hasOwn(commands, mark)) return chain[commands[mark]]().run();
    const href = prompt('URL tautan (HTTPS)')?.trim();
    if (!href || !/^https:\/\/[^\s]+$/i.test(href)) return;
    if (blockEditor.editor.state.selection.empty) {
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
  }

  let noteCategory='all', noteQuery='', noteEditing=false, activeNote;
  let entries=[];
  const dirty = new Set();
  let busy=false;
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
    const note = notes.find(item => item.id === activeNote) || notes[0];
    activeNote = note?.id;
    const options = Object.entries(noteCategories).filter(([key]) => key !== 'all');
    const deleteCategory = !['all', 'none'].includes(noteCategory) && Object.hasOwn(noteCategories, noteCategory)
      ? `<button type="button" data-delete-category aria-label="Hapus kategori" title="Hapus kategori">${noteActionIcon('trash')}</button>` : '';
    editorRange = undefined;
    const trashPanel = `<details class="note-trash"${trashOpen ? ' open' : ''}>
      <summary>${noteActionIcon('trash')} Sampah <small>${trash.length + archivedCategories.length}</small></summary>
      ${trash.length ? '<ul>' + trash.map(note => `<li><span>${escape(note.title)}</span>
        <button type="button" data-restore-note="${note.id}">Pulihkan</button></li>`).join('') + '</ul>' : ''}
      ${archivedCategories.length ? '<ul aria-label="Kategori dihapus">' + archivedCategories.map(category => `<li><span>Kategori · ${escape(category.name)}</span>
        <button type="button" data-restore-category="${escape(category.id)}">Pulihkan</button></li>`).join('') + '</ul>' : ''}
      ${trash.length || archivedCategories.length ? '' : '<p>Sampah kosong.</p>'}
    </details>`;
    blockEditor?.destroy();
    blockEditor = undefined;
    el('view').innerHTML = `<div class="notes-head"><h1>Catatan</h1><div class="notes-head-actions"><a class="notes-private-link" href="/workroom/private-notes/" aria-label="Catatan Rahasia">${noteActionIcon('lock')}<span>Catatan Rahasia</span></a><button class="primary" data-new-note>${noteActionIcon('plus')}<span>Catatan baru</span></button></div></div>
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
          <input id="edit-title" placeholder="Catatan baru" aria-label="Judul catatan" maxlength="160" value="${escape(note.title)}">
          <div class="note-toolbar" role="group" aria-label="Format catatan">${toolbar.map(([mark, label, icon]) =>
            `<button data-mark="${mark}" aria-label="${label}" title="${label}">${noteActionIcon(icon)}</button>`).join('')}
            <input type="color" id="note-text-color" aria-label="Warna teks" title="Warna teks" value="#1d97f1">
            <select id="note-text-size" aria-label="Ukuran teks">
              <option value="">Ukuran teks</option>
              ${[10, 13, 16, 18, 24, 32, 48].map(px => `<option value="${px}px">${px} px</option>`).join('')}
            </select>
            <input type="date" id="insert-date" aria-label="Sisipkan tanggal" title="Sisipkan tanggal">
          </div>
          <div id="edit-body" class="note-rendered"></div>
          <div class="note-footer"><button class="note-save" id="save-note">Simpan</button><label>Kategori <select id="note-category">${options.map(([key,label]) => `<option value="${key}"${key === (note.category || 'none') ? ' selected' : ''}>${escape(label)}</option>`).join('')}</select></label>
            ${note.id !== null ? `<button type="button" id="pin-note" aria-pressed="${Boolean(note.pinned)}" aria-label="${pinNoteLabel(note.pinned)}" title="${pinNoteLabel(note.pinned)}">${noteActionIcon('pin')}</button>` : ''}
            <button type="button" id="delete-note" aria-label="${note.id === null ? 'Buang draf' : 'Hapus catatan'}" title="${note.id === null ? 'Buang draf' : 'Hapus catatan'}">${noteActionIcon('trash')}</button>
          </div>` : '<p>Tambah catatan untuk mulai menulis.</p>'}</section>
      </div>`;
    if (note) {
      blockEditor = mountBlockEditor(el('edit-body'), readBlockNote(note.body) ?? legacyContent(note.body), document => {
        note.body = blockNoteBody(document);
        dirty.add(note);
        renderNoteIndex();
        message('Perubahan belum disimpan.');
      });
    }
    el('view').querySelector('.note-trash').addEventListener('toggle', event => { trashOpen = event.target.open; });
    renderNoteIndex();
  }

  listen(document, 'click', async event=>{
    const button=event.target.closest('#view button, #note-status button');
    if(!button || busy)return;
    if(button.id==='clear-time'){fromTime='';toTime='';render();el('note-query').focus();}
    if(button.dataset.category){noteCategory=button.dataset.category;noteEditing=false;render();}
    if(button.id==='note-back'){noteEditing=false;render();el('note-query').focus();}
    if(button.dataset.open){activeNote=button.dataset.open==='new'?null:Number(button.dataset.open);noteEditing=true;render();el('edit-title').focus();}
    if(button.hasAttribute('data-new-note')){
      if(!entries.some(note=>note.id===null))entries.unshift({id:null,kind:'note',title:'',body:'',category:noteCategory==='all'?'none':noteCategory});
      noteQuery=''; activeNote=null;noteEditing=true;render();el('edit-title').focus();
    }
    if(button.dataset.mark) editFormat(button.dataset.mark);

    if (button.hasAttribute('data-delete-category') || button.dataset.restoreNote || button.dataset.restoreCategory) {
      const deletingCategory = button.hasAttribute('data-delete-category');
      const category = button.dataset.restoreCategory ?? noteCategory;
      if (deletingCategory && !confirm(`Hapus kategori “${noteCategories[category]}”? Catatannya akan dipindah ke Tanpa kategori.`)) return;
      busy = true;
      el('view').inert = true;
      try {
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
    if(addingCategory || button.id==='save-note'){
      const note=entries.find(item=>item.id===activeNote);
      const name=addingCategory ? prompt('Nama kategori baru')?.trim() : '';
      if(addingCategory && !name)return;
      if(name && Object.values(noteCategories).some(label=>label.toLowerCase()===name.toLowerCase())){message('Kategori sudah ada.');return;}
      if(!name && !note?.title.trim()){message('Isi judul sebelum menyimpan.');el('edit-title').focus();return;}
      if (!name && note.body.length > (readBlockNote(note.body) ? 100000 : 10000)) {
        message('Catatan terlalu panjang. Kurangi isi atau jumlah format sebelum menyimpan.');
        return;
      }
      busy=true;
      el('view').inert=true;
      message(name?'Membuat kategori…':'Menyimpan catatan…');
      try {
        if(name){
          const category=await request({action:'category',name});
          noteCategories[category.id]=category.name;
          if(note){note.category=category.id;dirty.add(note);}
          else noteCategory=category.id;
        } else {
          Object.assign(note,await request({action:'save',id:note.id,title:note.title,body:note.body,category:note.category||'none'}));
          activeNote=note.id;dirty.delete(note);
        }
        render();
        message(name?'Kategori dibuat.':'Catatan tersimpan.');
      } catch(error){message(error.message);}
      finally {busy=false;el('view').inert=false;}
    }
  });
  listen(document, 'change', event=>{
    const target=event.target;
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
    if (target.id === 'note-text-color') blockEditor?.editor.chain().focus().setColor(target.value).run();
    if (target.id === 'note-text-size') {
      const chain = blockEditor?.editor.chain().focus();
      if (chain) (target.value ? chain.setFontSize(target.value) : chain.unsetFontSize()).run();
    }
    if(target.id==='insert-date' && target.value){
      blockEditor?.editor.chain().focus().insertContent(target.value).run();
      target.value='';
    }

    if(target.id==='note-category'){
      const item=entries.find(entry=>entry.id===activeNote);
      item.category=target.value;dirty.add(item);renderNoteIndex();message('Perubahan belum disimpan.');
    }
  });
  listen(document, 'input', event=>{
    if(event.target.id==='note-query'){noteQuery=event.target.value;renderNoteIndex();return;}
    if (event.target.id !== 'edit-title') return;
    const note=entries.find(item=>item.id===activeNote);
    note.title = event.target.value;
    dirty.add(note);renderNoteIndex();message('Perubahan belum disimpan.');
  });
  listen(document, 'mousedown', event => {
    if (event.target.closest('.note-toolbar [data-mark]')) event.preventDefault();
  });
  listen(document, 'workroom-image', event => {
    if (event.target === el('edit-body') && !busy && blockEditor?.image(event.detail)) event.preventDefault();
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

  signal.addEventListener('abort', () => blockEditor?.destroy(), { once: true });
  return () => busy ? "busy" : dirty.size > 0;
}
