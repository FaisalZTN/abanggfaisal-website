const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
module.exports = async function checkWorkroom(browser, origin) {
  const worker = (await import('./dist/_worker.js')).default;
  const db = new DatabaseSync(':memory:');
  const folderUrl = process.env.WORKROOM_DRIVE_TEST_URL || 'https://drive.google.com/drive/folders/test-folder?hl=ID';
  db.exec('CREATE TABLE workroom_drive_shortcuts (id INTEGER PRIMARY KEY, title TEXT NOT NULL, href TEXT NOT NULL)');
  db.prepare('INSERT INTO workroom_drive_shortcuts (title, href) VALUES (?, ?)').run('Pintasan lama', folderUrl);
  const adapt = (sql, values = []) => ({
    bind: (...args) => adapt(sql, args.map(value => value instanceof ArrayBuffer ? new Uint8Array(value) : value)),
    run: async () => {
      const { changes, lastInsertRowid } = db.prepare(sql).run(...values);
      return { meta: { changes: Number(changes), last_row_id: Number(lastInsertRowid) } };
    },
    all: async () => ({results:db.prepare(sql).all(...values)}),
    first: async () => db.prepare(sql).get(...values),
  });
  const issuer = 'https://test.cloudflareaccess.com';
  const pair = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const key = await crypto.subtle.exportKey('jwk', pair.publicKey);
  key.kid = 'test';
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url === 'https://formspree.io/f/xrpqaorq') return Response.json({ ok: true });
    assert.equal(url, issuer+'/cdn-cgi/access/certs');
    return Response.json({keys:[key]});
  };
  const tokenData = [{alg:'RS256',kid:key.kid},{iss:issuer,aud:['test'],email:'test@example.com',exp:Math.floor(Date.now()/1000)+300}]
    .map(item=>Buffer.from(JSON.stringify(item)).toString('base64url')).join('.');
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,Buffer.from(tokenData));
  const token = tokenData+'.'+Buffer.from(signature).toString('base64url');
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Makassar' }).format(new Date());
  const tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  const session = title => ({ title, start: '08:00', end: '09:30', location: 'Ruang 1', block: 'Blok Uji', url: '/ruang-belajar/#jadwal-kuliah' });
  const env = {ASSETS: { fetch: request => {
      const month = new URL(request.url).pathname.match(/^\/study-schedule\/(\d{4}-\d{2})\.json$/)?.[1];
      assert.ok(month);
      const days = { [today]: [session('Kuliah hari ini')], [tomorrow]: [session('Kuliah besok')] };
      return Response.json(Object.fromEntries(Object.entries(days).filter(([day]) => day.startsWith(month))));
    } }, WORKROOM_ACCESS_ISSUER:issuer, WORKROOM_ACCESS_AUD:'test',WORKROOM_OWNER_EMAIL:'test@example.com',
    WORKROOM_PRIVATE_NOTES_PASSWORD: 'local-test-password', WORKROOM_PRIVATE_NOTES_KEY: 'a'.repeat(64),
    WORKROOM_DB:{prepare:adapt,batch:async statements=>Promise.all(statements.map(statement => statement.all()))}};
  const page = await browser.newPage();
  try {
    const commentsEnv = { ...env, COMMENTS_DB: env.WORKROOM_DB };
    const commentsUrl = origin + '/api/study-comments';
    const submitComment = message => worker.fetch(new Request(commentsUrl, {
      method: 'POST', headers: { Origin: origin },
      body: new URLSearchParams({ name: 'Penguji', message, category: 'Materi', public_comment: 'yes' }),
    }), commentsEnv);
    const approveComment = (id, action, signedIn = true) => worker.fetch(new Request(
      origin + '/workroom/settings/?comments=moderate', {
        method: 'POST',
        headers: { Origin: origin, ...(signedIn ? { 'Cf-Access-Jwt-Assertion': token } : {}) },
        body: new URLSearchParams({ id, action }),
      }), commentsEnv);
    assert.equal((await submitComment('Tinjau sebelum terbit')).status, 202);
    const queued = db.prepare('SELECT id FROM study_comments_pending').get().id;
    assert.deepEqual(await (await worker.fetch(new Request(commentsUrl), commentsEnv)).json(), { comments: [] });
    assert.equal((await approveComment(queued, 'approve', false)).status, 403);
    const settings = await worker.fetch(new Request(origin + '/workroom/settings/', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }), commentsEnv);
    assert.match(await settings.text(), /Tinjau sebelum terbit/);
    assert.equal((await approveComment(queued, 'approve')).status, 303);
    assert.match((await approveComment(queued, 'approve')).headers.get('Location'), /comment=missing/);
    assert.equal((await submitComment('Jangan terbitkan')).status, 202);
    assert.equal((await approveComment(db.prepare('SELECT id FROM study_comments_pending').get().id, 'reject')).status, 303);
    assert.deepEqual(await (await worker.fetch(new Request(commentsUrl), commentsEnv)).json(),
      { comments: [{ name: 'Penguji', message: 'Tinjau sebelum terbit' }] });
    const errors = [];
    page.on('pageerror', error=>errors.push(error.message));
    await page.route('**/workroom/**', async route => {
      const incoming = route.request();
      const headers = {
        ...await incoming.allHeaders(),
        'Cf-Access-Jwt-Assertion': token,
      };
      let result = await worker.fetch(new Request(incoming.url(), {
        method: incoming.method(), headers, body: incoming.postDataBuffer(),
      }), env);
      if (result.status === 303 && incoming.method() === 'POST') {
        const destination = new URL(result.headers.get('Location'), incoming.url());
        result = await worker.fetch(new Request(destination, { headers }), env);
      }
      await route.fulfill({
        status: result.status,
        headers: Object.fromEntries(result.headers),
        body: Buffer.from(await result.arrayBuffer()),
      });
    });
    await page.goto(origin+'/workroom/review/');
    await page.waitForSelector('.workroom-review h1');
    await page.waitForSelector('.workroom-route-status',{state:'attached'});
    const olderText = 'Pembuka '.repeat(30) + 'Kata unik di akhir catatan';
    db.prepare("INSERT INTO workroom_entries (kind, title, body, status, due, priority) VALUES ('note', ?, ?, 'active', '', 'normal')")
      .run('Catatan tambahan', olderText);
    db.prepare("INSERT INTO workroom_entries (kind, title, body, status, due, priority) VALUES ('note', ?, ?, 'active', '', 'normal')")
      .run('Catatan lama', '## Judul lama\n**Tebal**\n- [x] Sudah selesai');

    await page.evaluate(()=>{ window.testDocument = true; });
    const reviewDestination = page.locator('.workroom-nav > a[aria-label="Review"]');
    const notesDestination = page.locator('.workroom-nav > a[aria-label="Catatan"]');
    const notesUrl = origin + '/workroom/notes/';
    let releaseNavigation;
    const navigationGate = new Promise(resolve => { releaseNavigation = resolve; });
    await page.route(notesUrl, async route => {
      await navigationGate;
      await route.fallback();
    }, { times: 1 });
    const notesResponse = page.waitForResponse(response => response.url() === notesUrl && response.request().method() === 'GET');
    await notesDestination.click();
    try {
      await page.getByText('Memuat halaman…', { exact: true }).waitFor();
      assert.equal(await reviewDestination.getAttribute('aria-current'), 'page');
      assert.equal(await notesDestination.getAttribute('aria-current'), null);
      assert.equal(await notesDestination.getAttribute('data-pending'), '');
    } finally {
      releaseNavigation();
    }
    await page.waitForSelector('#note-query');
    assert.equal(await notesDestination.getAttribute('aria-current'), 'page');
    assert.equal(await notesDestination.getAttribute('data-pending'), null);
    assert.equal(await page.locator('main').evaluate(element => getComputedStyle(element).animationName), 'workroom-page-cover');
    await page.evaluate(() => document.fonts.ready);
    assert.match(await page.locator('.notes-head h1').evaluate(element => getComputedStyle(element).fontFamily), /Inter/);
    const newNote = page.locator('[data-new-note]');
    const [icon, label] = await Promise.all([
      newNote.locator('svg').boundingBox(), newNote.locator('span').boundingBox(),
    ]);
    assert.ok(Math.abs((icon.y + icon.height / 2) - (label.y + label.height / 2)) <= 1);
    assert.equal(await page.evaluate(()=>window.testDocument), true);
    const bootstrapHtml = await (await notesResponse).text();
    assert.match(bootstrapHtml, /Catatan tambahan/);
    assert.doesNotMatch(bootstrapHtml, /Kata unik di akhir catatan/);
    await page.getByRole('searchbox', { name: 'Cari catatan' }).fill('Kata unik di akhir catatan');
    await page.getByRole('button', { name: /Catatan tambahan/ }).click();
    await page.locator('#edit-body').getByText(/Kata unik di akhir catatan/).waitFor();
    await page.getByRole('searchbox', { name: 'Cari catatan' }).fill('');

    await page.locator('#add-category').click();
    const categoryDialog = page.getByRole('dialog', { name: 'Nama kategori baru' });
    await categoryDialog.getByLabel('Nama kategori').fill('Belajar');
    await categoryDialog.getByRole('button', { name: 'Buat kategori' }).click();
    await categoryDialog.getByRole('alert').waitFor();
    await categoryDialog.getByLabel('Nama kategori').fill('Kategori uji');
    await categoryDialog.getByRole('button', { name: 'Buat kategori' }).click();
    await page.getByText('Kategori dibuat.', { exact: true }).waitFor();
    const categoryPane = page.getByRole('region', { name: 'Kategori', exact: true });
    await categoryPane.getByRole('button', { name: /Kategori uji/ }).click();
    await categoryPane.getByRole('button', { name: 'Hapus kategori', exact: true }).click();
    await page.getByRole('dialog', { name: /Hapus kategori/ }).getByRole('button', { name: 'Hapus kategori' }).click();
    await page.getByRole('status').filter({ hasText: 'Kategori dihapus. Catatan tersedia di Tanpa kategori.' }).waitFor();
    await categoryPane.getByRole('button', { name: /^Semua/ }).click();
    await page.getByRole('button', { name: /Catatan lama/ }).click();
    const noteAttachment = page.getByRole('region', { name: 'Lampiran catatan' });
    const noteFile = noteAttachment.getByLabel(/Pilih file/);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq14AAAAASUVORK5CYII=', 'base64');
    await noteFile.setInputFiles({ name: 'Gambar.png', mimeType: 'image/png', buffer: png });
    const notePreview = noteAttachment.getByRole('dialog', { name: 'Gambar.png' });
    await notePreview.waitFor();
    const attachmentImageUrl = await notePreview.getByRole('img', { name: 'Gambar.png' }).getAttribute('src');
    const attachmentHeaders = { 'Cf-Access-Jwt-Assertion': token };
    const imageDownload = await worker.fetch(new Request(attachmentImageUrl, { headers: attachmentHeaders }), env);
    assert.equal(imageDownload.headers.get('Content-Type'), 'image/png');
    assert.deepEqual(Buffer.from(await imageDownload.arrayBuffer()), png);
    assert.equal((await worker.fetch(new Request(attachmentImageUrl), env)).status, 403);
    await notePreview.getByRole('button', { name: 'Tutup' }).click();
    const largePng = Buffer.from(await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1800;
      canvas.height = 900;
      const context = canvas.getContext('2d');
      const pixels = context.createImageData(canvas.width, canvas.height);
      for (let offset = 0; offset < pixels.data.length; offset += 65536) {
        crypto.getRandomValues(pixels.data.subarray(offset, offset + 65536));
      }
      context.putImageData(pixels, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve));
      return await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
    }), 'base64');
    assert.ok(largePng.length > 1000000 && largePng.length <= 10000000);
    await noteFile.setInputFiles({ name: 'Foto besar.png', mimeType: 'image/png', buffer: largePng });
    const photoPreview = noteAttachment.getByRole('dialog', { name: 'Foto besar.webp' });
    const photo = photoPreview.getByRole('img', { name: 'Foto besar.webp' });
    await photoPreview.waitFor();
    await page.waitForFunction(() => document.querySelector('#note-attachment img')?.naturalWidth > 0);
    assert.ok(await photo.evaluate(image => image.naturalWidth <= 1600));
    const compressedPhoto = await worker.fetch(new Request(await photo.getAttribute('src'), { headers: attachmentHeaders }), env);
    assert.equal(compressedPhoto.headers.get('Content-Type'), 'image/webp');
    assert.ok((await compressedPhoto.arrayBuffer()).byteLength <= 1000000);
    await photoPreview.getByRole('button', { name: 'Tutup' }).click();
    await noteFile.setInputFiles({ name: 'Ringkasan.txt', mimeType: 'text/plain', buffer: Buffer.from('Isi lampiran') });
    const downloadFile = noteAttachment.getByRole('link', { name: 'Unduh: Ringkasan.txt' });
    await downloadFile.waitFor();
    const downloadUrl = await downloadFile.getAttribute('href');
    const downloaded = await worker.fetch(new Request(downloadUrl, { headers: attachmentHeaders }), env);
    assert.match(downloaded.headers.get('Content-Disposition'), /^attachment;.*Ringkasan.txt/);
    assert.equal(await downloaded.text(), 'Isi lampiran');
    const wrongKind = new URL(downloadUrl);
    wrongKind.pathname = '/workroom/tasks/';
    assert.equal((await worker.fetch(new Request(wrongKind, { headers: attachmentHeaders }), env)).status, 404);
    assert.equal(await noteAttachment.getByRole('listitem').count(), 3);
    assert.ok(await noteFile.isDisabled());
    const extra = new URL(downloadUrl);
    extra.searchParams.delete('file');
    extra.searchParams.delete('download');
    extra.searchParams.set('name', 'Keempat.txt');
    const overLimit = await worker.fetch(new Request(extra, {
      method: 'POST', headers: { ...attachmentHeaders, Origin: origin }, body: 'keempat',
    }), env);
    assert.equal(overLimit.status, 409);
    const firstFile = noteAttachment.getByRole('listitem').filter({ hasText: 'Gambar.png' });
    await firstFile.getByLabel('Hapus Gambar.png', { exact: true }).click();
    await firstFile.getByRole('button', { name: 'Konfirmasi hapus lampiran' }).click();
    await noteAttachment.getByText('Lampiran dihapus.', { exact: true }).waitFor();
    assert.equal(await noteAttachment.getByRole('listitem').count(), 2);
    assert.equal((await worker.fetch(new Request(attachmentImageUrl, { headers: attachmentHeaders }), env)).status, 404);
    assert.ok(await downloadFile.isVisible());
    assert.ok(await noteAttachment.getByRole('button', { name: 'Lihat gambar: Foto besar.webp' }).isVisible());
    assert.ok(await notePreview.isHidden());
    await page.locator('#edit-body h2').filter({ hasText: 'Judul lama' }).waitFor();
    assert.equal(await page.locator('#edit-body strong').textContent(), 'Tebal');
    assert.equal(await page.locator('#edit-body input[type=checkbox]').isChecked(), true);
    const heading = page.locator('#edit-body h2');
    const linkControl = page.getByRole('button', { name: 'Sisipkan tautan', exact: true });
    await heading.click();
    await heading.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await linkControl.click();
    const linkDialog = page.getByRole('dialog', { name: 'Sisipkan tautan' });
    const linkInput = linkDialog.getByLabel('Alamat URL');
    assert.equal(await linkInput.evaluate(input => document.activeElement === input), true);
    await linkInput.fill('http://example.test');
    await linkInput.press('Enter');
    await linkDialog.getByRole('alert').waitFor();
    assert.equal(await linkInput.getAttribute('aria-invalid'), 'true');
    await linkInput.fill('https://example.test/catatan');
    await linkInput.press('Enter');
    await linkDialog.waitFor({ state: 'hidden' });
    const insertedLink = heading.getByRole('link', { name: 'Judul lama' });
    assert.equal(await insertedLink.getAttribute('href'), 'https://example.test/catatan');
    await page.getByText('Tersimpan otomatis.', { exact: true }).waitFor();

    await insertedLink.evaluate(element => {
      getSelection().collapse(element.firstChild, 2);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await linkControl.click();
    const editLink = page.getByRole('dialog', { name: 'Edit tautan' });
    assert.equal(await editLink.getByLabel('Alamat URL').inputValue(), 'https://example.test/catatan');
    await editLink.getByLabel('Alamat URL').press('Escape');
    await editLink.waitFor({ state: 'hidden' });
    assert.equal(await insertedLink.getAttribute('href'), 'https://example.test/catatan');
    await linkControl.click();
    await editLink.getByLabel('Alamat URL').fill('https://example.test/baru');
    await editLink.getByRole('button', { name: 'Simpan tautan' }).click();
    assert.equal(await insertedLink.getAttribute('href'), 'https://example.test/baru');
    await linkControl.click();
    await editLink.getByRole('button', { name: 'Hapus tautan' }).click();
    assert.equal(await heading.getByRole('link').count(), 0);
    assert.equal(await heading.textContent(), 'Judul lama');
    await page.getByText('Tersimpan otomatis.', { exact: true }).waitFor();

    await page.locator('[data-new-note]').click();
    async function pasteScreenshot(target, layout) {
      const uploaded = page.waitForResponse(response => response.url() === origin + '/workroom/images/' &&
        response.request().method() === 'POST');
      await target.evaluate(async element => {
        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 60;
        const context = canvas.getContext('2d');
        context.fillStyle = '#3355aa';
        context.fillRect(0, 0, 80, 60);
        const blob = await new Promise(resolve => canvas.toBlob(resolve));
        const transfer = new DataTransfer();
        transfer.items.add(new File([blob], 'screenshot.png', { type: 'image/png' }));
        element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }));
      });
      if (layout) {
        const crop = page.getByRole('dialog', { name: 'Siapkan gambar' });
        await crop.getByLabel('Kiri (%)').fill('25');
        await crop.getByLabel('Posisi gambar').selectOption(layout);
        await crop.getByRole('button', { name: 'Sisipkan gambar' }).click();
      }
      const result = await uploaded;
      assert.equal(result.status(), 201, await result.text());
    }
    const editor = page.getByRole('textbox', { name: 'Isi catatan', exact: true });
    await editor.click();
    await page.keyboard.type('Teks sebelum gambar');
    await pasteScreenshot(editor, 'inline');
    await editor.locator('img').waitFor();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Teks setelah gambar');
    const imageParagraph = editor.locator('img + p').filter({ hasText: 'Teks setelah gambar' });
    await imageParagraph.waitFor();
    assert.equal(await imageParagraph.locator('xpath=following-sibling::p').count(), 0);
    const pastedImage = editor.locator('img');
    const imageGap = () => pastedImage.evaluate(image =>
      image.nextElementSibling.getBoundingClientRect().top - image.getBoundingClientRect().bottom);
    const initialGap = await imageGap();
    await pastedImage.click();
    const pastedImageFrame = page.getByRole('group', { name: 'Pindah dan potong gambar' });
    await pastedImageFrame.waitFor();
    await dragImageControl(pastedImageFrame, 0, -24);
    await editor.locator('img[src*="&y=-"]').waitFor();
    assert.equal(await imageGap(), initialGap);
    await page.getByText('Tersimpan otomatis.', { exact: true }).waitFor();
    await page.locator('[data-new-note]').click();
    await editor.click();
    await page.keyboard.type('# Judul blok');
    await editor.locator('h1').filter({ hasText: 'Judul blok' }).waitFor();
    await page.keyboard.press('Enter');
    await page.keyboard.type('/table');
    await page.getByRole('option', { name: 'Tabel' }).waitFor();
    await page.keyboard.press('Enter');
    await editor.locator('table').waitFor();
    await page.setViewportSize({ width: 360, height: 720 });
    await editor.locator('h1').click();
    await page.getByRole('button', { name: 'Tambah blok', exact: true }).click();
    await page.getByRole('option', { name: 'Gambar', exact: true }).click();
    const imageDialog = page.getByRole('dialog', { name: 'Sisipkan gambar dari URL' });
    await imageDialog.waitFor();
    const imageBounds = await imageDialog.boundingBox();
    assert.ok(imageBounds.x >= 0 && imageBounds.x + imageBounds.width <= 360);
    await imageDialog.getByRole('button', { name: 'Batal' }).click();
    await imageDialog.waitFor({ state: 'hidden' });
    const imageUrl = 'https://example.test/diagram.svg';
    await page.route(imageUrl, route => route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"/>',
    }));
    await page.getByRole('button', { name: 'Tambah blok', exact: true }).click();
    await page.getByRole('option', { name: 'Gambar', exact: true }).click();
    await imageDialog.getByLabel('Alamat URL').fill(imageUrl);
    await imageDialog.getByRole('button', { name: 'Sisipkan gambar' }).click();
    await editor.locator('img[src="' + imageUrl + '"]').waitFor({ state: 'attached' });
    await pasteScreenshot(editor, 'right');
    const croppedNote = editor.locator('img[data-image-layout="right"]');
    await croppedNote.waitFor();
    await page.waitForFunction(() => document.querySelector('#edit-body img[data-image-layout="right"]')?.naturalWidth === 60);
    async function dragImageControl(control, dx, dy, position) {
      const box = await control.boundingBox();
      const x = box.x + box.width * (position ?? .5);
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 5 });
      await page.mouse.up();
    }
    const imageFrame = page.getByRole('group', { name: 'Pindah dan potong gambar' });
    await croppedNote.click();
    await imageFrame.waitFor();
    const leftHandle = imageFrame.getByRole('button', { name: 'Potong dari kiri', exact: true });
    assert.equal(await leftHandle.evaluate(element => getComputedStyle(element).cursor), 'ew-resize');
    assert.equal(await imageFrame.getByRole('button', { name: 'Potong dari atas', exact: true }).evaluate(element => getComputedStyle(element).cursor), 'ns-resize');
    assert.equal(await imageFrame.getByRole('button', { name: 'Potong dari kanan bawah' }).evaluate(element => getComputedStyle(element).cursor), 'nwse-resize');
    await dragImageControl(leftHandle, -Math.ceil((await imageFrame.boundingBox()).width / 3), 0);
    await page.waitForFunction(() => document.querySelector('#edit-body img[data-image-layout="right"]')?.naturalWidth === 80);
    await page.setViewportSize({ width: 1280, height: 720 });
    const draftSaved = page.waitForResponse(response =>
      response.request().method() === 'POST' && response.request().postData()?.includes('Draf tersimpan otomatis'));
    await page.locator('#edit-title').fill('Draf tersimpan otomatis');
    assert.equal((await draftSaved).status(), 200);
    await page.getByText('Tersimpan otomatis.', { exact: true }).waitFor();
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM workroom_entries WHERE title = ?").get('Draf tersimpan otomatis').total, 1);
    await page.locator('.workroom-nav > a[aria-label="Tugas"]').click();
    await page.waitForSelector('#workspace');
    assert.equal(await page.evaluate(()=>window.testDocument), true);
    assert.equal(await page.locator('.workroom-link-options').count(),1);
    assert.equal(await page.locator('#edit-body .tiptap').count(),0);
    await page.goBack();
    await page.waitForSelector('#note-query');
    assert.equal(await page.locator('.note-block-menu').count(),1);
    await page.getByRole('button', { name: /Catatan lama/ }).click();
    await editor.locator('strong').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' disunting');
    for (const [label, option] of [
      ['Perataan paragraf', 'Rata kiri-kanan (Justify)'],
      ['Spasi antarbaris', '1,5'],
      ['Jarak antarparagraf', 'Lebar'],
    ]) {
      const trigger = page.getByRole('button', { name: label, exact: true });
      const choice = page.getByRole('group', { name: label, exact: true })
        .getByRole('button', { name: option, exact: true });
      await trigger.click();
      await choice.click();
      await trigger.click();
      assert.equal(await choice.getAttribute('aria-pressed'), 'true');
      await page.keyboard.press('Escape');
    }
    const formatted = editor.locator('p[data-note-alignment="justify"]');
    assert.equal(await formatted.getAttribute('data-note-leading'), '1.5');
    assert.equal(await formatted.getAttribute('data-note-spacing'), 'wide');
    assert.equal(await page.getByRole('button', { name: 'Simpan', exact: true }).count(), 0);
    await page.getByText('Tersimpan otomatis.', { exact: true }).waitFor();
    const stored = db.prepare("SELECT body FROM workroom_entries WHERE title = ?").get('Catatan lama').body;
    assert.match(stored, /^workroom-blocks-v1:/);
    await page.getByRole('button', { name: /Catatan lama/ }).click();
    assert.match(await formatted.textContent(), /disunting/);

    await page.goForward();
    await page.waitForSelector('#workspace');
    await page.locator('.workroom-nav > a[aria-label="Catatan"]').click();
    await page.getByRole('button', { name: /Catatan lama/ }).click();
    const checkTitleControls = () => page.evaluate(() => {
      const title = document.querySelector('#edit-title');
      const button = document.querySelector('.note-title-row [data-note-fullscreen]');
      const short = title.getBoundingClientRect();
      const icon = button.getBoundingClientRect();
      const radius = getComputedStyle(title).borderRadius;
      const titleField = title.parentElement;
      const original = titleField.dataset.title;
      titleField.dataset.title = 'Judul catatan yang panjang '.repeat(10);
      const long = title.getBoundingClientRect();
      titleField.dataset.title = original;
      return {
        sameHeight: Math.abs(short.height - icon.height) <= 1,
        sameTop: Math.abs(short.top - icon.top) <= 1,
        rounded: parseFloat(radius) > 0 && radius === getComputedStyle(button).borderRadius,
        wraps: long.height > short.height && long.right <= icon.left,
      };
    });
    const expectedTitleControls = { sameHeight: true, sameTop: true, rounded: true, wraps: true };
    assert.deepEqual(await checkTitleControls(), expectedTitleControls);
    const desktopViewport = page.viewportSize();
    await page.setViewportSize({ width: 360, height: 800 });
    assert.deepEqual(await checkTitleControls(), expectedTitleControls);
    await page.setViewportSize(desktopViewport);
    const sidePanels = await page.evaluate(() => {
      const editor = document.querySelector('#edit-body');
      return [...document.querySelectorAll('.note-categories, .note-index')].map(panel => {
        const spacer = document.createElement('div');
        spacer.style.height = '1400px';
        panel.append(spacer);
        const pageScroll = window.scrollY;
        const editorScroll = editor.scrollTop;
        panel.scrollTop = 160;
        const result = panel.scrollTop === 160 && window.scrollY === pageScroll && editor.scrollTop === editorScroll;
        panel.scrollTop = 0;
        spacer.remove();
        return result;
      });
    });
    assert.deepEqual(sidePanels, [true, true]);
    const noteViewport = await page.evaluate(() => {
      const body = document.querySelector('#edit-body');
      const title = document.querySelector('#edit-title');
      const button = document.querySelector('.note-title-row [data-note-fullscreen]');
      const content = body.querySelector('.tiptap');
      content.style.minHeight = '1200px';
      const pageScroll = window.scrollY;
      body.scrollTop = 160;
      const result = {
        bodyScrolled: body.scrollTop === 160,
        pageStayed: window.scrollY === pageScroll,
        controlsSeparated: title.getBoundingClientRect().right <= button.getBoundingClientRect().left,
      };
      body.scrollTop = 0;
      content.style.removeProperty('min-height');
      return result;
    });
    assert.deepEqual(noteViewport, { bodyScrolled: true, pageStayed: true, controlsSeparated: true });
    await page.getByRole('button', { name: 'Layar penuh', exact: true }).click();
    await page.locator('.note-split-menu summary').click();
    await page.getByRole('button', { name: 'Catatan sekarang', exact: true }).click();
    const right = page.locator('#note-split-body .tiptap');
    assert.equal(await right.getAttribute('contenteditable'), 'false');
    await page.locator('#note-mode-right').click();
    assert.equal(await right.getAttribute('contenteditable'), 'true');
    await page.locator('#note-mode-left').click();
    assert.equal(await editor.getAttribute('contenteditable'), 'false');
    await right.locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' dari kanan');
    await editor.getByText(/dari kanan/).waitFor();
    await page.getByText('Tersimpan otomatis.', { exact: true }).waitFor();
    const scrollState = await page.evaluate(() => {
      const view = document.querySelector('#view');
      const left = document.querySelector('#edit-body');
      const right = document.querySelector('#note-split-body');
      for (const pane of [left, right]) pane.querySelector('.tiptap').style.minHeight = '1200px';
      left.scrollTop = 160;
      const leftOnly = [left.scrollTop, right.scrollTop, view.scrollTop];
      right.scrollTop = 240;
      return [leftOnly, [left.scrollTop, right.scrollTop, view.scrollTop]];
    });
    assert.deepEqual(scrollState, [[160, 0, 0], [160, 240, 0]]);
    await page.getByRole('button', { name: 'Keluar layar penuh', exact: true }).click();
    assert.equal(await editor.getAttribute('contenteditable'), 'true');

    await page.locator('.workroom-nav > a[aria-label="Review"]').click();
    await page.waitForSelector('.workroom-review h1');
    assert.equal(await page.evaluate(()=>window.testDocument), true);
    for (const [label, panel] of [
      ['Ringkasan', 'home'], ['Hari Ini', 'today'], ['Tugas', 'task'],
      ['Goals', 'goal'], ['Pengaturan', 'settings'],
    ]) {
      await page.locator(`.workroom-nav > a[aria-label="${label}"]`).click();
      await page.locator(`main[data-workroom-panel="${panel}"]`).waitFor();
      assert.equal(await page.evaluate(() => window.testDocument), true);
    }
    await page.setViewportSize({ width: 360, height: 800 });
    db.prepare("INSERT INTO workroom_entries (kind, title, body, status, due, priority) VALUES ('task', 'Tugas Ringkasan', '', 'doing', ?, 'high')").run(today);
    db.prepare("INSERT INTO workroom_entries (kind, title, body, status, due, priority, note_updated) VALUES ('note', 'Catatan disunting terakhir', '', 'active', '', 'normal', ?)").run(Date.now() + 1000);
    for (let index = 0; index < 3; index++) {
      db.prepare("INSERT INTO workroom_entries (kind, title, body, status, due, priority) VALUES ('note', ?, '', 'active', '', 'normal')").run('Catatan tanpa tanggal ' + index);
    }
    await page.getByRole('link', { name: 'Ringkasan', exact: true }).first().click();
    const dashboard = page.locator('.overview-shell');
    await dashboard.getByRole('heading', { name: 'Ringkasan', exact: true }).waitFor();
    await dashboard.getByRole('form', { name: 'Catat cepat' }).waitFor();
    assert.equal(await dashboard.locator('.recent-notes li strong').first().textContent(), 'Catatan disunting terakhir');
    const edited = db.prepare("SELECT id, note_updated FROM workroom_entries WHERE title = ?")
      .get('Catatan disunting terakhir');
    const saveNote = body => worker.fetch(new Request(origin + '/workroom/notes/?notes-data=', {
      method: 'POST',
      headers: { Origin: origin, 'Cf-Access-Jwt-Assertion': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', id: edited.id, title: 'Catatan disunting terakhir',
        body, category: 'none', baseUpdated: edited.note_updated }),
    }), env);
    assert.equal((await saveNote('Isi dari tab pertama')).status, 200);
    assert.equal((await saveNote('Isi dari tab kedua')).status, 409);
    assert.equal(db.prepare('SELECT body FROM workroom_entries WHERE id = ?').get(edited.id).body,
      'Isi dari tab pertama');
    await dashboard.getByRole('link', { name: 'Kuliah hari ini' }).waitFor();
    await dashboard.getByRole('link', { name: 'Kuliah besok' }).waitFor();
    const agendaLink = dashboard.getByRole('link', { name: 'Lihat agenda', exact: true });
    const agendaBox = await agendaLink.boundingBox();
    assert.ok(agendaBox.height >= 44 && agendaBox.y + agendaBox.height <= 800);
    assert.equal(await agendaLink.getAttribute('href'), '#agenda');
    const calendar = dashboard.locator('.overview-calendar');
    const schedule = dashboard.locator('.workroom-study-schedule');
    const exams = dashboard.locator('.overview-exams');
    const tasks = dashboard.locator('.overview-tasks');
    const [phoneCalendar, phoneSchedule, phoneExams, phoneTasks] = await Promise.all(
      [calendar, schedule, exams, tasks].map(panel => panel.boundingBox()));
    assert.ok(phoneCalendar.y < phoneSchedule.y && phoneSchedule.y < phoneExams.y && phoneExams.y < phoneTasks.y);
    await page.setViewportSize({ width: 1280, height: 800 });
    const [desktopCalendar, desktopSchedule, desktopExams, desktopTasks] = await Promise.all(
      [calendar, schedule, exams, tasks].map(panel => panel.boundingBox()));
    assert.equal(desktopCalendar.y, desktopSchedule.y);
    assert.ok(desktopCalendar.x > desktopSchedule.x);
    assert.equal(desktopSchedule.x, desktopExams.x);
    assert.equal(desktopSchedule.x, desktopTasks.x);
    assert.ok(desktopSchedule.y < desktopExams.y && desktopExams.y < desktopTasks.y);
    await page.setViewportSize({ width: 360, height: 800 });
    assert.ok((await dashboard.locator('.workroom-study-heading a').boundingBox()).height >= 44);
    const emptyTasksLink = dashboard.getByRole('link', { name: 'Lihat semua tugas', exact: true });
    assert.ok(await emptyTasksLink.isHidden());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
    assert.equal(await page.evaluate(() => window.testDocument), true);
    const count = dashboard.locator('[data-overview-open-count]');
    const before = Number(await count.textContent());
    const overviewPriority = dashboard.locator('.due-list .task-badge-priority').first();
    assert.equal(await overviewPriority.evaluate(badge => getComputedStyle(badge).color), 'rgb(255, 255, 255)');
    await dashboard.getByRole('checkbox', { name: 'Tandai selesai: Tugas Ringkasan' }).click();
    await dashboard.getByText('Tugas selesai.', { exact: true }).waitFor();
    assert.equal(Number(await count.textContent()), before - 1);
    const completedLabel = 'Buka kembali: Tugas Ringkasan';
    await dashboard.getByRole('checkbox', { name: completedLabel }).waitFor();
    const completedTask = dashboard.getByRole('link', { name: 'Tugas Ringkasan', exact: true });
    assert.equal(await completedTask.evaluate(element => getComputedStyle(element).textDecorationLine), 'line-through');
    await page.getByRole('link', { name: 'Hari Ini', exact: true }).first().click();
    const todayPanel = page.locator('.workroom-today');
    await todayPanel.getByRole('checkbox', { name: completedLabel }).waitFor();
    await page.getByRole('link', { name: 'Tugas', exact: true }).first().click();
    const dailyTask = page.locator('.daily-task-card').filter({ hasText: 'Tugas Ringkasan' });
    await dailyTask.getByRole('checkbox', { name: completedLabel }).click();
    await dailyTask.getByText('Dikerjakan', { exact: true }).waitFor();
    assert.equal(db.prepare("SELECT status FROM workroom_entries WHERE title = 'Tugas Ringkasan'").get().status, 'doing');
    await page.getByRole('link', { name: 'Ringkasan', exact: true }).first().click();
    await dashboard.getByRole('checkbox', { name: 'Tandai selesai: Tugas Ringkasan' }).click();
    await dashboard.getByText('Tugas selesai.', { exact: true }).waitFor();
    await page.reload();
    assert.equal(await dashboard.getByRole('checkbox', { name: completedLabel }).getAttribute('aria-checked'), 'true');
    await dashboard.getByRole('checkbox', { name: completedLabel }).click();
    await dashboard.getByText('Tugas dibuka kembali.', { exact: true }).waitFor();
    assert.equal(Number(await count.textContent()), before);
    await page.setViewportSize({ width: 1280, height: 800 });
    const project = db.prepare("INSERT INTO workroom_entries (kind, title, body, status, due, priority) VALUES ('project', 'Tugas Akhir', '', 'active', '', 'normal')").run().lastInsertRowid;
    db.prepare("INSERT INTO workroom_entries (kind, title, body, status, due, priority, project_id) VALUES ('task', 'Baca jurnal', '', 'active', '2027-09-30', 'high', ?), ('task', 'Buat kerangka', '', 'done', '', 'normal', ?)").run(project, project);
    const legacyTask = db.prepare("SELECT id FROM workroom_entries WHERE title = 'Baca jurnal'").get().id;
    db.prepare('INSERT INTO workroom_task_pdfs (task_id, name, bytes, media_type) VALUES (?, ?, ?, ?)')
      .run(legacyTask, 'Lampiran lama.txt', Buffer.from('Isi lama'), 'application/octet-stream');
    const legacyResponse = await worker.fetch(new Request(origin + '/workroom/tasks/?pdf=' + legacyTask + '&download', { headers: attachmentHeaders }), env);
    assert.equal(await legacyResponse.text(), 'Isi lama');
    await page.locator('.workroom-nav > a[aria-label="Tugas"]').click();
    db.prepare("UPDATE workroom_entries SET body = ? WHERE title = 'Baca jurnal'").run('# Referensi lama');
    await page.getByRole('link', { name: 'Baca jurnal' }).click();
    await page.locator('.workspace-editor').locator('select[name=status]').waitFor();
    const priorityColors = await page.evaluate(() => {
      const root = document.documentElement;
      const original = root.getAttribute('data-workroom-theme');
      const badge = document.querySelector('.task-badge-priority');
      const select = document.querySelector('#task-editor-form [name="priority"]');
      const colors = ['graphite', 'midnight', 'blue', 'light'].map(theme => {
        root.setAttribute('data-workroom-theme', theme);
        return [badge, select].map(element => {
          const style = getComputedStyle(element);
          return [style.backgroundColor, style.color];
        });
      });
      if (original === null) root.removeAttribute('data-workroom-theme');
      else root.setAttribute('data-workroom-theme', original);
      return colors;
    });
    for (const pair of priorityColors) assert.deepEqual(pair, Array(2).fill(['rgb(167, 29, 50)', 'rgb(255, 255, 255)']));
    const pdfSection = page.getByRole('region', { name: 'Bukti tugas' });
    await pdfSection.getByRole('link', { name: 'Unduh: Lampiran lama.txt' }).waitFor();
    const pdfInput = pdfSection.getByLabel(/Pilih file/);
    await pdfInput.setInputFiles({ name: 'rusak.pdf', mimeType: 'application/pdf', buffer: Buffer.from('bukan PDF') });
    await pdfSection.getByText(/File gagal diunggah/).waitFor();
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] >>',
    ];
    let pdfDocument = '%PDF-1.4\n' + '% padding for the upload test\n'.repeat(75000);
    const offsets = objects.map((object, index) => {
      const offset = pdfDocument.length;
      pdfDocument += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
      return offset;
    });
    const xref = pdfDocument.length;
    pdfDocument += 'xref\n0 4\n0000000000 65535 f \n' +
      offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') +
      'trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    await pdfInput.setInputFiles({ name: 'Bukti.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdfDocument) });
    const pdfDialog = pdfSection.getByRole('dialog', { name: 'Bukti.pdf' });
    await pdfDialog.waitFor();
    const previewUrl = await pdfDialog.getByRole('link', { name: 'Buka PDF di tab baru' }).getAttribute('href');
    assert.equal(await pdfDialog.locator('iframe').getAttribute('src'), previewUrl);
    const preview = await worker.fetch(new Request(previewUrl, { headers: { 'Cf-Access-Jwt-Assertion': token } }), env);
    assert.equal(preview.headers.get('Content-Type'), 'application/pdf');
    assert.equal(await preview.text(), pdfDocument);
    assert.match(await pdfSection.getByRole('listitem').filter({ hasText: 'Bukti.pdf' }).locator('[data-attachment-uploaded]').textContent(), /Diunggah .*\d{2}[.:]\d{2} WITA/);
    assert.equal((await worker.fetch(new Request(previewUrl), env)).status, 403);
    const closePdf = pdfDialog.getByRole('button', { name: 'Tutup' });
    assert.equal((await closePdf.textContent()).trim(), '');
    assert.equal(await closePdf.locator('svg').count(), 1);
    const [closeBox, titleBox] = await Promise.all([closePdf.boundingBox(), pdfDialog.getByRole('heading').boundingBox()]);
    assert.ok(closeBox.x >= titleBox.x + titleBox.width);
    await closePdf.click();
    await page.reload();
    await pdfSection.getByRole('button', { name: /Lihat PDF/ }).click();
    await pdfDialog.getByRole('button', { name: 'Tutup' }).click();
    db.prepare("UPDATE workroom_entries SET status = 'doing' WHERE title = 'Baca jurnal'").run();
    const autosave = page.waitForResponse(response => response.request().method() === 'POST' && response.request().postData()?.includes('autosave=1'));
    await page.locator('.workspace-editor').getByLabel('Area', { exact: true }).fill('Akademik');
    const savedTask = await autosave;
    assert.equal(savedTask.status(), 200, (await savedTask.text()).slice(0, 400));
    assert.equal((await savedTask.json()).status, 'doing');
    assert.equal(db.prepare("SELECT status FROM workroom_entries WHERE title = 'Baca jurnal'").get().status, 'doing');
    assert.equal(await page.locator('.workspace-editor').getByRole('button', { name: 'Simpan perubahan' }).count(), 0);
    await page.locator('.workspace-editor').getByText('Tersimpan otomatis.', { exact: true }).waitFor();
    const taskBody = page.locator('.workspace-editor').getByRole('textbox', { name: 'Detail tugas' });
    const detailSummary = page.locator('.task-detail-disclosure > summary');
    await taskBody.waitFor();
    assert.ok(await taskBody.evaluate(editor => {
      const scroller = editor.closest('.note-rendered');
      const spacer = document.createElement('div');
      spacer.style.height = '100vh';
      scroller.append(spacer);
      scroller.scrollTop = scroller.scrollHeight;
      const scrollsInside = scroller.scrollTop > 0 && scroller.scrollHeight > scroller.clientHeight;
      spacer.remove();
      return scrollsInside;
    }));
    const taskViewport = page.viewportSize();
    const taskPanel = page.locator('.workspace-editor');
    const format = taskPanel.getByRole('group', { name: 'Format detail tugas' });
    assert.equal(await format.locator('.note-icon-field').count(), 6);
    for (const width of [1280, 360]) {
      await page.setViewportSize({ width, height: 800 });
      const { beside, below } = await taskPanel.evaluate(panel => {
        const fields = panel.querySelector('#task-editor-form').getBoundingClientRect();
        const proof = panel.querySelector('.task-pdf').getBoundingClientRect();
        const gap = parseFloat(getComputedStyle(panel).rowGap);
        return {
          beside: proof.left >= fields.right && Math.abs(proof.top - fields.top) < 1,
          below: Math.abs(proof.top - fields.bottom - gap) < 2,
        };
      });
      assert.equal(width === 1280 ? beside : below, true, 'Task cards at ' + width + 'px');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      const fileCard = pdfSection.getByRole('listitem').filter({ hasText: 'Bukti.pdf' });
      const previewButton = fileCard.getByRole('button', { name: 'Lihat PDF: Bukti.pdf' });
      assert.equal(await previewButton.locator('svg').count(), 1);
      await previewButton.click();
      await pdfDialog.getByRole('button', { name: 'Tutup' }).click();
      const remove = pdfSection.getByLabel('Hapus Lampiran lama.txt', { exact: true });
      await remove.click();
      const confirm = pdfSection.getByRole('button', { name: 'Konfirmasi hapus lampiran' });
      await confirm.waitFor();
      if (width === 1280) await remove.click();
      else {
        await confirm.click();
        await pdfSection.getByText('Lampiran dihapus.', { exact: true }).waitFor();
        assert.ok(await previewButton.isVisible());
      }
    }
    await page.setViewportSize(taskViewport);
    await detailSummary.click();
    await taskBody.waitFor({ state: 'hidden' });
    await detailSummary.click();
    await taskBody.waitFor();
    const deleteControl = page.locator('.workspace-editor > .task-delete');
    assert.equal(await deleteControl.locator('summary').getAttribute('aria-label'), 'Hapus tugas');
    assert.equal(await deleteControl.locator('button').evaluate(button => button.form.getAttribute('id')), 'task-editor-form');
    await taskBody.getByRole('heading', { name: 'Referensi lama' }).waitFor();
    await taskBody.getByRole('heading', { name: 'Referensi lama' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.workspace-editor textarea[name="body"]').isVisible(), false);
    await page.locator('.workspace-editor').getByRole('button', { name: 'Tebal' }).click();
    await page.keyboard.type('Detail berformat');
    await taskBody.locator('strong').filter({ hasText: 'Detail berformat' }).waitFor();
    await pasteScreenshot(taskBody);
    await page.locator('.workspace-editor [data-task-detail-input] img').waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'Siapkan gambar' }).count(), 0);
    assert.doesNotMatch(await taskBody.textContent(), /〔Gambar 1〕|workroom\/images/);
    const taskImageSave = page.waitForResponse(response => response.request().method() === 'POST' &&
      response.request().postData()?.includes('layout%3Dinline'));
    assert.equal((await taskImageSave).status(), 200);
    assert.match(db.prepare("SELECT body FROM workroom_entries WHERE title = 'Baca jurnal'").get().body, /#layout=inline/);
    const uploadedTaskImage = page.locator('.workspace-editor [data-task-detail-input] img');
    await uploadedTaskImage.click();
    await imageFrame.waitFor();
    const editedTaskImageSave = page.waitForResponse(response => response.request().method() === 'POST' &&
      response.request().postData()?.includes('%26x%3D30'));
    await dragImageControl(imageFrame, 30, 0);
    assert.equal((await editedTaskImageSave).status(), 200);
    const updatedTaskBody = db.prepare("SELECT body FROM workroom_entries WHERE title = 'Baca jurnal'").get().body;
    assert.match(updatedTaskBody, /#layout=inline.*&x=30/);
    assert.equal(updatedTaskBody.match(/"type":"image"/g).length, 1);
    assert.equal(db.prepare("SELECT task_area FROM workroom_entries WHERE title = 'Baca jurnal'").get().task_area, 'Akademik');
    await page.getByLabel('Filter area', { exact: true }).selectOption('Akademik');
    await page.getByRole('button', { name: 'Filter area', exact: true }).click();
    await page.waitForURL('**/*area=Akademik*');
    await page.getByRole('link', { name: 'Baca jurnal' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Buat kerangka' }).count(), 0);
    await page.evaluate(() => { window.testDocument = true; });
    await page.getByRole('navigation', { name: 'Kelola tugas' }).getByRole('link', { name: 'Proyek' }).click();
    await page.locator('main[data-workroom-panel="project"]').waitFor();
    assert.equal(await page.locator('.workroom-nav > a[aria-label="Tugas"]').getAttribute('aria-current'), 'page');
    await page.locator('.project-card').getByText('1 dari 2 tugas selesai', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Baca jurnal' }).waitFor();
    await page.locator('.workroom-nav > a[aria-label="Pengaturan"]').click();
    await page.getByRole('radio', { name: 'Grafit' }).waitFor();
    assert.equal(await page.getByRole('radio', { name: 'Grafit' }).isChecked(), true);
    await page.getByRole('radio', { name: 'Midnight' }).check();
    assert.equal(await page.locator('html').getAttribute('data-workroom-theme'), 'midnight');
    await page.getByRole('radio', { name: 'Terang' }).check();
    assert.equal(await page.locator('html').getAttribute('data-workroom-theme'), 'light');

    await page.setViewportSize({ width: 360, height: 800 });
    await page.locator('.workroom-nav > a[aria-label="Catatan"]').click();
    const privateLink = page.locator('.notes-head').getByRole('link', { name: 'Catatan Rahasia' });
    await privateLink.waitFor();
    await privateLink.locator('span').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#edit-body .tiptap').count(), 0);
    assert.ok((await privateLink.boundingBox()).width >= 44);
    await privateLink.click();
    await page.getByLabel('Sandi Catatan Rahasia').waitFor();
    assert.equal(await page.evaluate(() => window.testDocument), true);
    const moreControl = page.getByLabel('Lainnya', { exact: true });
    await moreControl.press('Enter');
    const mobileMenu = page.locator('.workroom-nav-menu');
    await mobileMenu.waitFor();
    assert.equal(await mobileMenu.evaluate(element => getComputedStyle(element).animationName), 'workroom-menu-reveal');
    await mobileMenu.getByRole('link', { name: 'Pengaturan' }).focus();
    await page.keyboard.press('Escape');
    await mobileMenu.waitFor({ state: 'hidden' });
    assert.equal(await moreControl.evaluate(element => element === document.activeElement), true);
    await moreControl.click();
    await mobileMenu.getByRole('link', { name: 'Pengaturan' }).click();
    await page.getByRole('radio', { name: 'Terang' }).waitFor();
    assert.equal(await page.getByRole('radio', { name: 'Terang' }).isChecked(), true);
    assert.equal(await page.evaluate(() => window.testDocument), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
    await page.getByRole('radio', { name: 'Mona Sans' }).check();
    assert.match(await page.locator('main h1').evaluate(element => getComputedStyle(element).fontFamily), /Mona Sans/);
    assert.match(await page.locator('.workroom-header .workroom-wordmark').evaluate(element => getComputedStyle(element).fontFamily), /Mona Sans/);
    await page.getByRole('radio', { name: 'Plus Jakarta Sans' }).check();
    await page.reload();
    await page.getByRole('radio', { name: 'Terang' }).waitFor();
    assert.equal(await page.getByRole('radio', { name: 'Terang' }).isChecked(), true);
    assert.equal(await page.locator('html').getAttribute('data-workroom-theme'), 'light');
    assert.equal(await page.getByRole('radio', { name: 'Plus Jakarta Sans' }).isChecked(), true);
    await page.evaluate(() => document.fonts.load('400 16px "Plus Jakarta Sans"'));
    assert.match(await page.locator('main h1').evaluate(element => getComputedStyle(element).fontFamily), /Plus Jakarta Sans/);
    assert.match(await page.locator('.workroom-nav .workroom-wordmark').evaluate(element => getComputedStyle(element).fontFamily), /Plus Jakarta Sans/);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const editedUrl = 'https://drive.google.com/drive/folders/another-folder?hl=ID';
    const overview = origin + '/workroom/?view=overview';
    const drivePageUrl = origin + '/workroom/drive/';
    const unauthenticated = await worker.fetch(new Request(drivePageUrl), env);
    assert.equal(unauthenticated.status, 403);
    assert.doesNotMatch(await unauthenticated.text(), /pintasan-drive/);

    await page.setViewportSize({ width: 1280, height: 900 });
    const desktopDrive = page.locator('.workroom-nav > a[aria-label="Pintasan Drive"]');
    assert.match(await desktopDrive.locator('use').getAttribute('href'), /#folder$/);
    await desktopDrive.click();
    await page.waitForURL(drivePageUrl);
    await page.getByRole('heading', { name: 'Pintasan Drive', exact: true }).waitFor();
    assert.equal(await page.locator('main').evaluate(element => getComputedStyle(element).animationName), 'none');
    for (const name of ['Proyek', 'Akademik', 'TBM-Cs', 'Tugas Akhir', 'Lainnya']) {
      await page.getByRole('region', { name, exact: true }).waitFor();
    }
    const legacy = page.getByRole('region', { name: 'Lainnya', exact: true });
    await legacy.getByRole('link', { name: /Pintasan lama/ }).waitFor();
    const index = page.getByRole('navigation', { name: 'Kategori pintasan' });
    await index.getByRole('link', { name: /Tugas Akhir/ }).click();
    await page.waitForURL(drivePageUrl + '#drive-tugas-akhir');
    await page.getByText('Tambah pintasan', { exact: true }).click();
    const add = page.locator('.workroom-drive-toolbar');
    assert.equal(await add.locator('form').evaluate(form => getComputedStyle(form).animationName), 'none');
    await add.getByLabel('Nama pintasan').fill('Folder Drive');
    await add.getByLabel('Tautan Google Drive').fill(folderUrl + '&test=1');
    await add.getByLabel('Kategori').selectOption('proyek');
    await add.getByRole('button', { name: 'Simpan pintasan' }).click();
    await add.getByRole('status').filter({ hasText: 'Pintasan tersimpan.' }).waitFor();

    const checkShortcut = async (link, title, href) => {
      await link.waitFor();
      assert.equal(await link.getAttribute('aria-label'), title + ' (dibuka di tab baru)');
      assert.equal(await link.getAttribute('href'), href);
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
    };
    const driveProject = page.getByRole('region', { name: 'Proyek', exact: true });
    const projectLink = driveProject.getByRole('link', { name: /Folder Drive/ });
    await checkShortcut(projectLink, 'Folder Drive', folderUrl + '&test=1');
    await page.context().route(folderUrl + '&test=1', route => route.fulfill({ body: 'Drive fixture' }));
    const popupReady = page.waitForEvent('popup');
    await projectLink.click();
    const popup = await popupReady;
    await popup.waitForURL(folderUrl + '&test=1');
    assert.equal(await popup.evaluate(() => window.opener), null);
    await popup.close();

    await page.goto(overview);
    const card = page.locator('#pintasan-drive');
    await checkShortcut(card.getByRole('link', { name: /Folder Drive/ }), 'Folder Drive', folderUrl + '&test=1');
    await card.getByLabel('Edit pintasan Folder Drive').click();
    const edit = card.locator('details[open] form');
    await edit.getByLabel('Nama pintasan').fill('Folder Kerja');
    await edit.getByLabel('Tautan Google Drive').fill(editedUrl);
    await edit.getByLabel('Kategori').selectOption('akademik');
    await edit.getByRole('button', { name: 'Simpan pintasan' }).click();
    await checkShortcut(card.getByRole('link', { name: /Folder Kerja/ }), 'Folder Kerja', editedUrl);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM workroom_drive_shortcuts').get().total, 2);

    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(await desktopDrive.isVisible(), false);
    await page.getByLabel('Lainnya', { exact: true }).click();
    await page.locator('.workroom-nav-menu').getByRole('link', { name: 'Pintasan Drive' }).click();
    await page.waitForURL(drivePageUrl);
    const academic = page.getByRole('region', { name: 'Akademik', exact: true });
    await checkShortcut(academic.getByRole('link', { name: /Folder Kerja/ }), 'Folder Kerja', editedUrl);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await academic.getByLabel('Edit pintasan Folder Kerja').click();
    assert.equal(await academic.locator('form').evaluate(form => getComputedStyle(form).animationName), 'workroom-drive-reveal');
    const deniedAfterSave = await worker.fetch(new Request(drivePageUrl), env);
    assert.equal(deniedAfterSave.status, 403);
    assert.doesNotMatch(await deniedAfterSave.text(), /another-folder|pintasan-drive/);
    await page.goto(overview + '&day=' + tomorrow);
    await emptyTasksLink.waitFor();
    assert.ok((await emptyTasksLink.boundingBox()).height >= 44);
    assert.deepEqual(errors, []);
    console.log('Drive shortcuts: desktop and mobile placement, popup, shared edits, and authentication');
    console.log('Authenticated worker and Chromium: all Workroom panels, history, draft protection, mobile menu and persisted themes');
  } finally {
    global.fetch = originalFetch;
    db.close();
    await page.close();
  }
};
