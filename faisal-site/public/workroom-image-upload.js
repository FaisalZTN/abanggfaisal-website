(() => {
  const pending = new WeakSet();
  function targetEditor(target) {
    return target.closest?.('#edit-body, .workspace-editor textarea[name="body"], #add-task textarea[name="body"]');
  }
  function status(editor, text) {
    const message = editor.id === 'edit-body' ? document.getElementById('note-status')
      : editor.closest('form').querySelector('.task-detail-status');
    if (message) message.textContent = text;
  }
  async function compress(file) {
    const image = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .78));
      if (!blob || blob.type !== 'image/webp' || blob.size > 1024 * 1024) {
        throw new Error('Gambar terlalu besar setelah dikompresi.');
      }
      return blob;
    } finally {
      image.close();
    }
  }
  async function upload(editor, file) {
    if (pending.has(editor)) return;
    if (file.size > 15 * 1024 * 1024) {
      status(editor, 'Ukuran gambar awal maksimal 15 MB.');
      return;
    }
    pending.add(editor);
    status(editor, 'Mengompresi dan mengunggah gambar…');
    try {
      const blob = await compress(file);
      const response = await fetch('/workroom/images/', {
        method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: blob,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gambar gagal diunggah.');
      if (!/^\/workroom\/images\/[a-f0-9]{64}$/.test(data.url)) throw new Error('Alamat gambar tidak valid.');
      if (!editor.isConnected) return;
      const inserted = !editor.dispatchEvent(new CustomEvent('workroom-image', {
        detail: new URL(data.url, location.origin).href, bubbles: true, cancelable: true,
      }));
      status(editor, inserted ? 'Gambar ditambahkan. Simpan perubahan untuk melampirkannya.'
        : 'Gambar belum bisa disisipkan ke editor.');
    } catch (error) {
      if (editor.isConnected) status(editor, error.message || 'Gambar gagal diunggah.');
    } finally {
      pending.delete(editor);
    }
  }
  for (const type of ['paste', 'drop']) {
    document.addEventListener(type, event => {
      const editor = targetEditor(event.target);
      const transfer = type === 'paste' ? event.clipboardData : event.dataTransfer;
      const image = Array.from(transfer?.files || []).find(file => /^image\/(png|jpeg|webp|gif|avif|bmp)$/i.test(file.type));
      if (!editor || !image) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      upload(editor, image);
    }, true);
  }
  document.addEventListener('dragover', event => {
    if (targetEditor(event.target) && Array.from(event.dataTransfer?.types || []).includes('Files')) {
      event.preventDefault();
    }
  });
})();
