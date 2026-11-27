import { bindImageEditing } from '/workroom-image-upload.js';

export function mount(panel, signal) {
  function webUrl(value, httpsOnly = false) {
    try {
      const url = new URL(value);
      if ((url.protocol === 'https:' || (!httpsOnly && url.protocol === 'http:')) &&
          !url.username && !url.password) return url.href;
    } catch {
      return null;
    }
    return null;
  }

  function trimLink(value) {
    let opens = 0;
    let closes = 0;
    for (const character of value) {
      if (character === '(') opens++;
      if (character === ')') closes++;
    }
    let end = value.length;
    while (end && (/[.,;:!?]/.test(value[end - 1]) || (value[end - 1] === ')' && closes > opens))) {
      if (value[end - 1] === ')') closes--;
      end--;
    }
    return value.slice(0, end);
  }

  function externalLink(url, label) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    return link;
  }

  function linkPreview(url, label) {
    const item = document.createElement('div');
    item.className = 'task-detail-link';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="/gentleface-icons.svg#more-horizontal"/></svg>';
    toggle.setAttribute('aria-label', 'Opsi link');
    toggle.title = 'Opsi link';
    toggle.dataset.linkOptions = '';
    toggle.setAttribute('aria-expanded', 'false');
    item.append(externalLink(url, label), toggle);
    return item;
  }

  function imagePreview(url, label) {
    const source = new URL(url);
    if (source.origin === location.origin && /^\/workroom\/images\/[a-f0-9]{64}$/.test(source.pathname)) {
      const placement = new URLSearchParams(source.hash.slice(1)).get('layout');
      const image = document.createElement('img');
      image.alt = label || 'Gambar tugas';
      image.className = 'task-uploaded-image';
      if (['left', 'right', 'front', 'behind'].includes(placement)) image.dataset.imageLayout = placement;
      image.src = source.pathname;
      return image;
    }
    const item = document.createElement('div');
    item.className = 'task-detail-image';
    const show = document.createElement('button');
    show.type = 'button';
    show.textContent = 'Tampilkan gambar';
    const link = externalLink(url, label || 'Buka gambar di tab baru');
    item.append(show, link);
    show.onclick = () => {
      const image = document.createElement('img');
      image.alt = label || 'Gambar tugas';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.onerror = () => {
        const message = document.createElement('p');
        message.textContent = 'Gambar gagal dimuat. Coba buka tautannya di tab baru.';
        image.replaceWith(message);
      };
      item.append(image);
      image.src = url;
      show.remove();
      link.focus();
    };
    return item;
  }

  const editor = panel.querySelector('.workspace-editor form');
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
      let success = false;
      try {
        const response = await fetch(editor.getAttribute('action'), { method: 'POST', body: data });
        if (!response.ok || !(await response.json()).saved) throw new Error('Save failed');
        saved = snapshot;
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
        if (dirty && current !== snapshot) void save();
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

  for (const tools of panel.querySelectorAll('.task-detail-tools')) {
    const field = tools.closest('form').elements.body;
    const preview = tools.querySelector('.task-detail-preview');
    const status = tools.querySelector('.task-detail-status');
    const toggle = tools.querySelector('.task-image-toggle');
    const imageFields = tools.querySelector('.task-image-fields');
    const imageUrl = tools.querySelector('.task-image-url');
    tools.prepend(preview);

    const input = field.cloneNode(false);
    input.removeAttribute('name');
    input.dataset.taskDetailInput = '';
    input.rows = 5;
    field.replaceWith(input);
    input.closest('label').after(field);
    field.hidden = true;

    const tokens = /!\[([^\]\r\n]*)\]\(((?:https:\/\/[^\s)]+|\/workroom\/images\/[a-f0-9]{64}(?:#[a-z0-9=&-]+)?))\)|https?:\/\/[^\s<>"'`]+/gi;
    const markerPattern = /〔Gambar (\d+)〕/g;
    let images = [];
    function expand(text) {
      return text.replace(markerPattern, (marker, index) => images[Number(index) - 1] ?? marker);
    }
    function sourceCursor() {
      let cursor = input.selectionEnd;
      for (const marker of input.value.matchAll(markerPattern)) {
        if (cursor > marker.index && cursor < marker.index + marker[0].length) {
          cursor = marker.index + marker[0].length;
          break;
        }
      }
      return expand(input.value.slice(0, cursor)).length;
    }
    function renderInput() {
      images = [];
      input.value = field.value.replace(tokens, (token, label, url) => {
        if (url === undefined) return token;
        return '〔Gambar ' + images.push(token) + '〕';
      });
    }
    function publishBody() {
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    input.addEventListener('input', () => {
      const text = expand(input.value);
      if (text.length > field.maxLength) {
        status.textContent = 'Detail tugas terlalu panjang.';
        renderInput();
        return;
      }
      field.value = text;
      publishBody();
    });

    function render() {
      const text = field.value;
      const nodes = [];
      let offset = 0;
      for (const match of text.matchAll(tokens)) {
        const isImage = match[2] !== undefined;
        const value = isImage ? match[2] : trimLink(match[0]);
        const url = isImage && value.startsWith('/workroom/images/')
          ? new URL(value, location.origin).href : webUrl(value, isImage);
        if (!url) continue;
        nodes.push(text.slice(offset, match.index));
        const node = isImage ? imagePreview(url, match[1]) : linkPreview(url, value);
        nodes.push(node);
        if (node.classList.contains('task-uploaded-image')) bindImageEditing(node, url, node.dataset.imageLayout, ({ url }) => {
          const start = match.index;
          const end = start + match[0].length;
          const next = '![' + match[1] + '](' + url + ')';
          if (field.value !== text || field.value.length - (end - start) + next.length > field.maxLength) return false;
          field.setRangeText(next, start, end, 'end');
          renderInput();
          publishBody();
          input.focus();
          return true;
        });
        offset = match.index + (isImage ? match[0].length : value.length);
      }
      preview.hidden = !nodes.length;
      if (nodes.length) nodes.push(text.slice(offset));
      preview.replaceChildren(...nodes);
    }

    toggle.onclick = () => {
      imageFields.hidden = !imageFields.hidden;
      toggle.setAttribute('aria-expanded', String(!imageFields.hidden));
      if (!imageFields.hidden) imageUrl.focus();
    };

    function attachImage(url) {
      const cursor = sourceCursor();
      const insert = (cursor && field.value[cursor - 1] !== '\n' ? '\n' : '') +
        '![](' + url.replaceAll(')', '%29') + ')' +
        (cursor < field.value.length && field.value[cursor] !== '\n' ? '\n' : '');
      if (field.value.length + insert.length > field.maxLength) {
        status.textContent = 'Detail tugas terlalu panjang untuk menambah gambar.';
        return false;
      }
      field.setRangeText(insert, cursor, cursor, 'end');
      renderInput();
      publishBody();
      input.focus();
      return true;
    }

    function insertImage() {
      const url = webUrl(imageUrl.value.trim(), true);
      if (!url) {
        status.textContent = 'Masukkan URL gambar HTTPS yang valid.';
        return;
      }
      if (!attachImage(url)) return;
      imageUrl.value = '';
      imageFields.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      status.textContent = editor?.contains(field) ? 'Gambar ditambahkan.' : 'Gambar ditambahkan. Simpan tugas untuk menyimpan perubahan.';
    }

    imageUrl.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      insertImage();
    });
    tools.querySelector('.task-image-add').onclick = insertImage;
    input.addEventListener('workroom-image', event => {
      if (attachImage(event.detail.url)) event.preventDefault();
    });
    field.addEventListener('input', render);
    tools.hidden = false;
    renderInput();
    render();
  }
  return guard;
}
