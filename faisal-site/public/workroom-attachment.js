import { compressWorkroomImage } from '/workroom-image-upload.js';

const photoCompressionThreshold = 1000000;

async function compressPhoto(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const blob = await compressWorkroomImage(bitmap, {
      x: 0, y: 0, width: bitmap.width, height: bitmap.height,
    }, photoCompressionThreshold);
    return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: blob.type });
  } finally {
    bitmap.close();
  }
}

const uploadTime = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Makassar',
});

export function mountAttachment(section, kind, id, signal) {
  const endpoint = new URL(kind === 'task' ? '/workroom/tasks/' : '/workroom/notes/', location.origin);
  endpoint.searchParams.set('attachment', id);
  function fileUrl(id, action) {
    const url = new URL(endpoint);
    url.searchParams.set('file', id);
    if (action) url.searchParams.set(action, '');
    return url;
  }

  section.innerHTML = `
    <h3 id="workroom-attachment-heading">${kind === 'task' ? 'Bukti tugas' : 'Lampiran catatan'}</h3>
    <label class="task-pdf-picker"><input class="note-sr-only" type="file" multiple disabled
      accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.tsv,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.zip,.mp3,.m4a,.wav,.mp4,.mov,.heic">
      <span>Pilih file <small>· maks. 3 file, 10 MB per file</small></span></label>
    <ul class="workroom-attachment-list" aria-label="Daftar lampiran" hidden></ul>
    <p role="status"></p>
    <dialog class="workroom-url-dialog task-pdf-preview" aria-labelledby="workroom-attachment-title">
      <div class="task-pdf-actions">
        <h2 id="workroom-attachment-title"></h2>
        <a target="_blank" rel="noopener noreferrer"></a>
        <form method="dialog"><button aria-label="Tutup" title="Tutup">
          <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button></form>
      </div>
      <iframe title="Pratinjau PDF" hidden></iframe>
      <img alt="" class="workroom-attachment-image" hidden>
    </dialog>`;
  section.setAttribute('aria-labelledby', 'workroom-attachment-heading');
  section.hidden = false;

  const input = section.querySelector('input');
  const list = section.querySelector('ul');
  const status = section.querySelector('[role="status"]');
  const dialog = section.querySelector('dialog');
  const frame = dialog.querySelector('iframe');
  const image = dialog.querySelector('img');
  let files = [];
  let busy = true;

  function render() {
    list.hidden = !files.length;
    input.disabled = files.length >= 3 || busy;
    list.replaceChildren(...files.map(file => {
      const row = document.createElement('li');
      const pdf = file.media_type === 'application/pdf';
      const canPreview = pdf || file.media_type.startsWith('image/');
      const action = document.createElement(canPreview ? 'button' : 'a');
      if (canPreview) {
        action.type = 'button';
        action.textContent = (pdf ? 'Lihat PDF: ' : 'Lihat gambar: ') + file.name;
        action.onclick = () => showPreview(file);
      } else {
        action.href = fileUrl(file.id, 'download').href;
        action.download = '';
        action.textContent = 'Unduh: ' + file.name;
      }
      if (kind === 'task') {
        action.setAttribute('aria-label', action.textContent);
        action.classList.add('workroom-file-action');
        action.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="/gentleface-icons.svg#${file.media_type.startsWith('image/') ? 'image' : 'file-text'}"/></svg><span></span>`;
        action.lastElementChild.textContent = file.name;
      }
      const timestamp = document.createElement('small');
      timestamp.dataset.attachmentUploaded = '';
      timestamp.textContent = file.uploaded_at ? 'Diunggah ' + uploadTime.format(new Date(file.uploaded_at)) + ' WITA'
        : 'Waktu unggah tidak tercatat.';
      const confirmation = document.createElement('details');
      confirmation.innerHTML = `<summary><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3m3 0-1 15H7L6 6m4 4v7m4-7v7"/></svg></summary><button type="button">Konfirmasi hapus lampiran</button>`;
      confirmation.querySelector('summary').setAttribute('aria-label', 'Hapus ' + file.name);
      confirmation.querySelector('button').onclick = () => remove(file);
      row.append(action, confirmation);
      if (kind === 'task') action.lastElementChild.append(timestamp);
      else row.append(timestamp);
      return row;
    }));
  }

  function showPreview(file) {
    const pdf = file.media_type === 'application/pdf';
    const url = fileUrl(file.id, 'preview').href;
    dialog.querySelector('h2').textContent = file.name;
    const external = dialog.querySelector('a');
    external.href = url;
    external.textContent = pdf ? 'Buka PDF di tab baru' : 'Buka gambar di tab baru';
    frame.hidden = !pdf;
    image.hidden = pdf;
    if (pdf) frame.src = url;
    else {
      image.alt = file.name;
      image.src = url;
    }
    dialog.showModal();
  }

  async function request(url, options) {
    const response = await fetch(url, { ...options, signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Lampiran belum bisa diproses.');
    return data;
  }

  async function remove(file) {
    if (busy) return;
    busy = true;
    input.disabled = true;
    try {
      await request(fileUrl(file.id), { method: 'DELETE' });
      files = files.filter(item => item.id !== file.id);
      status.textContent = 'Lampiran dihapus.';
    } catch (error) {
      if (!signal.aborted) status.textContent = 'Lampiran gagal dihapus. ' + error.message;
    } finally {
      busy = false;
      render();
      if (!signal.aborted && section.isConnected) input.focus();
    }
  }
  dialog.addEventListener('close', () => {
    frame.removeAttribute('src');
    image.removeAttribute('src');
  }, { signal });
  input.addEventListener('change', async () => {
    const selected = [...input.files];
    input.value = '';
    if (busy || !selected.length) return;
    if (files.length + selected.length > 3) {
      status.textContent = 'Maksimal 3 lampiran. Pilih lebih sedikit atau hapus lampiran terlebih dahulu.';
      return;
    }
    busy = true;
    input.disabled = true;
    const added = [];
    const errors = [];
    for (const file of selected) {
      if (signal.aborted || !section.isConnected) break;
      if (file.size > 10000000) {
        errors.push(file.name + ' melebihi 10 MB.');
        continue;
      }
      const optimize = file.size > photoCompressionThreshold && /\.(jpe?g|png)$/i.test(file.name);
      try {
        status.textContent = optimize ? 'Mengompresi foto…' : 'Mengunggah file…';
        const payload = optimize ? await compressPhoto(file) : file;
        if (signal.aborted || !section.isConnected) break;
        status.textContent = 'Mengunggah file…';
        const upload = new URL(endpoint);
        upload.searchParams.set('name', payload.name);
        const attachment = await request(upload, {
          method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: payload,
        });
        files.push(attachment);
        added.push(attachment);
      } catch (error) {
        errors.push(file.name + ' — ' + error.message);
      }
    }
    if (signal.aborted || !section.isConnected) return;
    busy = false;
    render();
    status.textContent = errors.length ? 'File gagal diunggah. ' + errors.join(' ') : added.length + ' lampiran tersimpan.';
    const [file] = added;
    if (selected.length === 1 && file && !dialog.open &&
        (file.media_type === 'application/pdf' || file.media_type.startsWith('image/'))) showPreview(file);
  }, { signal });
  void request(endpoint).then(data => { files = data.files; }).catch(() => {
    if (!signal.aborted) status.textContent = 'Lampiran belum bisa dimuat.';
  }).finally(() => {
    if (signal.aborted) return;
    busy = false;
    render();
  });
}
