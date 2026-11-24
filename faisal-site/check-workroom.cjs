const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
module.exports = async function checkWorkroom(browser, origin) {
  const worker = (await import('./dist/_worker.js')).default;
  const db = new DatabaseSync(':memory:');
  const adapt = (sql, values = []) => ({
    bind: (...args) => adapt(sql,args),
    run: async () => db.prepare(sql).run(...values),
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
        ...incoming.headers(),
        'Cf-Access-Jwt-Assertion': token,
      };
      const result = await worker.fetch(new Request(incoming.url(), {
        method: incoming.method(), headers, body: incoming.postDataBuffer(),
      }), env);
      await route.fulfill({
        status: result.status,
        headers: Object.fromEntries(result.headers),
        body: await result.text(),
      });
    });
    await page.goto(origin+'/workroom/review/');
    await page.waitForSelector('.workroom-review h1');
    await page.waitForSelector('.workroom-route-status',{state:'attached'});
    await page.evaluate(()=>{ window.testDocument = true; });
    await page.locator('.workroom-nav > a[aria-label="Catatan"]').click();
    await page.waitForSelector('#note-query');
    await page.evaluate(() => document.fonts.ready);
    assert.match(await page.locator('.notes-head h1').evaluate(element => getComputedStyle(element).fontFamily), /Source Serif 4/);
    const newNote = page.locator('[data-new-note]');
    const [icon, label] = await Promise.all([
      newNote.locator('svg').boundingBox(), newNote.locator('span').boundingBox(),
    ]);
    assert.ok(Math.abs((icon.y + icon.height / 2) - (label.y + label.height / 2)) <= 1);
    assert.equal(await page.evaluate(()=>window.testDocument), true);
    await page.locator('[data-new-note]').click();
    await page.locator('#edit-title').fill('Draf yang belum disimpan');
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('.workroom-nav > a[aria-label="Tugas"]').click();
    assert.equal(await page.locator('#edit-title').inputValue(), 'Draf yang belum disimpan');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('.workroom-nav > a[aria-label="Tugas"]').click();
    await page.waitForSelector('#workspace');
    assert.equal(await page.evaluate(()=>window.testDocument), true);
    assert.equal(await page.locator('.workroom-link-options').count(),1);
    assert.equal(await page.locator('.note-selection-bar').count(),0);
    await page.goBack();
    await page.waitForSelector('#note-query');
    assert.equal(await page.locator('.note-selection-bar').count(),1);
    await page.goForward();
    await page.waitForSelector('#workspace');
    await page.locator('.workroom-nav > a[aria-label="Review"]').click();
    await page.waitForSelector('.workroom-review h1');
    assert.equal(await page.evaluate(()=>window.testDocument), true);
    for (const [label, panel] of [
      ['Ringkasan', 'home'], ['Hari Ini', 'today'], ['Proyek', 'project'],
      ['Goals', 'goal'], ['Pengaturan', 'settings'],
    ]) {
      await page.locator(`.workroom-nav > a[aria-label="${label}"]`).click();
      await page.locator(`main[data-workroom-panel="${panel}"]`).waitFor();
      assert.equal(await page.evaluate(() => window.testDocument), true);
    }
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
    await page.reload();
    await page.getByRole('radio', { name: 'Terang' }).waitFor();
    assert.equal(await page.getByRole('radio', { name: 'Terang' }).isChecked(), true);
    assert.equal(await page.locator('html').getAttribute('data-workroom-theme'), 'light');
    assert.deepEqual(errors, []);
    console.log('Authenticated worker and Chromium: all Workroom panels, history, draft protection, mobile menu and persisted themes');
  } finally {
    global.fetch = originalFetch;
    db.close();
    await page.close();
  }
};
