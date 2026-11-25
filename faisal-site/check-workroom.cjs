const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
module.exports = async function checkWorkroom(browser, origin) {
  const worker = (await import('./dist/_worker.js')).default;
  const db = new DatabaseSync(':memory:');
  const adapt = (sql, values = []) => ({
    bind: (...args) => adapt(sql,args),
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
    assert.equal(url, issuer+'/cdn-cgi/access/certs');
    return Response.json({keys:[key]});
  };
  const tokenData = [{alg:'RS256',kid:key.kid},{iss:issuer,aud:['test'],email:'test@example.com',exp:Math.floor(Date.now()/1000)+300}]
    .map(item=>Buffer.from(JSON.stringify(item)).toString('base64url')).join('.');
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,Buffer.from(tokenData));
  const token = tokenData+'.'+Buffer.from(signature).toString('base64url');
  const env = {WORKROOM_ACCESS_ISSUER:issuer, WORKROOM_ACCESS_AUD:'test',WORKROOM_OWNER_EMAIL:'test@example.com',
    WORKROOM_PRIVATE_NOTES_PASSWORD: 'local-test-password', WORKROOM_PRIVATE_NOTES_KEY: 'a'.repeat(64),
    WORKROOM_DB:{prepare:adapt,batch:async statements=>Promise.all(statements.map(statement => statement.all()))}};
  const page = await browser.newPage();
  try {
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
        body: await result.text(),
      });
    });
    await page.goto(origin+'/workroom/review/');
    await page.waitForSelector('.workroom-review h1');
    await page.waitForSelector('.workroom-route-status',{state:'attached'});
    db.prepare("INSERT INTO workroom_entries (kind, title, body, status, due, priority) VALUES ('note', ?, ?, 'active', '', 'normal')")
      .run('Catatan lama', '## Judul lama\n**Tebal**\n- [x] Sudah selesai');

    await page.evaluate(()=>{ window.testDocument = true; });
    await page.locator('.workroom-nav > a[aria-label="Catatan"]').click();
    await page.waitForSelector('#note-query');
    await page.evaluate(() => document.fonts.ready);
    assert.match(await page.locator('.notes-head h1').evaluate(element => getComputedStyle(element).fontFamily), /Inter/);
    const newNote = page.locator('[data-new-note]');
    const [icon, label] = await Promise.all([
      newNote.locator('svg').boundingBox(), newNote.locator('span').boundingBox(),
    ]);
    assert.ok(Math.abs((icon.y + icon.height / 2) - (label.y + label.height / 2)) <= 1);
    assert.equal(await page.evaluate(()=>window.testDocument), true);
    await page.getByRole('button', { name: /Catatan lama/ }).click();
    await page.locator('#edit-body h2').filter({ hasText: 'Judul lama' }).waitFor();
    assert.equal(await page.locator('#edit-body strong').textContent(), 'Tebal');
    assert.equal(await page.locator('#edit-body input[type=checkbox]').isChecked(), true);
    await page.locator('[data-new-note]').click();
    const editor = page.getByRole('textbox', { name: 'Isi catatan', exact: true });
    await editor.click();
    await page.keyboard.type('# Judul blok');
    await editor.locator('h1').filter({ hasText: 'Judul blok' }).waitFor();
    await page.keyboard.press('Enter');
    await page.keyboard.type('/table');
    await page.getByRole('option', { name: 'Tabel' }).waitFor();
    await page.keyboard.press('Enter');
    await editor.locator('table').waitFor();
    await page.locator('#edit-title').fill('Draf tersimpan otomatis');
    await page.getByText('Tersimpan otomatis.', { exact: true }).waitFor();
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM workroom_entries WHERE title = ?").get('Draf tersimpan otomatis').total, 1);
    await page.locator('.workroom-nav > a[aria-label="Tugas"]').click();
    await page.waitForSelector('#workspace');
    assert.equal(await page.evaluate(()=>window.testDocument), true);
    assert.equal(await page.locator('.workroom-link-options').count(),1);
    assert.equal(await page.locator('.tiptap').count(),0);
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
    const project = db.prepare("INSERT INTO workroom_entries (kind, title, body, status, due, priority) VALUES ('project', 'Tugas Akhir', '', 'active', '', 'normal')").run().lastInsertRowid;
    db.prepare("INSERT INTO workroom_entries (kind, title, body, status, due, priority, project_id) VALUES ('task', 'Baca jurnal', '', 'active', '2027-09-30', 'normal', ?), ('task', 'Buat kerangka', '', 'done', '', 'normal', ?)").run(project, project);
    await page.locator('.workroom-nav > a[aria-label="Tugas"]').click();
    await page.getByRole('link', { name: 'Baca jurnal' }).click();
    const autosave = page.waitForResponse(response => response.request().method() === 'POST' && response.request().postData()?.includes('autosave=1'));
    await page.locator('.workspace-editor').getByLabel('Area', { exact: true }).fill('Akademik');
    const savedTask = await autosave;
    assert.equal(savedTask.status(), 200, (await savedTask.text()).slice(0, 400));
    assert.equal(await page.locator('.workspace-editor').getByRole('button', { name: 'Simpan perubahan' }).count(), 0);
    await page.locator('.workspace-editor').getByText('Tersimpan otomatis.', { exact: true }).waitFor();
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
    await page.getByRole('radio', { name: 'Biru' }).waitFor();
    assert.equal(await page.getByRole('radio', { name: 'Biru' }).isChecked(), true);
    await page.getByRole('radio', { name: 'Midnight' }).check();
    assert.equal(await page.locator('html').getAttribute('data-workroom-theme'), 'midnight');
    await page.getByRole('radio', { name: 'Terang' }).check();
    assert.equal(await page.locator('html').getAttribute('data-workroom-theme'), 'light');

    await page.setViewportSize({ width: 360, height: 800 });
    await page.locator('.workroom-nav > a[aria-label="Catatan"]').click();
    const privateLink = page.locator('.notes-head').getByRole('link', { name: 'Catatan Rahasia' });
    await privateLink.waitFor();
    assert.equal(await privateLink.locator('span').isVisible(), false);
    assert.ok((await privateLink.boundingBox()).width >= 44);
    await privateLink.click();
    await page.getByLabel('Sandi Catatan Rahasia').waitFor();
    assert.equal(await page.evaluate(() => window.testDocument), true);
    await page.getByLabel('Lainnya', { exact: true }).click();
    await page.locator('.workroom-nav-menu').getByRole('link', { name: 'Pengaturan' }).click();
    await page.getByRole('radio', { name: 'Terang' }).waitFor();
    assert.equal(await page.getByRole('radio', { name: 'Terang' }).isChecked(), true);
    assert.equal(await page.evaluate(() => window.testDocument), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
    await page.getByRole('radio', { name: 'Mona Sans' }).check();
    assert.match(await page.locator('main h1').evaluate(element => getComputedStyle(element).fontFamily), /Mona Sans/);
    await page.getByRole('radio', { name: 'Plus Jakarta Sans' }).check();
    await page.reload();
    await page.getByRole('radio', { name: 'Terang' }).waitFor();
    assert.equal(await page.getByRole('radio', { name: 'Terang' }).isChecked(), true);
    assert.equal(await page.locator('html').getAttribute('data-workroom-theme'), 'light');
    assert.equal(await page.getByRole('radio', { name: 'Plus Jakarta Sans' }).isChecked(), true);
    await page.evaluate(() => document.fonts.load('400 16px "Plus Jakarta Sans"'));
    assert.match(await page.locator('main h1').evaluate(element => getComputedStyle(element).fontFamily), /Plus Jakarta Sans/);
    assert.deepEqual(errors, []);
    console.log('Authenticated worker and Chromium: all Workroom panels, history, draft protection, mobile menu and persisted themes');
  } finally {
    global.fetch = originalFetch;
    db.close();
    await page.close();
  }
};
