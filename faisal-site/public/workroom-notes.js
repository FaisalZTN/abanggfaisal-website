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
    if (line.startsWith('## ')) return `<h2>${noteInline(line.slice(3))}</h2>`;
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
    if (tag === 'IMG' || tag === 'A') {
      const url = node.getAttribute(tag === 'IMG' ? 'src' : 'href');
      const label = (tag === 'IMG' ? node.alt : node.textContent).replace(/[\[\]\n]/g, '');
      if (/^https:\/\/[^\s]+$/.test(url || '')) {
        return (tag === 'IMG' ? '!' : '') + '[' + label + '](' + url.replaceAll(')', '%29') + ')';
      }
    }
    if (tag === 'H2') return '\n## ' + children.trimEnd() + '\n';
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
    const href = escape(url.href);
    document.execCommand('insertHTML', false, image
      ? `<img src="${href}" alt="${escape(selected || 'Gambar')}" referrerpolicy="no-referrer">`
      : `<a href="${href}" rel="noopener noreferrer">${escape(selected || url.href)}</a>`);
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
function renderNoteIndex() {
  const q = noteQuery.trim().toLocaleLowerCase('id');
  const notes = entries.filter(item => item.kind === 'note' &&
    (noteCategory === 'all' || (item.category || 'none') === noteCategory) &&
    (!q || (item.title + ' ' + item.body + ' ' + notePreview(item.body, Infinity) + ' ' + noteTime(item)).toLocaleLowerCase('id').includes(q)) &&
    (!fromTime || (noteTime(item) && noteTime(item).replace(' ','T') >= fromTime)) &&
    (!toTime || (noteTime(item) && noteTime(item).replace(' ','T') <= toTime)));
  notes.sort((a,b)=>(b.updated||0)-(a.updated||0));
  el('note-list').innerHTML = notes.map(note => `<button data-open="${note.id ?? 'new'}"${note.id === activeNote ? ' aria-current="true"' : ''}>
    <span class="note-row-head"><strong>${escape(note.title)}</strong>${noteTime(note) ? `<time title="${noteTime(note)} WITA">${noteTime(note).slice(-5)}</time>` : ''}</span><small>${escape(notePreview(note.body) || 'Catatan kosong')}</small><small class="note-tag">${escape(noteCategories[note.category || 'none'])}</small></button>`).join('') || '<p class="empty">Tidak ada catatan.</p>';
}
function renderNotes(notes) {
  const note = notes.find(item => item.id === activeNote) || notes[0];
  activeNote = note?.id;
  const options = Object.entries(noteCategories).filter(([key]) => key !== 'all');
  editorRange = undefined;
  el('view').innerHTML = `<div class="notes-head"><h1>Catatan</h1><button class="primary" data-new-note>+ Catatan baru</button></div>
    <div class="notes-desk${noteEditing ? ' is-editing' : ''}">
      <section class="note-categories" aria-label="Kategori"><div class="category-head"><h2>Kategori</h2><button id="add-category" aria-label="Kategori baru" title="Kategori baru">+</button></div>${Object.entries(noteCategories).map(([key, label]) =>
        `<button data-category="${key}" aria-pressed="${key === noteCategory}">${escape(label)} <small>${notes.filter(item => key === 'all' || (item.category || 'none') === key).length}</small></button>`).join('')}</section>
      <section class="note-index" aria-label="Daftar catatan"><input type="search" id="note-query" aria-label="Cari catatan" placeholder="Cari catatan…" value="${escape(noteQuery)}"><details ${fromTime || toTime ? "open" : ""}><summary>Filter waktu<span class="muted"> · WITA</span></summary><label>Dari<input type="datetime-local" id="note-from" value="${escape(fromTime)}"></label><label>Sampai<input type="datetime-local" id="note-to" value="${escape(toTime)}"></label><button id="clear-time">Hapus filter waktu</button></details><div id="note-list"></div></section>
      <section class="note-sheet" aria-label="Editor catatan">${note ? `<div><button class="note-back" id="note-back">← Daftar catatan</button></div>
        <input id="edit-title" placeholder="Catatan baru" aria-label="Judul catatan" maxlength="160" value="${escape(note.title)}">
        <div class="note-toolbar" role="group" aria-label="Format catatan">${toolbar.map(([mark, label, icon]) =>
          `<button data-mark="${mark}" aria-label="${label}" title="${label}">${icon}</button>`).join('')}
          <input type="date" id="insert-date" aria-label="Sisipkan tanggal" title="Sisipkan tanggal">
        </div>
        <div id="edit-body" class="note-rendered" contenteditable="true" role="textbox" aria-label="Isi catatan" aria-multiline="true" data-placeholder="Tulis ide kamu di sini…">${formatNote(note.body)}</div>
        <div class="note-footer"><button class="note-save" id="save-note">Simpan</button><label>Kategori <select id="note-category">${options.map(([key,label]) => `<option value="${key}"${key === (note.category || 'none') ? ' selected' : ''}>${escape(label)}</option>`).join('')}</select></label></div>` : '<p>Tambah catatan untuk mulai menulis.</p>'}</section>
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
