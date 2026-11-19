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
  await search.fill('bukan-sesi');
  assert.ok(await page.locator('#empty').isVisible());

  await page.goto(base + '/ruang-belajar/pengajar/');
  await checkWidth(page, 'Direktori pengajar', width);
  await page.goto(base + '/ruang-belajar/tutorial/kusta/');
  await page.getByText('Definisi', { exact: true }).first().click();
  await checkWidth(page, 'Tutorial terbuka', width);
  assert.deepEqual(errors, []);
}

async function main() {
  const browser = await chromium.launch();
  try {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
      try {
        await checkStudyFlow(page, width);
        console.log('PASS ' + width + ' px: beranda, agenda, fokus, katalog, pengajar, dan tutorial');
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
