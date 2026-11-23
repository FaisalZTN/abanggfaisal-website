import { noteInline, noteLines, notePreview } from './workroom-note-format.js';

const el = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const noteCategories = {all:'Semua',belajar:'Belajar',ide:'Ide',pribadi:'Pribadi',referensi:'Referensi',none:'Tanpa kategori'};
const clock = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Makassar',dateStyle:'short',timeStyle:'short'});
const noteTime = item => item.updated ? clock.format(new Date(item.updated)) : '';
let fromTime='', toTime='';
let editorRange;

function checklistItem(text, checked = false) {
  return `<div class="note-check"><input type="checkbox" aria-label="Tandai selesai" contenteditable="false"${checked ? ' checked' : ''}><span>${text || '<br>'}</span></div>`;
}

function formatNote(body) {
  return noteLines(body).map(line => {
    const check = line.match(/^- \[([ xX])\] (.*)$/);
    if (check) return checklistItem(noteInline(check[2]), check[1] !== ' ');
    const heading = /^(#{1,6}) (.*)$/.exec(line);
    if (heading) return `<h${heading[1].length}>${noteInline(heading[2])}</h${heading[1].length}>`;
    if (line.startsWith('- ')) return `<ul><li>${noteInline(line.slice(2))}</li></ul>`;
    return `<div>${noteInline(line) || '<br>'}</div>`;
  }).join('').replaceAll('</ul><ul>', '');
}

function serializeNote(editor) {
  const markers = {B:'**', STRONG:'**', I:'*', EM:'*', SUP:'^', SUB:'~'};
  function read(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.replaceAll('\u00a0', ' ');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName;
    const children = [...node.childNodes].map(read).join('');
    if (node.classList.contains('note-check')) {
      const box = node.querySelector('input');
      return '\n- [' + (box?.checked ? 'x' : ' ') + '] ' + children.trimEnd() + '\n';
    }
    if (Object.hasOwn(markers, tag)) return children ? markers[tag] + children + markers[tag] : '';
    if (tag === 'A' && node.hasAttribute('data-note-autolink')) return children;
    if (tag === 'IMG' || tag === 'A') {
      const url = node.getAttribute(tag === 'IMG' ? 'src' : 'href');
      const label = (tag === 'IMG' ? node.alt : node.textContent).replace(/[\[\]\n]/g, '');
      if (/^https:\/\/[^\s]+$/.test(url || '')) {
        return (tag === 'IMG' ? '!' : '') + '[' + label + '](' + url.replaceAll(')', '%29') + ')';
      }
    }
    if (/^H[1-6]$/.test(tag)) return '\n' + '#'.repeat(Number(tag[1])) + ' ' + children.trimEnd() + '\n';
    if (tag === 'U') return '<u>' + children + '</u>';
    if (tag === 'FONT') {
      const color = node.getAttribute('color'), size = node.getAttribute('size');
      let result = children;
      if (/^#[a-f0-9]{6}$/i.test(color)) result = '<font color="' + color + '">' + result + '</font>';
      if (/^[1-7]$/.test(size)) result = '<font size="' + size + '">' + result + '</font>';
      return result;
    }
    if (tag === 'LI') return '\n- ' + children.trimEnd() + '\n';
    if (tag === 'BR') return node.parentNode.childNodes.length === 1 ? '' : '\n';
    if (tag === 'DIV' || tag === 'P') return children.endsWith('\n') ? children : children + '\n';
    return children;
  }
  return [...editor.childNodes].map(read).join('').replace(/\n(?=\n(?:## |- ))/g, '').replace(/^\n|\n$/g, '');
}

const toolbar = [
  ['heading','Judul bagian','H₂'], ['bold','Tebal','<b>B</b>'], ['italic','Miring','<i>I</i>'],
  ['sup','Superskrip','x²'], ['sub','Subskrip','x₂'], ['list','Daftar','☷'], ['check','Checklist','☑'],
  ['link','Sisipkan tautan','↗'], ['image','Sisipkan gambar',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m3 17 5-4 4 3 4-5 5 6"/></svg>'],
];

function focusEditor(editor) {
  editor.focus();
  if (editorRange && editor.contains(editorRange.commonAncestorContainer)) {
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(editorRange);
  }
}

function editFormat(mark, editor) {
  focusEditor(editor);
  const commands = {heading:'formatBlock', bold:'bold', italic:'italic', sup:'superscript', sub:'subscript', list:'insertUnorderedList'};
  if (Object.hasOwn(commands, mark)) {
    document.execCommand(commands[mark], false, mark === 'heading' ? (document.queryCommandValue('formatBlock') === 'h2' ? 'div' : 'h2') : null);
  } else if (mark === 'check') {
    const selection = getSelection();
    const current = selection.anchorNode?.parentElement?.closest('.note-check');
    if (current) return;
    const item = checklistItem(escape(selection.toString())).replace('<span>', '<span data-new-check>');
    document.execCommand('insertHTML', false, item + '<div><br></div>');
    const label = editor.querySelector('[data-new-check]');
    if (label) {
      label.removeAttribute('data-new-check');
      selection.collapse(label, label.textContent ? label.childNodes.length : 0);
    }
  } else {
    const image = mark === 'image';
    const raw = prompt(image ? 'URL gambar (HTTPS)' : 'URL tautan (HTTPS)');
    if (!raw) return;
    let url;
    try { url = new URL(raw); if (url.protocol !== 'https:') throw Error(); }
    catch { message('Masukkan URL HTTPS yang valid.'); return; }
    const selected = getSelection().toString();
    const label = image ? selected : prompt('Nama tautan (opsional)', selected);
    if (label === null) return;
    focusEditor(editor);
    const href = escape(url.href);
    document.execCommand('insertHTML', false, image
      ? `<img src="${href}" alt="${escape(selected || 'Gambar')}" referrerpolicy="no-referrer">`
      : `<a href="${href}" rel="noopener noreferrer">${escape(label || selected || url.href)}</a>`);
  }
  editor.dispatchEvent(new Event('input', {bubbles:true}));
}

let noteCategory='all', noteQuery='', noteEditing=false, activeNote;
let entries=[];
const dirty = new Set();
let busy=false;
const render = () => renderNotes(entries);
function message(value) { el('note-status').textContent=value; }
async function request(data) {
  const response=await fetch('/workroom/notes/?notes-data', data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {});
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result.error || 'Workroom tidak bisa menyimpan atau memuat catatan. Coba lagi setelah masuk.');
  return result;
}
const notePinPath = 'M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5Zm3 10v6';
const noteTrashPath = 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 10v7m4-7v7';
function noteActionIcon(path, label = '') {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"'}><path d="${path}"/></svg>`;
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
    <span class="note-row-head"><span class="note-row-title">${note.pinned ? noteActionIcon(notePinPath, 'Catatan dipin') : ''}<strong>${escape(note.title)}</strong></span>${noteTime(note) ? `<time title="${noteTime(note)} WITA">${noteTime(note).slice(-5)}</time>` : ''}</span><small>${escape(notePreview(note.body) || 'Catatan kosong')}</small><small class="note-tag">${escape(noteCategories[note.category || 'none'])}</small></button>`).join('') || '<p class="empty">Tidak ada catatan.</p>';
}
function renderNotes(notes) {
  const note = notes.find(item => item.id === activeNote) || notes[0];
  activeNote = note?.id;
  const options = Object.entries(noteCategories).filter(([key]) => key !== 'all');
  editorRange = undefined;
  el('view').innerHTML = `<div class="notes-head"><h1>Catatan</h1><button class="primary" data-new-note>+ Catatan baru</button></div>
    <div class="notes-desk${noteEditing ? ' is-editing' : ''}">
      <section class="note-categories" aria-label="Kategori"><div class="category-head"><h2>Kategori</h2><button id="add-category" aria-label="Kategori baru" title="Kategori baru">${noteActionIcon('M12 5v14M5 12h14')}</button></div>${Object.entries(noteCategories).map(([key, label]) =>
        `<button data-category="${key}" aria-pressed="${key === noteCategory}"><span>${escape(label)}</span><small class="note-category-count">${notes.filter(item => key === 'all' || (item.category || 'none') === key).length}</small></button>`).join('')}</section>
      <section class="note-index" aria-label="Daftar catatan"><input type="search" id="note-query" aria-label="Cari catatan" placeholder="Cari catatan…" value="${escape(noteQuery)}"><details ${fromTime || toTime ? "open" : ""}><summary>Filter waktu<span class="muted"> · WITA</span></summary><label>Dari<input type="datetime-local" id="note-from" value="${escape(fromTime)}"></label><label>Sampai<input type="datetime-local" id="note-to" value="${escape(toTime)}"></label><button id="clear-time">Hapus filter waktu</button></details><div id="note-list"></div></section>
      <section class="note-sheet" aria-label="Editor catatan">${note ? `<div><button class="note-back" id="note-back">← Daftar catatan</button></div>
        <input id="edit-title" placeholder="Catatan baru" aria-label="Judul catatan" maxlength="160" value="${escape(note.title)}">
        <div class="note-toolbar" role="group" aria-label="Format catatan">${toolbar.map(([mark, label, icon]) =>
          `<button data-mark="${mark}" aria-label="${label}" title="${label}">${icon}</button>`).join('')}
          <input type="date" id="insert-date" aria-label="Sisipkan tanggal" title="Sisipkan tanggal">
        </div>
        <div id="edit-body" class="note-rendered" contenteditable="true" role="textbox" aria-label="Isi catatan" aria-multiline="true" data-placeholder="Tulis ide kamu di sini…">${formatNote(note.body)}</div>
        <div class="note-footer"><button class="note-save" id="save-note">Simpan</button><label>Kategori <select id="note-category">${options.map(([key,label]) => `<option value="${key}"${key === (note.category || 'none') ? ' selected' : ''}>${escape(label)}</option>`).join('')}</select></label>
          ${note.id !== null ? `<button type="button" id="pin-note" aria-pressed="${Boolean(note.pinned)}" aria-label="${pinNoteLabel(note.pinned)}" title="${pinNoteLabel(note.pinned)}">${noteActionIcon(notePinPath)}</button>` : ''}
          <button type="button" id="delete-note" aria-label="${note.id === null ? 'Buang draf' : 'Hapus catatan'}" title="${note.id === null ? 'Buang draf' : 'Hapus catatan'}">${noteActionIcon(noteTrashPath)}</button>
        </div>` : '<p>Tambah catatan untuk mulai menulis.</p>'}</section>
    </div>`;
  renderNoteIndex();
}

document.addEventListener('click', async event=>{
  const button=event.target.closest('#view button');
  if(!button || busy)return;
  if(button.id==='clear-time'){fromTime='';toTime='';render();el('note-query').focus();}
  if(button.dataset.category){noteCategory=button.dataset.category;noteEditing=false;render();}
  if(button.id==='note-back'){noteEditing=false;render();el('note-query').focus();}
  if(button.dataset.open){activeNote=button.dataset.open==='new'?null:Number(button.dataset.open);noteEditing=true;render();el('edit-title').focus();}
  if(button.hasAttribute('data-new-note')){
    if(!entries.some(note=>note.id===null))entries.unshift({id:null,kind:'note',title:'',body:'',category:noteCategory==='all'?'none':noteCategory});
    noteQuery=''; activeNote=null;noteEditing=true;render();el('edit-title').focus();
  }
  if(button.dataset.mark) editFormat(button.dataset.mark, el('edit-body'));

  if (button.id === 'pin-note' || button.id === 'delete-note') {
    const note = entries.find(item => item.id === activeNote);
    if (!note) return;
    const deleting = button.id === 'delete-note';
    if (deleting && !confirm(note.id === null ? 'Buang draf ini?' : 'Hapus catatan ini secara permanen?')) return;
    busy = true;
    el('view').inert = true;
    try {
      if (deleting) {
        if (note.id !== null) await request({ action: 'delete', id: note.id });
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
        message(note.id === null ? 'Draf dibuang.' : 'Catatan dihapus.');
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

  if(button.id==='add-category' || button.id==='save-note'){
    const note=entries.find(item=>item.id===activeNote);
    const name=button.id==='add-category' ? prompt('Nama kategori baru')?.trim() : '';
    if(button.id==='add-category' && !name)return;
    if(name && Object.values(noteCategories).some(label=>label.toLowerCase()===name.toLowerCase())){message('Kategori sudah ada.');return;}
    if(!name && !note?.title.trim()){message('Isi judul sebelum menyimpan.');el('edit-title').focus();return;}
    if (!name && note.body.length > 10000) {
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
document.addEventListener('change', event=>{
  const target=event.target;
  if(target.id==='note-from' || target.id==='note-to'){
    if(target.id==='note-from')fromTime=target.value;else toTime=target.value;
    renderNoteIndex();
  }
  if(target.id==='insert-date' && target.value){
    focusEditor(el('edit-body'));
    document.execCommand('insertText', false, target.value);
    target.value='';
  }
  if(target.matches('#edit-body input[type="checkbox"]')){
    el('edit-body').dispatchEvent(new Event('input', {bubbles:true}));
  }

  if(target.id==='note-category'){
    const item=entries.find(entry=>entry.id===activeNote);
    item.category=target.value;dirty.add(item);renderNoteIndex();message('Perubahan belum disimpan.');
  }
});
document.addEventListener('input', event=>{
  if(event.target.id==='note-query'){noteQuery=event.target.value;renderNoteIndex();return;}
  if(!['edit-title','edit-body'].includes(event.target.id))return;
  const note=entries.find(item=>item.id===activeNote);
  if (event.target.id === 'edit-title') note.title = event.target.value;
  else note.body = serializeNote(event.target);
  dirty.add(note);renderNoteIndex();message('Perubahan belum disimpan.');
});
document.addEventListener('selectionchange', () => {
  const selection = getSelection();
  const editor = el('edit-body');
  if (selection.rangeCount && editor?.contains(selection.getRangeAt(0).commonAncestorContainer)) {
    editorRange = selection.getRangeAt(0).cloneRange();
    for (const button of document.querySelectorAll('[data-mark="bold"], [data-mark="italic"]')) {
      button.setAttribute('aria-pressed', String(document.queryCommandState(button.dataset.mark)));
    }
  }
});
document.addEventListener('mousedown', event => {
  if (event.target.closest('.note-toolbar [data-mark]')) event.preventDefault();
});
document.addEventListener('workroom-image', event => {
  const editor = event.target;
  if (editor.id !== 'edit-body' || editor !== el('edit-body') || busy) return;
  focusEditor(editor);
  if (document.execCommand('insertHTML', false, `<img src="${escape(event.detail)}" alt="Gambar" loading="lazy" decoding="async">`)) {
    event.preventDefault();
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }
});
document.addEventListener('paste', event => {
  if (!event.target.closest('#edit-body')) return;
  event.preventDefault();
  document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
});
document.addEventListener('drop', event => {
  if (event.target.closest('#edit-body')) event.preventDefault();
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || !event.target.matches('#edit-body')) return;
  const selection = getSelection();
  const item = selection.anchorNode?.parentElement?.closest('.note-check');
  if (!item) return;
  event.preventDefault();
  if (!item.nextSibling) item.after(document.createElement('div'));
  if (!item.nextSibling.hasChildNodes()) item.nextSibling.append(document.createElement('br'));
  selection.collapse(item.nextSibling, 0);
});
window.addEventListener('beforeunload',event=>{if(dirty.size){event.preventDefault();event.returnValue='';}});
const bootstrap = el('workroom-notes-data');
const initialNotes = bootstrap ? Promise.resolve().then(() => JSON.parse(bootstrap.textContent)) : request();
initialNotes.then(data=>{
  bootstrap?.remove();
  entries=data.notes;
  for(const {id,name} of data.categories)noteCategories[id]=name;
  const selected=Number(new URLSearchParams(location.search).get('edit'));
  if(entries.some(note=>note.id===selected)){activeNote=selected;noteEditing=true;}
  render();
}).catch(error=>{el('view').textContent=error.message;}).finally(()=>el('view').removeAttribute('aria-busy'));

const selectionBar = document.createElement('div');
selectionBar.className = 'note-selection-bar';
selectionBar.setAttribute('role','toolbar');
selectionBar.setAttribute('aria-label','Format teks terpilih');
selectionBar.hidden = true;
selectionBar.innerHTML = `<select aria-label="Jenis paragraf" data-command="formatBlock"><option value="">Paragraf</option><option value="div">Teks biasa</option>${[1,2,3,4,5,6].map(n=>`<option value="h${n}">Heading ${n}</option>`).join('')}</select>
<input type="color" value="#b8d99d" data-command="foreColor" aria-label="Warna teks">
<select data-command="fontSize" aria-label="Ukuran teks"><option value="">Ukuran</option>${[1,2,3,4,5,6,7].map(n=>`<option value="${n}">${n}</option>`).join('')}</select><button data-command="link">Tautan</button>`;
document.body.append(selectionBar);
const selectionPopupDesktop = matchMedia('(hover: hover) and (pointer: fine)');
const selectionPopupDelay = 500;
let selectedRange;
let selectionPopupTimer;
let selectingWithPointer = false;

function closeSelectionBar() {
  clearTimeout(selectionPopupTimer);
  selectionBar.hidden = true;
  selectedRange = undefined;
}

function editorSelectionRange() {
  const selection = getSelection();
  const editor = el('edit-body');
  if (!selectionPopupDesktop.matches || !selection?.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  if (editor?.contains(range.commonAncestorContainer)) return range;
}

function positionSelectionBar() {
  if (selectionBar.hidden || !selectedRange) return;
  const editor = el('edit-body');
  if (!editor?.contains(selectedRange.commonAncestorContainer)) {
    closeSelectionBar();
    return;
  }
  const rect = selectedRange.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > innerHeight) {
    closeSelectionBar();
    return;
  }
  const top = rect.top > selectionBar.offsetHeight + 8 ? rect.top - selectionBar.offsetHeight - 6 : rect.bottom + 6;
  selectionBar.style.left = Math.max(8, Math.min(rect.left, innerWidth - selectionBar.offsetWidth - 8)) + 'px';
  selectionBar.style.top = Math.max(8, Math.min(innerHeight - selectionBar.offsetHeight - 8, top)) + 'px';
}

function scheduleSelectionBar() {
  if (selectionBar.contains(document.activeElement)) return;
  closeSelectionBar();
  if (selectingWithPointer || !editorSelectionRange()) return;
  selectionPopupTimer = setTimeout(() => {
    const range = editorSelectionRange();
    if (!range) return;
    selectedRange = range.cloneRange();
    selectionBar.hidden = false;
    positionSelectionBar();
  }, selectionPopupDelay);
}

document.addEventListener('selectionchange', scheduleSelectionBar);
selectionPopupDesktop.addEventListener('change', closeSelectionBar);
window.addEventListener('resize', positionSelectionBar);
document.addEventListener('scroll', positionSelectionBar, true);
document.addEventListener('pointerdown', event => {
  if (selectionBar.contains(event.target)) return;
  selectingWithPointer = Boolean(event.target.closest('#edit-body'));
  closeSelectionBar();
});
document.addEventListener('pointerup', () => {
  if (!selectingWithPointer) return;
  selectingWithPointer = false;
  scheduleSelectionBar();
});
document.addEventListener('pointercancel', () => {
  selectingWithPointer = false;
  closeSelectionBar();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeSelectionBar();
});
selectionBar.addEventListener('mousedown',event=>{if(event.target.closest('button'))event.preventDefault();});
function applySelectionFormat(control) {
  const editor=el('edit-body');
  if(!selectionPopupDesktop.matches || !control || !selectedRange || !editor?.contains(selectedRange.commonAncestorContainer))return;
  editorRange=selectedRange.cloneRange();
  focusEditor(editor);
  const command=control.dataset.command;
  if(command==='link')editFormat('link',editor);
  else {
    document.execCommand('styleWithCSS',false,false);
    document.execCommand(command,false,control.value || null);
    editor.dispatchEvent(new Event('input',{bubbles:true}));
  }
  if(control.tagName==='SELECT')control.selectedIndex=0;
}
selectionBar.addEventListener('click',event=>applySelectionFormat(event.target.closest('button')));
selectionBar.addEventListener('change',event=>applySelectionFormat(event.target));
