import { mountAttachment } from '/workroom-attachment.js';
import { bindBlockImages } from '/workroom-image-upload.js';
import { legacyContent, readBlockNote, blockNoteBody } from '/workroom-note-format.js';

const formatButtons = [
  ['blocks', 'Tambah blok', 'plus'], ['toggleBold', 'Tebal', 'bold'], ['toggleItalic', 'Miring', 'italic'],
  ['toggleUnderline', 'Garis bawah', 'underline'], ['toggleSuperscript', 'Superskrip', 'superscript'],
  ['toggleSubscript', 'Subskrip', 'subscript'], ['link', 'Sisipkan tautan', 'link'],
];
const paragraphOptions = {
  alignment: ['Perataan paragraf', { left: 'Kiri', center: 'Tengah', right: 'Kanan', justify: 'Rata kiri-kanan' }],
  leading: ['Spasi antarbaris', { '1': '1', normal: '1,65 (bawaan)', compact: '1,25 (lama)', '1.15': '1,15', '1.5': '1,5', '2': '2', '2.5': '2,5', '3': '3' }],
  spacing: ['Jarak antarparagraf', { none: 'Tanpa jarak', normal: 'Normal', wide: 'Lebar' }],
};

const paragraphIcons = {
  alignment: 'M3 5h18M3 10h13M3 15h18M3 20h13',
  leading: 'M5 4v16M2 7l3-3 3 3m-6 10 3 3 3-3M11 5h10m-10 7h10m-10 7h10',
  spacing: 'M3 4h18M3 7h18M12 10v4m-2-2 2-2 2 2m-4 0 2 2 2-2M3 17h18M3 20h18',
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

  const basicCommands = new Set(['blocks', 'toggleBold', 'toggleItalic', 'link']);
  const formatButton = ([command, label, icon]) =>
    `<button type="button" data-task-format="${command}" aria-label="${label}" title="${label}"><svg class="ui-icon" aria-hidden="true"><use href="/gentleface-icons.svg#${icon}"/></svg></button>`;
  toolbar.innerHTML = formatButtons.filter(([command]) => basicCommands.has(command)).map(formatButton).join('') +
    `<details class="note-format-more">
      <summary aria-label="Format lainnya" title="Format lainnya"><svg class="ui-icon" aria-hidden="true"><use href="/gentleface-icons.svg#more-horizontal"/></svg></summary>
      <div>${formatButtons.filter(([command]) => !basicCommands.has(command)).map(formatButton).join('')}
      <label class="note-icon-field" title="Palet warna">
              <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1.4 1.4 0 0 1 1.1-2.3H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3Z"/>
                <path stroke-linecap="round" stroke-width="2.8" d="M7.5 11h.01M10 7.5h.01M14 7.5h.01M17.5 10.5h.01"/>
              </svg>
              <input type="color" data-task-color aria-label="Palet warna" value="#1d97f1">
            </label>
            <label class="note-icon-field" title="Ukuran teks">
              <span class="note-text-size-icon" aria-hidden="true">A↕</span>
              <select data-task-size aria-label="Ukuran teks">
                <option value="">Ukuran teks</option>
                ${[10, 13, 16, 18, 24, 32, 48].map(px => `<option value="${px}px">${px} px</option>`).join('')}
              </select>
            </label>
            ${Object.entries(paragraphOptions).map(([key, [label, options]]) => `
              <label class="note-icon-field" title="${label}">
                <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="${paragraphIcons[key]}"/></svg>
                <select data-task-paragraph="${key}" aria-label="${label}">
                  ${Object.entries(options).map(([value, name]) => `<option value="${value}">${name}</option>`).join('')}
                </select>
              </label>`).join('')}
            <label class="note-icon-field" title="Sisipkan tanggal">
              <svg class="ui-icon" aria-hidden="true"><use href="/gentleface-icons.svg#calendar-day"/></svg>
              <input type="date" data-task-date aria-label="Sisipkan tanggal">
            </label></div></details>`;
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

export function mount(panel, signal) {
  const editor = panel.querySelector('.workspace-editor form');
  const attachment = panel.querySelector('[data-task-attachment]');
  if (attachment) {
    mountAttachment(attachment, 'task', attachment.dataset.taskAttachment, signal);
    panel.querySelector('[data-task-proof-link]').hidden = false;
  }
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
  const started = new Set();
  function loadVisibleEditors() {
    for (const field of tools) {
      if (started.has(field) || field.closest('details:not([open])')) continue;
      started.add(field);
      void import('/workroom-block-editor.js').then(({ mountBlockEditor }) => {
        if (!signal.aborted) mountDetail(field, mountBlockEditor, signal);
      }).catch(() => {
        if (signal.aborted) return;
        field.hidden = false;
        field.querySelector('.task-detail-status').textContent = 'Editor detail belum bisa dimuat.';
      });
    }
  }
  if (tools.length) {
    panel.addEventListener('toggle', loadVisibleEditors, { capture: true, signal });
    loadVisibleEditors();
  }
  return guard;
}
