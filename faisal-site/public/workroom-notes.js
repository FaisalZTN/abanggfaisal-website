const el = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const noteCategories = {all:'Semua',belajar:'Belajar',ide:'Ide',pribadi:'Pribadi',referensi:'Referensi',none:'Tanpa kategori'};
const clock = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Makassar',dateStyle:'short',timeStyle:'short'});
const noteTime = item => item.updated ? clock.format(new Date(item.updated)) : '';
let fromTime='', toTime='', formatted=false;
function formatNote(body) {
  return body.split('\n').map((line,i)=>{
    const check=line.match(/^- \[([ xX])\] (.*)$/);
    let text=escape(check ? check[2] : line);
    text=text.replace(/(!?)\[([^\]]*)\]\((https:\/\/[^\s)]+)\)/g, (_,image,label,url)=>
      image ? '<img referrerpolicy="no-referrer" src="'+url+'" alt="'+label+'">' :
      '<a target="_blank" rel="noopener noreferrer" href="'+url+'">'+label+'</a>');
    if (!line.includes('https://')) text=text.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/\*([^*]+)\*/g,'<i>$1</i>').replace(/\^([^^]+)\^/g,'<sup>$1</sup>').replace(/~([^~]+)~/g,'<sub>$1</sub>');
    return check ? '<label class="note-check"><input type="checkbox" data-check="'+i+'" '+(check[1]!==' '?'checked':'')+'>'+text+'</label>' : '<div>'+ (text||'<br>')+'</div>';
  }).join('');
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
    (item.title + ' ' + item.body + ' ' + noteTime(item)).toLocaleLowerCase('id').includes(q) &&
    (!fromTime || (noteTime(item) && noteTime(item).replace(' ','T') >= fromTime)) &&
    (!toTime || (noteTime(item) && noteTime(item).replace(' ','T') <= toTime)));
  notes.sort((a,b)=>(b.updated||0)-(a.updated||0));
  el('note-list').innerHTML = notes.map(note => `<button data-open="${note.id ?? 'new'}"${note.id === activeNote ? ' aria-current="true"' : ''}>
    <span class="note-row-head"><strong>${escape(note.title)}</strong>${noteTime(note) ? `<time title="${noteTime(note)} WITA">${noteTime(note).slice(-5)}</time>` : ''}</span><small>${escape(note.body || 'Catatan kosong')}</small><small class="note-tag">${escape(noteCategories[note.category || 'none'])}</small></button>`).join('') || '<p class="empty">Tidak ada catatan.</p>';
}
function renderNotes(notes) {
  const note = notes.find(item => item.id === activeNote) || notes[0];
  activeNote = note?.id;
  const options = Object.entries(noteCategories).filter(([key]) => key !== 'all');
  el('view').innerHTML = `<div class="notes-head"><h1>Catatan</h1><button class="primary" data-new-note>+ Catatan baru</button></div>
    <div class="notes-desk${noteEditing ? ' is-editing' : ''}">
      <section class="note-categories" aria-label="Kategori"><div class="category-head"><h2>Kategori</h2><button id="add-category" aria-label="Kategori baru" title="Kategori baru">+</button></div>${Object.entries(noteCategories).map(([key, label]) =>
        `<button data-category="${key}" aria-pressed="${key === noteCategory}">${escape(label)} <small>${notes.filter(item => key === 'all' || (item.category || 'none') === key).length}</small></button>`).join('')}</section>
      <section class="note-index" aria-label="Daftar catatan"><input type="search" id="note-query" aria-label="Cari catatan" placeholder="Cari catatan…" value="${escape(noteQuery)}"><details ${fromTime || toTime ? "open" : ""}><summary>Filter waktu<span class="muted"> · WITA</span></summary><label>Dari<input type="datetime-local" id="note-from" value="${escape(fromTime)}"></label><label>Sampai<input type="datetime-local" id="note-to" value="${escape(toTime)}"></label><button id="clear-time">Hapus filter waktu</button></details><div id="note-list"></div></section>
      <section class="note-sheet" aria-label="Editor catatan">${note ? `<div><button class="note-back" id="note-back">← Daftar catatan</button></div>
        <input id="edit-title" placeholder="Catatan baru" aria-label="Judul catatan" maxlength="160" value="${escape(note.title)}">
        <div class="note-toolbar" aria-label="Sisipkan Markdown"><button data-mark="heading" aria-label="Judul bagian" title="Judul bagian">H₂</button><button data-mark="bold" aria-label="Tebal" title="Tebal"><b>B</b></button><button data-mark="italic" aria-label="Miring" title="Miring"><i>I</i></button><button data-mark="sup">x²</button><button data-mark="sub">x₂</button><button data-mark="image">Gambar</button><button data-mark="link">Tautan</button><label>Tanggal <input type="date" id="insert-date"></label><button data-mark="list" aria-label="Daftar" title="Daftar">☷</button><button data-mark="check" aria-label="Checklist" title="Checklist">☑</button></div>
        ${formatted ? `<div class="note-rendered">${formatNote(note.body)}</div>` : `<textarea id="edit-body" aria-label="Isi catatan" maxlength="10000" placeholder="Tulis ide kamu di sini…">${escape(note.body)}</textarea>`}
        <div class="note-footer"><button class="note-save" id="save-note">Simpan</button><button id="format-preview" aria-pressed="${formatted}">${formatted ? "Edit" : "Pratinjau"}</button><label>Kategori <select id="note-category">${options.map(([key,label]) => `<option value="${key}"${key === (note.category || 'none') ? ' selected' : ''}>${escape(label)}</option>`).join('')}</select></label></div>` : '<p>Tambah catatan untuk mulai menulis.</p>'}</section>
    </div>`;
  renderNoteIndex();
}

document.addEventListener('click', async event=>{
  const button=event.target.closest('#view button');
  if(!button || busy)return;
  if(button.id==='format-preview'){formatted=!formatted;render();el('format-preview').focus();}
  if(button.id==='clear-time'){fromTime='';toTime='';render();el('note-query').focus();}
  if(button.dataset.category){noteCategory=button.dataset.category;noteEditing=false;render();}
  if(button.id==='note-back'){noteEditing=false;render();el('note-query').focus();}
  if(button.dataset.open){activeNote=button.dataset.open==='new'?null:Number(button.dataset.open);noteEditing=true;formatted=false;render();el('edit-title').focus();}
  if(button.hasAttribute('data-new-note')){
    if(!entries.some(note=>note.id===null))entries.unshift({id:null,kind:'note',title:'',body:'',category:noteCategory==='all'?'none':noteCategory});
    noteQuery=''; activeNote=null;noteEditing=true;formatted=false;render();el('edit-title').focus();
  }
  if(button.dataset.mark){
    const field=el('edit-body'); if(!field)return;
    const markers={heading:['## ',''],bold:['**','**'],italic:['*','*'],sup:['^','^'],sub:['~','~'],image:['',''],link:['',''],list:['- ',''],check:['- [ ] ','']};
    const [before,after]=markers[button.dataset.mark];
    let selected=field.value.slice(field.selectionStart,field.selectionEnd);
    if(['image','link'].includes(button.dataset.mark)){
      const image=button.dataset.mark==='image';
      const raw=prompt(image?'URL gambar (HTTPS)':'URL tautan (HTTPS)');
      if(!raw)return;
      let url;
      try { url=new URL(raw); if(url.protocol!=='https:')throw Error(); } catch { alert('Masukkan URL HTTPS yang valid.'); return; }
      selected=(image?'!':'')+'['+(selected.replace(/[\[\]\n]/g,'')||(image?'Gambar':'Tautan'))+']('+url.href.replace(/\)/g,'%29')+')';
    }
    if(field.value.length-(field.selectionEnd-field.selectionStart)+selected.length+before.length+after.length<=field.maxLength){
      field.setRangeText(before+selected+after,field.selectionStart,field.selectionEnd,'end');
      field.dispatchEvent(new Event('input',{bubbles:true}));
    }
    field.focus();
  }

  if(button.id==='add-category' || button.id==='save-note'){
    const note=entries.find(item=>item.id===activeNote);
    const name=button.id==='add-category' ? prompt('Nama kategori baru')?.trim() : '';
    if(button.id==='add-category' && !name)return;
    if(name && Object.values(noteCategories).some(label=>label.toLowerCase()===name.toLowerCase())){message('Kategori sudah ada.');return;}
    if(!name && !note?.title.trim()){message('Isi judul sebelum menyimpan.');el('edit-title').focus();return;}
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
  if(target.id==='insert-date' && target.value && el('edit-body')){
    const field=el('edit-body');
    if(field.value.length-(field.selectionEnd-field.selectionStart)+target.value.length<=field.maxLength){
      field.setRangeText(target.value,field.selectionStart,field.selectionEnd,'end');
      field.dispatchEvent(new Event('input',{bubbles:true}));
      target.value='';field.focus();
    }
  }
  if(target.dataset.check!==undefined){
    const item=entries.find(entry=>entry.id===activeNote), lines=item.body.split('\n');
    const i=Number(target.dataset.check);
    lines[i]=lines[i].replace(/^- \[[ xX]\]/,target.checked?'- [x]':'- [ ]');
    item.body=lines.join('\n');dirty.add(item);renderNoteIndex();
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
  note[event.target.id==='edit-title'?'title':'body']=event.target.value;
  dirty.add(note);renderNoteIndex();message('Perubahan belum disimpan.');
});
window.addEventListener('beforeunload',event=>{if(dirty.size){event.preventDefault();event.returnValue='';}});
request().then(data=>{
  entries=data.notes;
  for(const {id,name} of data.categories)noteCategories[id]=name;
  const selected=Number(new URLSearchParams(location.search).get('edit'));
  if(entries.some(note=>note.id===selected)){activeNote=selected;noteEditing=true;}
  render();
}).catch(error=>{el('view').textContent=error.message;}).finally(()=>el('view').removeAttribute('aria-busy'));
