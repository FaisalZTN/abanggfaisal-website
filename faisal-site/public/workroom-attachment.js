import { compressWorkroomImage } from '/workroom-image-upload.js';

const photoCompressionThreshold = 1000000;
const maxSize = 10000000;
const maxFiles = 3;
const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

function formatSize(bytes) {
  if (bytes < 1000) return number.format(bytes) + ' B';
  if (bytes < 1000000) return number.format(bytes / 1000) + ' KB';
  return number.format(bytes / 1000000) + ' MB';
}

function fileIcon(isImage) {
  return `<svg class="ui-icon attachment-file-icon" aria-hidden="true"><use href="/gentleface-icons.svg#${isImage ? 'image' : 'file-text'}"/></svg>`;
}

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
    <div class="workroom-attachment-heading">
      <h3 id="workroom-attachment-heading">${kind === 'task' ? 'Bukti tugas' : 'Lampiran catatan'}</h3>
      <small data-attachment-count hidden></small>
    </div>
    <label class="task-pdf-picker"><input class="note-sr-only" type="file" multiple disabled
      accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.tsv,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.zip,.mp3,.m4a,.wav,.mp4,.mov,.heic">
      <svg class="ui-icon attachment-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/></svg>
      <span><span class="attachment-drop-hint">Seret file ke sini atau </span><strong>Pilih file</strong>
        <small>Dokumen, gambar, media, atau ZIP · maks. 10 MB per file</small></span></label>
    <ul class="workroom-attachment-list attachment-uploads" aria-label="Unggahan dan file ditolak" hidden></ul>
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
  const zone = input.closest('label');
  const list = section.querySelector('ul[aria-label="Daftar lampiran"]');
  const uploads = section.querySelector('.attachment-uploads');
  const extensions = new Set(input.accept.split(','));
  const count = section.querySelector('[data-attachment-count]');
  const status = section.querySelector('[role="status"]');
  const dialog = section.querySelector('dialog');
  const frame = dialog.querySelector('iframe');
  const image = dialog.querySelector('img');
  let files = [];
  let busy = true;

  function render(reveal = []) {
    count.hidden = false;
    count.textContent = files.length + ' dari ' + maxFiles + ' lampiran';
    zone.hidden = files.length >= maxFiles;
    list.hidden = !files.length;
    input.disabled = files.length >= maxFiles || busy;
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
      action.setAttribute('aria-label', action.textContent);
      action.classList.add('workroom-file-action');
      action.innerHTML = fileIcon(file.media_type.startsWith('image/')) + '<span></span>';
      action.lastElementChild.textContent = file.name;
      row.classList.toggle('workroom-file-added', reveal.includes(file));
      if (Number.isFinite(file.size)) {
        const size = document.createElement('small');
        size.textContent = formatSize(file.size);
        action.lastElementChild.append(size);
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
      action.lastElementChild.append(timestamp);
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
  function uploadFile(url, payload, progress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const abort = () => xhr.abort();
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) progress.value = Math.min(99, event.loaded / event.total * 100);
      };
      xhr.open('POST', url);
      xhr.responseType = 'json';
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.onload = () => {
        if (xhr.status === 201 && xhr.response?.id) resolve(xhr.response);
        else reject(new Error(xhr.response?.error || 'Lampiran belum bisa diproses.'));
      };
      xhr.onerror = xhr.onabort = () => reject(new Error('Unggahan terputus.'));
      xhr.onloadend = () => signal.removeEventListener('abort', abort);
      signal.addEventListener('abort', abort, { once: true });
      xhr.send(payload);
    });
  }

  function uploadRow(file) {
    const row = document.createElement('li');
    row.innerHTML = `${fileIcon(file.type.startsWith('image/'))}<div class="attachment-upload-info">
      <strong></strong><small></small><progress max="100" hidden></progress>
      <p role="alert" hidden></p></div><button type="button" class="attachment-dismiss" hidden>
        <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
      </button>`;
    row.querySelector('strong').textContent = file.name;
    row.querySelector('small').textContent = formatSize(file.size);
    const progress = row.querySelector('progress');
    progress.setAttribute('aria-label', 'Unggah ' + file.name);
    const error = row.querySelector('[role="alert"]');
    const dismiss = row.querySelector('button');
    dismiss.setAttribute('aria-label', 'Tutup pesan untuk ' + file.name);
    function clear() {
      row.remove();
      uploads.hidden = !uploads.children.length;
    }
    dismiss.onclick = () => {
      clear();
      (uploads.querySelector('button:not([hidden])') ??
        (input.disabled ? list.querySelector('.workroom-file-action') : input))?.focus();
    };
    uploads.append(row);
    uploads.hidden = false;
    return {
      progress,
      clear,
      fail(message) {
        progress.hidden = true;
        error.hidden = dismiss.hidden = false;
        error.textContent = message;
      },
    };
  }

  async function addFiles(selected) {
    if (busy || !selected.length) return;
    busy = true;
    input.disabled = true;
    const added = [];
    let rejected = false;
    for (const file of selected) {
      if (signal.aborted) return;
      const row = uploadRow(file);
      const extension = /\.[a-z0-9]+$/i.exec(file.name)?.[0].toLowerCase();
      try {
        if (!extensions.has(extension)) throw new Error('Format file belum didukung.');
        if (!file.size) throw new Error('File kosong.');
        if (file.size > maxSize) throw new Error('Ukuran file maksimal 10 MB.');
        if (files.length >= maxFiles) throw new Error('Maksimal 3 lampiran.');
        const optimize = file.size > photoCompressionThreshold && /\.(jpe?g|png)$/i.test(file.name);
        status.textContent = optimize ? 'Mengompresi foto…' : 'Mengunggah file…';
        row.progress.hidden = false;
        const payload = optimize ? await compressPhoto(file) : file;
        if (signal.aborted) return;
        status.textContent = 'Mengunggah file…';
        const upload = new URL(endpoint);
        upload.searchParams.set('name', payload.name);
        row.progress.value = 0;
        const attachment = await uploadFile(upload, payload, row.progress);
        files.push(attachment);
        added.push(attachment);
        row.clear();
      } catch (error) {
        if (signal.aborted) return;
        rejected = true;
        row.fail(error.message);
      }
    }
    busy = false;
    render(added);
    if (input.disabled) section.querySelector('.workroom-file-action')?.focus();
    const result = [added.length ? added.length + ' lampiran tersimpan.' : '',
      rejected ? 'File gagal diunggah. Lihat pesan di bawah nama file.' : ''];
    status.textContent = result.filter(Boolean).join(' ');
    const [file] = added;
    if (selected.length === 1 && file && !dialog.open &&
        (file.media_type === 'application/pdf' || file.media_type.startsWith('image/'))) showPreview(file);
  }

  input.addEventListener('change', () => {
    const selected = [...input.files];
    input.value = '';
    void addFiles(selected);
  }, { signal });
  for (const type of ['dragenter', 'dragover']) {
    zone.addEventListener(type, event => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = input.disabled ? 'none' : 'copy';
      zone.toggleAttribute('data-drag-over', !input.disabled);
    }, { signal });
  }
  zone.addEventListener('dragleave', event => {
    if (!zone.contains(event.relatedTarget)) zone.removeAttribute('data-drag-over');
  }, { signal });
  zone.addEventListener('drop', event => {
    zone.removeAttribute('data-drag-over');
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    void addFiles([...event.dataTransfer.files]);
  }, { signal });
  void request(endpoint).then(data => { files = data.files; }).catch(() => {
    if (!signal.aborted) status.textContent = 'Lampiran belum bisa dimuat.';
  }).finally(() => {
    if (signal.aborted) return;
    busy = false;
    render();
  });
}
