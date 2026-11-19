const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = 'http://localhost:8080';
const widths = [320, 360, 412];

async function checkWidth(page, name, width) {
  const { content, viewport } = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  assert.equal(viewport, width, name + ' did not use the requested viewport');
  assert.ok(content <= viewport, name + ' overflows at ' + width + ' px');
}

async function checkStudyFlow(page, width) {
  await page.clock.setFixedTime(new Date('2026-11-19T01:30:00Z'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(base);
  await checkWidth(page, 'Beranda', width);
  await page.getByRole('link', { name: 'Jadwal kuliah hari ini', exact: true }).click();
  assert.match(page.url(), /\/ruang-belajar\/#jadwal-kuliah$/);
  await checkWidth(page, 'Agenda', width);

  await page.evaluate(() => {
    // Approximate time from the action event to the next painted update.
    for (const [name, type, selector] of [
      ['open', 'click', '#jadwal-kuliah a[href$="#insect-bites"]'],
      ['filter', 'input', '#search'],
    ]) {
      document.querySelector(selector).addEventListener(type, () => {
        const started = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          document.documentElement.dataset[name + 'Ms'] = Math.round(performance.now() - started);
        }));
      }, { capture: true, once: true });
    }
  });
  await page.getByRole('link', { name: 'Insect bites', exact: true }).press('Enter');
  await page.waitForFunction(() => document.activeElement.matches('#insect-bites h3'));
  await checkWidth(page, 'Katalog terbuka', width);
  const card = page.locator('#insect-bites');
  await card.getByText('Bahan belajar', { exact: true }).click();
  assert.ok(await card.getByRole('link', { name: /Reaksi Gigitan Serangga/ }).isVisible());
  await checkWidth(page, 'Bahan belajar terbuka', width);

  const search = page.getByRole('searchbox', { name: 'Cari materi atau dosen' });
  await search.fill('gigitan serangga');
  assert.ok(await card.isVisible());
  const timings = await page.waitForFunction(() => {
    const { openMs, filterMs } = document.documentElement.dataset;
    return openMs && filterMs && { openMs, filterMs };
  });
  const { openMs, filterMs } = await timings.jsonValue();
  console.log(width + ' px, synthetic catalogue interaction: open ' + openMs + ' ms, filter ' + filterMs + ' ms');
  await search.fill('bukan-sesi');
  assert.ok(await page.locator('#empty').isVisible());

  const blocks = page.getByRole('navigation', { name: 'Pilih blok belajar' });
  await blocks.getByRole('link', { name: 'Blok berikutnya Segera hadir' }).click();
  assert.match(page.url(), /\/ruang-belajar\/blok\/blok-berikutnya\/$/);
  await checkWidth(page, 'Blok segera hadir', width);
  assert.equal(await page.locator('#jadwal-kuliah').count(), 0);
  assert.ok(await page.getByRole('link', { name: /Pedoman IAUI/ }).isVisible());
  await blocks.getByRole('link', { name: 'KSI', exact: true }).click();
  assert.ok(await page.locator('#jadwal-kuliah').isVisible());
  await checkWidth(page, 'Kembali ke blok KSI', width);

  await blocks.getByRole('link', { name: 'Keluhan Neuropsikiatri Arsip' }).click();
  assert.equal(await page.locator('#study-agenda-data').count(), 0);
  const archive = page.locator('#jadwal-kuliah');
  await archive.locator('summary').click();
  await checkWidth(page, 'Arsip Neuropsikiatri terbuka', width);
  await archive.getByRole('link', { name: 'Anatomi otak, hubungan dengan peningkatan TIK' }).press('Enter');
  await page.waitForFunction(() => document.activeElement.matches('#neuro-anatomi-otak-hubungan-dengan-peningkatan-tik h3'));
  assert.ok(await page.getByRole('link', { name: 'Anakku kejang', exact: true }).isVisible());

  await page.goto(base + '/ruang-belajar/pengajar/');
  await checkWidth(page, 'Direktori pengajar', width);
  await page.goto(base + '/ruang-belajar/tutorial/kusta/');
  await page.getByText('Definisi', { exact: true }).first().click();
  await checkWidth(page, 'Tutorial terbuka', width);
  assert.deepEqual(errors, []);
}

async function checkHeader(page, width) {
  await page.goto(base);
  const header = page.getByRole('navigation', { name: 'Navigasi utama' });
  const menu = page.locator('#menu');
  const isMobile = width <= 740;
  if (isMobile) {
    assert.ok(!(await header.isVisible()));
    await menu.click();
    const home = header.getByRole('link', { name: 'Home', exact: true });
    await home.focus();
    await home.press('Escape');
    assert.ok(!(await header.isVisible()));
    assert.ok(await menu.evaluate(element => element === document.activeElement));
    await menu.click();
  } else {
    assert.ok(!(await menu.isVisible()));
  }
  await checkWidth(page, 'Navigasi atas', width);
  const home = header.locator('a[aria-current="page"]');
  assert.equal(await home.textContent(), 'Home');
  const light = await home.evaluate(element => getComputedStyle(element).backgroundColor);
  await page.locator('#theme').click();
  const dark = await home.evaluate(element => getComputedStyle(element).backgroundColor);
  assert.notEqual(light, 'rgba(0, 0, 0, 0)');
  assert.notEqual(dark, light);
  await header.getByRole('link', { name: 'About', exact: true }).click();
  if (isMobile) await menu.click();
  assert.equal(await header.locator('a[aria-current="page"]').textContent(), 'About');
  await checkWidth(page, 'Navigasi halaman About', width);
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      try {
        await checkHeader(page, width);
        await checkStudyFlow(page, width);
        console.log('PASS ' + width + ' px: beranda, agenda, fokus, katalog, pengajar, dan tutorial');
      } finally {
        await page.close();
      }
    }
    const page = await browser.newPage({ viewport: { width: 768, height: 800 }, reducedMotion: 'reduce' });
    try {
      await checkHeader(page, 768);
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
