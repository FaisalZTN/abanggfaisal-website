const uploadTime = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Makassar',
});

export function mountAttachment(section, kind, id, signal) {
  const endpoint = new URL(kind === 'task' ? '/workroom/tasks/' : '/workroom/notes/', location.origin);
  endpoint.searchParams.set('attachment', id);
  const preview = new URL(endpoint);
  preview.searchParams.set('preview', '');
  const download = new URL(endpoint);
  download.searchParams.set('download', '');
  section.innerHTML = `
    <h3 id="workroom-attachment-heading">${kind === 'task' ? 'Bukti tugas' : 'Lampiran catatan'}</h3>
    <label class="task-pdf-picker"><input class="note-sr-only" type="file" disabled
      accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.tsv,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.zip,.mp3,.m4a,.wav,.mp4,.mov,.heic">
      <span>Pilih file <small>· maks. 10 MB</small></span></label>
    <button type="button" data-attachment-open hidden></button>
    <a class="workroom-attachment-download" href="${download.href}" download hidden></a>
    <small data-attachment-uploaded hidden></small>
    <p role="status"></p>
    <dialog class="workroom-url-dialog task-pdf-preview" aria-labelledby="workroom-attachment-title">
      <div class="task-pdf-actions">
        <h2 id="workroom-attachment-title"></h2>
        <a href="${preview.href}" target="_blank" rel="noopener noreferrer"></a>
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
  const open = section.querySelector('[data-attachment-open]');
  const downloadLink = section.querySelector('[download]');
  const status = section.querySelector('[role="status"]');
  const dialog = section.querySelector('dialog');
  const frame = dialog.querySelector('iframe');
  const image = dialog.querySelector('img');
  const uploaded = section.querySelector('[data-attachment-uploaded]');
  let current;

  function display(file) {
    current = file;
    const { name, media_type: type, uploaded_at: timestamp } = file;
    const pdf = type === 'application/pdf';
    const canPreview = pdf || type?.startsWith('image/');
    uploaded.hidden = !name;
    uploaded.textContent = timestamp ? 'Diunggah ' + uploadTime.format(new Date(timestamp)) + ' WITA'
      : 'Waktu unggah tidak tercatat.';
    open.hidden = !name || !canPreview;
    open.textContent = name ? (pdf ? 'Lihat PDF: ' : 'Lihat gambar: ') + name : '';
    downloadLink.hidden = !name || canPreview;
    downloadLink.textContent = name ? 'Unduh: ' + name : '';
    dialog.querySelector('h2').textContent = name ?? '';
    dialog.querySelector('a').textContent = pdf ? 'Buka PDF di tab baru' : 'Buka gambar di tab baru';
  }

  function showPreview() {
    const pdf = current.media_type === 'application/pdf';
    frame.hidden = !pdf;
    image.hidden = pdf;
    if (pdf) frame.src = preview.href;
    else {
      image.alt = current.name;
      image.src = preview.href;
    }
    dialog.showModal();
  }

  async function request(url, options) {
    const response = await fetch(url, { ...options, signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Lampiran belum bisa diproses.');
    return data;
  }

  open.addEventListener('click', showPreview, { signal });
  dialog.addEventListener('close', () => {
    frame.removeAttribute('src');
    image.removeAttribute('src');
  }, { signal });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > 10000000) {
      status.textContent = 'Ukuran file maksimal 10 MB.';
      return;
    }
    input.disabled = true;
    status.textContent = 'Mengunggah file…';
    const upload = new URL(endpoint);
    upload.searchParams.set('name', file.name);
    try {
      const attachment = await request(upload, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
      });
      if (signal.aborted || !section.isConnected) return;
      display(attachment);
      status.textContent = 'Lampiran tersimpan.';
      if (!open.hidden && !dialog.open) showPreview();
    } catch (error) {
      if (!signal.aborted) status.textContent = 'File gagal diunggah. ' + error.message;
    } finally {
      input.disabled = false;
    }
  }, { signal });
  void request(endpoint).then(display).catch(() => {
    if (!signal.aborted) status.textContent = 'Lampiran belum bisa dimuat.';
  }).finally(() => { input.disabled = false; });
}
