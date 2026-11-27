const privateImagePath = /^\/workroom\/images\/[a-f0-9]{64}$/;

export function bindImageEditing(image, url, layout, apply) {
  const params = new URL(url, location.origin).hash.slice(1);
  const metadata = new URLSearchParams(params);
  const offsets = ['x', 'y'].map(key => Number(metadata.get(key)));
  const [x, y] = offsets.every(value => Number.isSafeInteger(value) && Math.abs(value) <= 4096) ? offsets : [0, 0];
  const width = Number(metadata.get('width'));
  image.style.width = width > 0 && width <= 100 ? width + '%' : '';
  image.style.translate = x || y ? x + 'px ' + y + 'px' : '';
  image.tabIndex = apply ? 0 : -1;
  image.toggleAttribute('data-editable-image', Boolean(apply));
  image.draggable = !apply;
  image.onclick = null;
  image.onkeydown = null;
  if (!apply) return;
  function select(event) {
    event.preventDefault();
    event.stopPropagation();
    image.dispatchEvent(new CustomEvent('workroom-image-edit', { bubbles: true,
      detail: { image, url, layout, apply, x, y, width },
    }));
  }
  image.onclick = select;
  image.onkeydown = event => {
    if (event.key === 'Enter' || event.key === ' ') select(event);
  };
}

export function bindBlockImages(editor) {
  editor?.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image' || !URL.canParse(node.attrs.src, location.origin)) return;
    const src = new URL(node.attrs.src, location.origin);
    if (src.origin !== location.origin || !privateImagePath.test(src.pathname)) return;
    const image = editor.view.nodeDOM(pos);
    if (!(image instanceof HTMLImageElement)) return;
    const doc = editor.state.doc;
    bindImageEditing(image, node.attrs.src, node.attrs.layout, editor.isEditable ? ({ url, layout }) => {
      if (editor.isDestroyed || !editor.isEditable || editor.state.doc !== doc) return false;
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: url, layout }));
      editor.commands.focus();
      return true;
    } : null);
  });
}

export function mount(panel, signal) {
  const listen = (target, type, handler, options) => target.addEventListener(type, handler, { ...options, signal });
  const pending = new WeakSet();
  function targetEditor(target) {
    return target.closest?.('#edit-body, #note-split-body, [data-task-detail-input]');
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

  async function storeImage(blob) {
    const response = await fetch('/workroom/images/', {
      method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: blob, signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Gambar gagal diunggah.');
    if (!privateImagePath.test(data.url)) throw new Error('Alamat gambar tidak valid.');
    return data.url;
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
      const full = { x: 0, y: 0, width: image.width, height: image.height };
      const result = editor.matches('[data-task-detail-input]')
        ? { crop: full, edges: [0, 0, 0, 0], layout: 'inline' }
        : await chooseCrop(image);
      if (!result || signal.aborted || !editor.isConnected) return;
      status(editor, 'Menyiapkan gambar…');
      const source = await storeImage(await compress(image, full));
      const display = result.edges.some(Boolean) ? await storeImage(await compress(image, result.crop)) : source;
      const detail = imageDetail(display, source, result.edges, result.layout);
      if (!editor.isConnected || signal.aborted) return;
      const inserted = !editor.dispatchEvent(new CustomEvent('workroom-image', {
        detail, bubbles: true, cancelable: true,
      }));
      status(editor, inserted ? 'Gambar ditambahkan.' : 'Gambar belum bisa disisipkan.');
    } catch (error) {
      if (!signal.aborted && editor.isConnected) status(editor, error.message || 'Gambar gagal diunggah.');
    } finally {
      image?.close();
      pending.delete(editor);
    }
  }

  function imageDetail(display, source, edges, layout = 'inline', x = 0, y = 0, width = 0) {
    const params = new URLSearchParams({ layout });
    if (display !== source) {
      params.set('source', source.split('/').at(-1));
      params.set('crop', edges.join('-'));
    }
    if (x) params.set('x', x);
    if (y) params.set('y', y);
    if (width) params.set('width', width);
    return { url: display + '#' + params, layout };
  }

  const frame = document.createElement('div');
  frame.className = 'workroom-image-frame';
  frame.setAttribute('role', 'group');
  frame.setAttribute('aria-label', 'Pindah dan potong gambar');
  frame.tabIndex = -1;
  frame.hidden = true;
  const preview = document.createElement('img');
  preview.alt = '';
  preview.draggable = false;
  const viewport = document.createElement('div');
  viewport.append(preview);
  frame.append(viewport);
  for (const [edge, label] of Object.entries({
    nw: 'kiri atas', n: 'atas', ne: 'kanan atas', e: 'kanan',
    se: 'kanan bawah', s: 'bawah', sw: 'kiri bawah', w: 'kiri',
  })) {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.dataset.cropEdge = edge;
    handle.setAttribute('aria-label', 'Potong dari ' + label);
    frame.append(handle);
  }
  document.body.append(frame);

  let selected;
  let drag;

  function deselect() {
    if (selected) selected.image.removeAttribute('data-image-selected');
    selected = drag = undefined;
    frame.hidden = true;
  }

  function redraw() {
    const { image, edges, nextEdges, dx, dy } = selected;
    const rect = image.getBoundingClientRect();
    const [left, top, right, bottom] = edges;
    const [nextLeft, nextTop, nextRight, nextBottom] = nextEdges;
    const unitX = rect.width / (100 - left - right);
    const unitY = rect.height / (100 - top - bottom);
    Object.assign(frame.style, {
      left: rect.left + (nextLeft - left) * unitX + dx + 'px',
      top: rect.top + (nextTop - top) * unitY + dy + 'px',
      width: (100 - nextLeft - nextRight) * unitX + 'px',
      height: (100 - nextTop - nextBottom) * unitY + 'px',
    });
    Object.assign(preview.style, {
      width: 100 * unitX + 'px', height: 100 * unitY + 'px',
      left: -nextLeft * unitX + 'px', top: -nextTop * unitY + 'px',
    });
  }

  function adjust(edge, deltaX, deltaY) {
    const { image, edges, editor, x, y } = selected;
    const rect = image.getBoundingClientRect();
    if (!edge) {
      const area = image.closest('.note-rendered, .task-detail-preview').getBoundingClientRect();
      selected.dx = Math.round(Math.max(-4096 - x, Math.min(4096 - x,
        Math.max(Math.min(0, area.left - rect.left), Math.min(Math.max(0, area.right - rect.right), deltaX)))));
      selected.dy = Math.round(Math.max(-4096 - y, Math.min(4096 - y,
        Math.max(Math.min(0, area.top - rect.top), Math.min(Math.max(0, area.bottom - rect.bottom), deltaY)))));
    } else {
      const [left, top, right, bottom] = edges;
      const dx = deltaX * (100 - left - right) / rect.width;
      const dy = deltaY * (100 - top - bottom) / rect.height;
      const clamp = (value, other) => Math.round(Math.max(0, Math.min(99 - other, value)));
      selected.nextEdges = [
        edge.includes('w') ? clamp(left + dx, right) : left,
        edge.includes('n') ? clamp(top + dy, bottom) : top,
        edge.includes('e') ? clamp(right - dx, left) : right,
        edge.includes('s') ? clamp(bottom - dy, top) : bottom,
      ];
    }
    if (editor.isConnected) redraw();
  }

  async function commit() {
    const item = selected;
    const { edges, nextEdges, editor, source, path, layout, x, y, dx, dy, image, apply } = item;
    let width = item.width;
    let offsetX = x + dx;
    let offsetY = y + dy;
    const cropChanged = nextEdges.some((edge, index) => edge !== edges[index]);
    if (!cropChanged && !dx && !dy) return;
    deselect();
    pending.add(editor);
    let bitmap;
    try {
      let display = path;
      if (cropChanged) {
        const rect = image.getBoundingClientRect();
        const [oldLeft, oldTop, oldRight, oldBottom] = edges;
        const [left, top, right, bottom] = nextEdges;
        const unitX = rect.width / (100 - oldLeft - oldRight);
        const unitY = rect.height / (100 - oldTop - oldBottom);
        const parentWidth = image.parentElement.clientWidth;
        if (parentWidth) width = Math.min(100, Math.max(1, Math.round((100 - left - right) * unitX / parentWidth * 100)));
        const limitOffset = value => Math.round(Math.max(-4096, Math.min(4096, value)));
        offsetX = limitOffset(x + (layout === 'right' ? oldRight - right : left - oldLeft) * unitX);
        offsetY = limitOffset(y + (top - oldTop) * unitY);
        if (nextEdges.some(Boolean)) {
          const response = await fetch(source, { signal });
          if (!response.ok) throw new Error('Gambar sumber belum bisa dimuat.');
          bitmap = await createImageBitmap(await response.blob());
          const [left, top, right, bottom] = nextEdges.map(edge => edge / 100);
          const startX = Math.min(bitmap.width - 1, Math.round(bitmap.width * left));
          const startY = Math.min(bitmap.height - 1, Math.round(bitmap.height * top));
          display = await storeImage(await compress(bitmap, {
            x: startX, y: startY,
            width: Math.max(1, Math.round(bitmap.width * (1 - right)) - startX),
            height: Math.max(1, Math.round(bitmap.height * (1 - bottom)) - startY),
          }));
        } else display = source;
      }
      if (!signal.aborted && image.isConnected && editor.isConnected) {
        const changed = apply(imageDetail(display, source, nextEdges, layout, offsetX, offsetY, width));
        status(editor, changed ? 'Gambar diperbarui.' : 'Gambar berubah. Pilih kembali untuk mengedit.');
      }
    } catch (error) {
      if (editor.isConnected && !signal.aborted) status(editor, error.message || 'Gambar gagal diperbarui.');
    } finally {
      bitmap?.close();
      pending.delete(editor);
    }
  }

  listen(panel, 'workroom-image-edit', event => {
    const editor = targetEditor(event.target);
    const { image, url, layout, apply, x, y, width } = event.detail;
    if (!editor || pending.has(editor) || dialog.open || !image.naturalWidth) return;
    const current = new URL(url, location.origin);
    if (current.origin !== location.origin || !privateImagePath.test(current.pathname)) return;
    const params = new URLSearchParams(current.hash.slice(1));
    const original = params.get('source');
    const source = /^[a-f0-9]{64}$/.test(original ?? '') ? '/workroom/images/' + original : current.pathname;
    const crop = (params.get('crop') ?? '').split('-').map(Number);
    const valid = crop.length === 4 && crop.every(edge => Number.isInteger(edge) && edge >= 0 && edge <= 99) &&
      crop[0] + crop[2] < 100 && crop[1] + crop[3] < 100;
    const edges = valid && source !== current.pathname ? crop : [0, 0, 0, 0];
    deselect();
    selected = { image, editor, source, path: current.pathname, layout, apply, edges, nextEdges: edges, x, y, width, dx: 0, dy: 0 };
    image.setAttribute('data-image-selected', '');
    preview.src = source;
    frame.hidden = false;
    redraw();
    frame.focus({ preventScroll: true });
  });
  listen(frame, 'pointerdown', event => {
    if (!selected || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    drag = { edge: event.target.dataset.cropEdge, x: event.clientX, y: event.clientY, id: event.pointerId };
    frame.setPointerCapture(event.pointerId);
  });
  listen(frame, 'pointermove', event => {
    if (drag?.id === event.pointerId) adjust(drag.edge, event.clientX - drag.x, event.clientY - drag.y);
  });
  listen(frame, 'pointerup', event => {
    if (drag?.id !== event.pointerId) return;
    adjust(drag.edge, event.clientX - drag.x, event.clientY - drag.y);
    drag = undefined;
    void commit();
  });
  listen(frame, 'lostpointercapture', () => { if (drag) deselect(); });
  listen(frame, 'keydown', event => {
    if (!selected) return;
    if (event.key === 'Escape') {
      const { image } = selected;
      deselect();
      image.focus();
      return;
    }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 16 : 4;
    const { image } = selected;
    adjust(event.target.dataset.cropEdge, direction[0] * step, direction[1] * step);
    void commit();
    if (image.isConnected) image.focus();
  });
  listen(document, 'pointerdown', event => {
    if (!frame.contains(event.target)) deselect();
  }, { capture: true });
  listen(window, 'resize', deselect);
  listen(document, 'scroll', () => {
    if (selected?.image.isConnected) redraw();
    else if (selected) deselect();
  }, { capture: true });
  signal.addEventListener('abort', () => { deselect(); frame.remove(); }, { once: true });

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
