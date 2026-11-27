import { bindBlockImages } from '/workroom-image-upload.js';
import { legacyContent, readBlockNote, blockNoteBody } from '/workroom-note-format.js';

const formatButtons = [
  ['blocks', 'Tambah blok', 'plus'], ['toggleBold', 'Tebal', 'bold'], ['toggleItalic', 'Miring', 'italic'],
  ['toggleUnderline', 'Garis bawah', 'underline'], ['toggleSuperscript', 'Superskrip', 'superscript'],
  ['toggleSubscript', 'Subskrip', 'subscript'], ['link', 'Sisipkan atau edit tautan', 'link'],
];
const paragraphOptions = {
  alignment: ['Perataan paragraf', { left: 'Kiri', center: 'Tengah', right: 'Kanan', justify: 'Rata kiri-kanan' }],
  leading: ['Spasi antarbaris', { '1': '1', normal: '1,25', '1.5': '1,5', '2': '2', '2.5': '2,5', '3': '3' }],
  spacing: ['Jarak antarparagraf', { none: 'Tanpa jarak', normal: 'Normal', wide: 'Lebar' }],
};

function mountDetail(tools, mountBlockEditor, signal) {
  const field = tools.closest('form').elements.body;
  const host = tools.querySelector('[data-task-detail-input]');
  const toolbar = tools.querySelector('.note-toolbar');
  const dialog = document.createElement('dialog');
  dialog.className = 'workroom-url-dialog';
  dialog.innerHTML = `<form>
    <h2></h2><label>Alamat URL<input type="url" required inputmode="url" autocomplete="off" placeholder="https://…"></label>
    <div class="workroom-url-actions"><button type="button" data-remove-link hidden>Hapus tautan</button>
      <button type="button" data-cancel>Batal</button><button type="submit">Simpan</button></div>
  </form>`;
  tools.append(dialog);
  const urlInput = dialog.querySelector('input');
  const remove = dialog.querySelector('[data-remove-link]');
  let applyUrl;
  let removeUrl;
  function openUrl(title, value, apply, removeLink) {
    dialog.setAttribute('aria-label', title);
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('[type="submit"]').textContent = title;
    urlInput.value = value;
    urlInput.setCustomValidity('');
    remove.hidden = !removeLink;
    applyUrl = apply;
    removeUrl = removeLink;
    dialog.showModal();
    urlInput.select();
  }
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  remove.onclick = () => { dialog.close(); removeUrl(); };
  urlInput.oninput = () => urlInput.setCustomValidity('');
  dialog.querySelector('form').onsubmit = event => {
    event.preventDefault();
    const href = urlInput.value.trim();
    if (!/^https:\/\/[^\s]+$/i.test(href) || !URL.canParse(href)) {
      urlInput.setCustomValidity('Masukkan URL HTTPS yang valid.');
      urlInput.reportValidity();
      return;
    }
    dialog.close();
    applyUrl(href);
  };

  toolbar.innerHTML = formatButtons.map(([command, label, icon]) =>
    `<button type="button" data-task-format="${command}" aria-label="${label}" title="${label}"><svg class="ui-icon" aria-hidden="true"><use href="/gentleface-icons.svg#${icon}"/></svg></button>`).join('') +
    `<details class="task-format-options"><summary>Format paragraf</summary><div class="fields"><label>Warna teks<input type="color" data-task-color value="#1d97f1"></label>
    <label>Ukuran teks<select data-task-size><option value="">Bawaan</option>${[10, 13, 16, 18, 24, 32, 48].map(size => `<option value="${size}px">${size} px</option>`).join('')}</select></label>
    ${Object.entries(paragraphOptions).map(([key, [label, options]]) => `<label>${label}<select data-task-paragraph="${key}">
      ${Object.entries(options).map(([value, name]) => `<option value="${value}">${name}</option>`).join('')}</select></label>`).join('')}
    <label>Sisipkan tanggal<input type="date" data-task-date></label></div></details>`;
  const legacy = field.value.replace(/!\[([^\]\r\n]*)\]\((https?:\/\/[^\s)]+)\)/g, (token, label, value) => {
    if (!URL.canParse(value)) return token;
    const url = new URL(value);
    return url.origin === location.origin && /^\/workroom\/images\/[a-f0-9]{64}$/.test(url.pathname)
      ? '![' + label + '](' + url.pathname + url.hash + ')' : token;
  });
  const block = mountBlockEditor(host, readBlockNote(field.value) ?? legacyContent(legacy), document => {
    field.value = blockNoteBody(document);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    bindBlockImages(block.editor);
  }, attrs => {
    for (const select of toolbar.querySelectorAll('[data-task-paragraph]')) {
      select.value = attrs[select.dataset.taskParagraph] ?? (select.dataset.taskParagraph === 'alignment' ? 'left' : 'normal');
    }
  }, 'Detail tugas', apply => openUrl('Sisipkan gambar dari URL', '', apply));
  const { editor } = block;
  bindBlockImages(editor);
  field.closest('label').hidden = true;
  tools.hidden = false;
  toolbar.onmousedown = event => {
    if (event.target.closest('button')) event.preventDefault();
  };
  toolbar.onclick = event => {
    const command = event.target.closest('button')?.dataset.taskFormat;
    if (!command) return;
    if (command === 'blocks') return block.showBlocks();
    if (command !== 'link') return editor.chain().focus()[command]().run();
    const { selection, doc } = editor.state;
    const value = editor.getAttributes('link').href;
    function update(href) {
      if (editor.state.doc !== doc || editor.isDestroyed) return;
      const chain = editor.chain().focus().setTextSelection({ from: selection.from, to: selection.to });
      if (value && selection.empty) chain.extendMarkRange('link');
      if (!href) chain.unsetLink().run();
      else if (value || !selection.empty) chain.setLink({ href }).run();
      else chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    }
    openUrl(value ? 'Simpan tautan' : 'Sisipkan tautan', value ?? '', update, value ? () => update() : null);
  };
  toolbar.onchange = ({ target }) => {
    const chain = editor.chain().focus();
    if (target.matches('[data-task-color]')) chain.setColor(target.value).run();
    if (target.matches('[data-task-size]')) (target.value ? chain.setFontSize(target.value) : chain.unsetFontSize()).run();
    if (target.dataset.taskParagraph) chain.setParagraphLayout(target.dataset.taskParagraph, target.value).run();
    if (target.matches('[data-task-date]') && target.value) {
      chain.insertContent(target.value).run();
      target.value = '';
    }
  };
  host.addEventListener('workroom-image', event => {
    if (block.image(event.detail.url, event.detail.layout)) event.preventDefault();
  }, { signal });
  signal.addEventListener('abort', () => {
    if (dialog.open) dialog.close();
    block.destroy();
  }, { once: true });
}

function mountTaskPdf(section, signal) {
  const endpoint = new URL('/workroom/tasks/', location.origin);
  endpoint.searchParams.set('pdf', section.dataset.taskPdf);
  const preview = new URL(endpoint);
  preview.searchParams.set('preview', '');
  const input = section.querySelector('input');
  const open = section.querySelector('[data-pdf-open]');
  const status = section.querySelector('[role="status"]');
  const dialog = section.querySelector('dialog');
  const frame = dialog.querySelector('iframe');
  dialog.querySelector('a').href = preview.href;
  section.hidden = false;

  function display(name) {
    open.hidden = !name;
    open.textContent = name ? 'Lihat PDF: ' + name : '';
    dialog.querySelector('h2').textContent = name ?? '';
  }

  function showPreview() {
    frame.src = preview.href;
    dialog.showModal();
  }

  async function requestPdf(url, options) {
    const response = await fetch(url, { ...options, signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'PDF belum bisa diproses.');
    return data;
  }

  open.addEventListener('click', showPreview, { signal });
  dialog.addEventListener('close', () => frame.removeAttribute('src'), { signal });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > 1900000) {
      status.textContent = 'Ukuran PDF maksimal 1,9 MB.';
      return;
    }
    input.disabled = true;
    status.textContent = 'Mengunggah PDF…';
    const upload = new URL(endpoint);
    upload.searchParams.set('name', file.name);
    try {
      const { name } = await requestPdf(upload, {
        method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file,
      });
      if (signal.aborted) return;
      display(name);
      status.textContent = 'PDF tersimpan.';
      if (!dialog.open) showPreview();
    } catch {
      if (!signal.aborted) status.textContent = 'PDF gagal diunggah. Cek format file dan coba lagi.';
    } finally {
      input.disabled = false;
    }
  }, { signal });
  void requestPdf(endpoint).then(({ name }) => display(name)).catch(() => {
    if (!signal.aborted) status.textContent = 'Lampiran PDF belum bisa dimuat.';
  }).finally(() => { input.disabled = false; });
}

export function mount(panel, signal) {
  const editor = panel.querySelector('.workspace-editor form');
  const pdf = panel.querySelector('[data-task-pdf]');
  if (pdf) mountTaskPdf(pdf, signal);
  let guard;
  if (editor) {
    const status = editor.querySelector('[data-task-save-status]');
    const saveButton = editor.querySelector('button[value="save"]');
    let saved = new URLSearchParams(new FormData(editor)).toString();
    let timer;
    let pending = false;
    let dirty = false;

    async function save() {
      clearTimeout(timer);
      if (pending || signal.aborted) return;
      const data = new URLSearchParams(new FormData(editor));
      const snapshot = data.toString();
      dirty = snapshot !== saved;
      if (!dirty) {
        status.textContent = '';
        return;
      }
      if (!editor.checkValidity() || !String(data.get('title')).trim()) {
        status.textContent = 'Judul tugas wajib diisi.';
        return;
      }

      pending = true;
      status.textContent = 'Menyimpan…';
      data.set('action', 'save');
      data.set('autosave', '1');
      const submittedStatus = data.get('status');
      if (submittedStatus === new URLSearchParams(saved).get('status')) data.set('preserve_status', '1');
      let success = false;
      try {
        const response = await fetch(editor.getAttribute('action'), { method: 'POST', body: data });
        if (!response.ok) throw new Error('Save failed');
        const result = await response.json();
        if (!result.saved) throw new Error('Save failed');
        const persisted = new URLSearchParams(snapshot);
        persisted.set('status', result.status);
        if (editor.elements.status.value === submittedStatus) editor.elements.status.value = result.status;
        saved = persisted.toString();
        success = true;
        status.textContent = 'Tersimpan otomatis.';
      } catch {
        status.textContent = 'Gagal menyimpan. Klik Coba lagi.';
        saveButton.textContent = 'Coba lagi';
        saveButton.hidden = false;
      } finally {
        pending = false;
        const current = new URLSearchParams(new FormData(editor)).toString();
        dirty = current !== saved;
        if (success) saveButton.hidden = true;
        if (success && dirty && current !== snapshot) void save();
      }
    }

    function schedule(event) {
      if (!event.target.name) return;
      dirty = true;
      status.textContent = 'Menunggu untuk menyimpan…';
      clearTimeout(timer);
      timer = setTimeout(save, 500);
    }

    saveButton.hidden = true;
    editor.addEventListener('input', schedule, { signal });
    editor.addEventListener('change', schedule, { signal });
    editor.addEventListener('submit', event => {
      if (event.submitter?.value === 'delete') return;
      event.preventDefault();
      void save();
    }, { signal });
    window.addEventListener('beforeunload', event => {
      if (!dirty && !pending) return;
      event.preventDefault();
      event.returnValue = '';
    }, { signal });
    signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    guard = () => {
      if (!dirty && !pending) return false;
      void save();
      return 'busy';
    };
  }

  const tools = [...panel.querySelectorAll('.task-detail-tools')];
  if (tools.length) void import('/workroom-block-editor.js').then(({ mountBlockEditor }) => {
    if (signal.aborted) return;
    for (const field of tools) {
      try { mountDetail(field, mountBlockEditor, signal); }
      catch {
        field.hidden = false;
        field.querySelector('.task-detail-status').textContent = 'Editor detail belum bisa dimuat.';
      }
    }
  }).catch(() => {
    if (signal.aborted) return;
    for (const field of tools) {
      field.hidden = false;
      field.querySelector('.task-detail-status').textContent = 'Editor detail belum bisa dimuat.';
    }
  });
  return guard;
}
