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
    finishCrop({ crop, layout: layout.value });
    dialog.close();
  });
  signal.addEventListener('abort', () => {
    finishCrop?.(null);
    if (dialog.open) dialog.close();
  }, { once: true });

  function chooseCrop(image) {
    previewImage = image;
    dialog.querySelector('form').reset();
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

  async function upload(editor, file) {
    if (pending.has(editor) || dialog.open) return;
    if (file.size > 15 * 1024 * 1024) {
      status(editor, 'Ukuran gambar awal maksimal 15 MB.');
      return;
    }
    pending.add(editor);
    let image;
    try {
      image = await createImageBitmap(file);
      if (signal.aborted || !editor.isConnected || dialog.open) return;
      const result = await chooseCrop(image);
      if (!result || signal.aborted || !editor.isConnected) return;
      status(editor, 'Mengompresi dan mengunggah gambar…');
      const blob = await compress(image, result.crop);
      const response = await fetch('/workroom/images/', {
        method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: blob, signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gambar gagal diunggah.');
      if (!/^\/workroom\/images\/[a-f0-9]{64}$/.test(data.url)) throw new Error('Alamat gambar tidak valid.');
      if (!editor.isConnected) return;
      const inserted = !editor.dispatchEvent(new CustomEvent('workroom-image', {
        detail: { url: data.url, layout: result.layout }, bubbles: true, cancelable: true,
      }));
      status(editor, inserted ? 'Gambar ditambahkan.'
        : 'Gambar belum bisa disisipkan ke editor.');
    } catch (error) {
      if (editor.isConnected) status(editor, error.message || 'Gambar gagal diunggah.');
    } finally {
      image?.close();
      pending.delete(editor);
    }
  }
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
