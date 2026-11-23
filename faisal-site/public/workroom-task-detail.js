(() => {
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

  function linkPreview(url, label, status) {
    const item = document.createElement('div');
    item.className = 'task-detail-link';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = 'Opsi link';
    toggle.setAttribute('aria-expanded', 'false');
    const actions = document.createElement('div');
    actions.className = 'task-link-actions';
    actions.hidden = true;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Salin link';
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        status.textContent = 'Link disalin.';
      } catch {
        status.textContent = 'Link belum bisa disalin. Kamu bisa menyalinnya dari kolom detail.';
      }
    };
    const setOpen = open => {
      actions.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.onclick = () => {
      const pinned = item.toggleAttribute('data-pinned');
      setOpen(pinned);
    };
    item.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') setOpen(true);
    });
    item.addEventListener('pointerleave', () => {
      if (!item.hasAttribute('data-pinned') && !actions.contains(document.activeElement)) setOpen(false);
    });
    item.addEventListener('focusout', event => {
      if (!item.contains(event.relatedTarget)) {
        item.removeAttribute('data-pinned');
        setOpen(false);
      }
    });
    item.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !actions.hidden) {
        item.removeAttribute('data-pinned');
        toggle.focus();
        setOpen(false);
      }
    });
    actions.append(copy, externalLink(url, 'Buka link di tab baru'));
    item.append(externalLink(url, label), toggle, actions);
    return item;
  }

  function imagePreview(url, label) {
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

  for (const tools of document.querySelectorAll('.task-detail-tools')) {
    const field = tools.closest('form').elements.body;
    const preview = tools.querySelector('.task-detail-preview');
    const status = tools.querySelector('.task-detail-status');
    const toggle = tools.querySelector('.task-image-toggle');
    const imageFields = tools.querySelector('.task-image-fields');
    const imageUrl = tools.querySelector('.task-image-url');

    function render() {
      const text = field.value;
      const tokens = /!\[([^\]\r\n]*)\]\((https:\/\/[^\s)]+)\)|https?:\/\/[^\s<>"'\u0060]+/gi;
      const nodes = [];
      let offset = 0;
      for (const match of text.matchAll(tokens)) {
        const isImage = match[2] !== undefined;
        const value = isImage ? match[2] : trimLink(match[0]);
        const url = webUrl(value, isImage);
        if (!url) continue;
        nodes.push(text.slice(offset, match.index));
        nodes.push(isImage ? imagePreview(url, match[1]) : linkPreview(url, value, status));
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

    function insertImage() {
      const url = webUrl(imageUrl.value.trim(), true);
      if (!url) {
        status.textContent = 'Masukkan URL gambar HTTPS yang valid.';
        return;
      }
      const cursor = field.selectionEnd;
      const insert = (cursor && field.value[cursor - 1] !== '\n' ? '\n' : '') +
        '![](' + url.replaceAll(')', '%29') + ')' +
        (cursor < field.value.length && field.value[cursor] !== '\n' ? '\n' : '');
      if (field.value.length + insert.length > field.maxLength) {
        status.textContent = 'Detail tugas terlalu panjang untuk menambah gambar.';
        return;
      }
      field.setRangeText(insert, cursor, cursor, 'end');
      imageUrl.value = '';
      imageFields.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      status.textContent = 'Gambar ditambahkan. Simpan tugas untuk menyimpan perubahan.';
      render();
      field.focus();
    }

    imageUrl.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      insertImage();
    });
    tools.querySelector('.task-image-add').onclick = insertImage;
    field.addEventListener('input', render);
    tools.hidden = false;
    render();
  }
})();
