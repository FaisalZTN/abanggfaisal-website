export function mount(panel, signal) {
  const listen = (target, type, handler, options) => target.addEventListener(type, handler, { ...options, signal });
  const pending = new WeakSet();
  function targetEditor(target) {
    return target.closest?.('#edit-body, #note-split-body, .workspace-editor textarea[name="body"], #add-task textarea[name="body"]');
  }
  function status(editor, text) {
    const message = editor.matches('#edit-body, #note-split-body') ? panel.querySelector('#' + 'note-status')
      : editor.closest('form').querySelector('.task-detail-status');
    if (message) message.textContent = text;
  }
  const dialog = document.createElement('dialog');
  dialog.className = 'workroom-url-dialog workroom-crop';
  dialog.setAttribute('aria-labelledby', 'workroom-crop-title');
  dialog.innerHTML = `<form>
    <h2 id="workroom-crop-title">Siapkan gambar</h2>
    <p>Seret pada pratinjau untuk memilih area crop, atau sesuaikan tepinya.</p>
    <canvas aria-hidden="true"></canvas>
    <div class="workroom-crop-fields">
      ${['Kiri', 'Atas', 'Kanan', 'Bawah'].map(label =>
        `<label>${label} (%)<input type="number" min="0" max="99" value="0" required></label>`).join('')}
    </div>
    <label>Posisi gambar<select>
      <option value="inline">Dalam alur teks</option>
      <option value="left">Di samping teks · kiri</option>
      <option value="right">Di samping teks · kanan</option>
      <option value="behind">Di belakang teks</option>
      <option value="front">Di depan teks</option>
    </select></label>
    <p role="alert" hidden>Sisakan area gambar yang ingin dipakai.</p>
    <div class="workroom-url-actions">
      <button type="button" data-crop-reset>Reset crop</button>
      <button type="button" data-crop-cancel>Batal</button>
      <button type="submit">Sisipkan gambar</button>
    </div>
  </form>`;
  panel.append(dialog);
  const canvas = dialog.querySelector('canvas');
  const fields = [...dialog.querySelectorAll('input')];
  const layout = dialog.querySelector('select');
  const error = dialog.querySelector('[role="alert"]');
  let previewImage;
  let finishCrop;
  let dragStart;

  function bounds(width, height) {
    const [left, top, right, bottom] = fields.map(field => Number(field.value) / 100);
    return {
      x: Math.round(width * left), y: Math.round(height * top),
      width: Math.round(width * (1 - right)) - Math.round(width * left),
      height: Math.round(height * (1 - bottom)) - Math.round(height * top),
    };
  }

  function drawCrop() {
    const { width, height } = canvas;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, width, height);
    context.drawImage(previewImage, 0, 0, width, height);
    const crop = bounds(width, height);
    context.fillStyle = 'rgb(0 0 0 / .55)';
    context.beginPath();
    context.rect(0, 0, width, height);
    if (crop.width > 0 && crop.height > 0) context.rect(crop.x, crop.y, crop.width, crop.height);
    context.fill('evenodd');
    error.hidden = true;
  }

  function pointer(event) {
    const box = canvas.getBoundingClientRect();
    return [Math.round(100 * (event.clientX - box.left) / box.width),
      Math.round(100 * (event.clientY - box.top) / box.height)].map(value => Math.max(0, Math.min(100, value)));
  }

  listen(canvas, 'pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    dragStart = pointer(event);
    canvas.setPointerCapture(event.pointerId);
  });
  listen(canvas, 'pointermove', event => {
    if (!dragStart || !canvas.hasPointerCapture(event.pointerId)) return;
    const [x, y] = pointer(event);
    const [startX, startY] = dragStart;
    [Math.min(x, startX), Math.min(y, startY), 100 - Math.max(x, startX), 100 - Math.max(y, startY)]
      .forEach((value, index) => { fields[index].value = Math.min(99, value); });
    drawCrop();
  });
  listen(canvas, 'lostpointercapture', () => { dragStart = undefined; });
  for (const field of fields) listen(field, 'input', drawCrop);
  listen(dialog.querySelector('[data-crop-reset]'), 'click', () => {
    fields.forEach(field => { field.value = 0; });
    drawCrop();
  });
  listen(dialog.querySelector('[data-crop-cancel]'), 'click', () => dialog.close());
  listen(dialog, 'close', () => { if (!dialog.open) finishCrop?.(null); });
  listen(dialog, 'submit', event => {
    event.preventDefault();
    const crop = bounds(previewImage.width, previewImage.height);
    if (crop.width <= 0 || crop.height <= 0) {
      error.hidden = false;
      return;
    }
    finishCrop({ crop, edges: fields.map(field => Number(field.value)), layout: layout.value });
    dialog.close();
  });
  signal.addEventListener('abort', () => {
    finishCrop?.(null);
    if (dialog.open) dialog.close();
  }, { once: true });

  function chooseCrop(image, existing) {
    previewImage = image;
    dialog.querySelector('form').reset();
    dialog.querySelector('h2').textContent = existing ? 'Edit gambar' : 'Siapkan gambar';
    dialog.querySelector('[type="submit"]').textContent = existing ? 'Simpan gambar' : 'Sisipkan gambar';
    if (existing) {
      layout.value = existing.layout;
      fields.forEach((field, index) => { field.value = existing.edges[index]; });
    }
    const scale = Math.min(1, 640 / image.width, 400 / image.height);
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    drawCrop();
    dialog.showModal();
    return new Promise(resolve => {
      finishCrop = value => {
        finishCrop = undefined;
        previewImage = undefined;
        resolve(value);
      };
    });
  }

  async function compress(image, { x, y, width, height }) {
    const scale = Math.min(1, 1600 / Math.max(width, height));
    const cropped = document.createElement('canvas');
    cropped.width = Math.max(1, Math.round(width * scale));
    cropped.height = Math.max(1, Math.round(height * scale));
    cropped.getContext('2d').drawImage(image, x, y, width, height, 0, 0, cropped.width, cropped.height);
    const blob = await new Promise(resolve => cropped.toBlob(resolve, 'image/webp', .78));
    if (!blob || blob.type !== 'image/webp' || blob.size > 1024 * 1024) {
      throw new Error('Gambar terlalu besar setelah dikompresi.');
    }
    return blob;
  }

  const privateImagePath = /^\/workroom\/images\/[a-f0-9]{64}$/;
  async function storeImage(blob) {
    const response = await fetch('/workroom/images/', {
      method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: blob, signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Gambar gagal diunggah.');
    if (!privateImagePath.test(data.url)) throw new Error('Alamat gambar tidak valid.');
    return data.url;
  }

  async function upload(editor, file, edit) {
    if (pending.has(editor) || dialog.open) return;
    if (file?.size > 15 * 1024 * 1024) {
      status(editor, 'Ukuran gambar awal maksimal 15 MB.');
      return;
    }
    pending.add(editor);
    let image;
    try {
      let existing;
      if (edit) {
        const current = new URL(edit.url, location.origin);
        if (current.origin !== location.origin || !privateImagePath.test(current.pathname)) return;
        const params = new URLSearchParams(current.hash.slice(1));
        const original = params.get('source');
        const source = /^[a-f0-9]{64}$/.test(original ?? '') ? '/workroom/images/' + original : current.pathname;
        const edges = (params.get('crop') ?? '').split('-').map(Number);
        const validEdges = edges.length === 4 && edges.every(value => Number.isInteger(value) && value >= 0 && value <= 99) &&
          edges[0] + edges[2] < 100 && edges[1] + edges[3] < 100;
        existing = { path: current.pathname, source, edges: validEdges && source !== current.pathname ? edges : [0, 0, 0, 0],
          layout: ['left', 'right', 'behind', 'front'].includes(edit.layout) ? edit.layout : 'inline' };
        const response = await fetch(source, { signal });
        if (!response.ok) throw new Error('Gambar sumber belum bisa dimuat.');
        file = await response.blob();
      }
      image = await createImageBitmap(file);
      if (signal.aborted || !editor.isConnected || dialog.open) return;
      const result = await chooseCrop(image, existing);
      if (!result || signal.aborted || !editor.isConnected) return;
      status(editor, 'Menyiapkan gambar…');
      const cropped = result.edges.some(Boolean);
      const cropUnchanged = existing && result.edges.every((value, index) => value === existing.edges[index]);
      const full = { x: 0, y: 0, width: image.width, height: image.height };
      const source = existing?.source ?? await storeImage(await compress(image, full));
      const display = cropUnchanged ? existing.path : cropped ? await storeImage(await compress(image, result.crop)) : source;
      const params = new URLSearchParams({ layout: result.layout });
      if (cropped && display !== source) {
        params.set('source', source.split('/').at(-1));
        params.set('crop', result.edges.join('-'));
      }
      const detail = { url: display + '#' + params, layout: result.layout };
      if (!editor.isConnected || signal.aborted) return;
      const inserted = edit ? edit.apply(detail) : !editor.dispatchEvent(new CustomEvent('workroom-image', {
        detail, bubbles: true, cancelable: true,
      }));
      status(editor, inserted ? (edit ? 'Gambar diperbarui.' : 'Gambar ditambahkan.')
        : 'Gambar belum bisa diterapkan. Coba lagi dari editor.');
    } catch (error) {
      if (!signal.aborted && editor.isConnected) status(editor, error.message || 'Gambar gagal diunggah.');
    } finally {
      image?.close();
      pending.delete(editor);
    }
  }

  listen(panel, 'workroom-image-edit', event => {
    const editor = targetEditor(event.target);
    if (editor) void upload(editor, null, event.detail);
  });
  for (const type of ['paste', 'drop']) {
    listen(document, type, event => {
      const editor = targetEditor(event.target);
      const transfer = type === 'paste' ? event.clipboardData : event.dataTransfer;
      const image = Array.from(transfer?.files || []).find(file => /^image\/(png|jpeg|webp|gif|avif|bmp)$/i.test(file.type));
      if (!editor || !image) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      upload(editor, image);
    }, true);
  }
  listen(document, 'dragover', event => {
    if (targetEditor(event.target) && Array.from(event.dataTransfer?.types || []).includes('Files')) {
      event.preventDefault();
    }
  });
}
