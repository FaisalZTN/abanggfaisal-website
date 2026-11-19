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

async function checkExamPriorities(page, width) {
  await page.goto(base + '/ruang-belajar/');
  await page.getByRole('link', { name: 'Prioritas ujian', exact: true }).click();
  const priorities = page.locator('#prioritas-ujian');
  assert.equal(await priorities.locator('summary').count(), 9);
  assert.match(await priorities.textContent(), /84 dari 150 soal \(56%\)/);
  const skin = priorities.locator('details').first();
  assert.match(await skin.locator('summary').textContent(), /Kulit dan Kelamin.*40 soal/);
  await skin.locator('summary').press('Enter');
  await checkWidth(page, 'Prioritas ujian KSI', width);
  await skin.getByRole('link', { name: 'Dermatitis eksematosa', exact: true }).press('Enter');
  await page.waitForFunction(() => document.activeElement.matches('#dermatitis-eksematosa h3'));
  assert.ok(await page.locator('#study-catalogue').evaluate(element => element.open));
}

async function checkKmsAndResearch(page, width) {
  await page.goto(base + '/ruang-belajar/');
  const choices = page.getByRole('navigation', { name: 'Pilih blok belajar' });
  await choices.getByRole('link', { name: 'Keluhan Muskuloskeletal (KMS) Arsip' }).click();
  await checkWidth(page, 'Arsip KMS', width);
  await page.locator('#jadwal-kuliah summary').click();
  assert.ok(await page.locator('#jadwal-kuliah').getByRole('link', { name: 'Ortopedi Onkologi 1' }).isVisible());
  await page.locator('#study-catalogue > summary').click();
  const conflicting = page.locator('#kms-streptococcus .study-date');
  assert.match(await conflicting.textContent(), /Tanggal berbeda/);
  assert.equal(await conflicting.locator('time').count(), 0);
  assert.equal(await page.locator('#skill-lab article').count(), 3);
  assert.equal(await page.locator('#skill-lab time').count(), 6);
  assert.equal(await page.locator('#tutorial article').count(), 3);
  await checkWidth(page, 'Katalog KMS terbuka', width);

  await choices.getByRole('link', { name: 'Metodologi Penelitian II' }).click();
  assert.equal(await page.locator('#ujian time[datetime="2026-10-07"]').count(), 1);
  assert.equal(await page.locator('#ujian time[datetime="2026-12-09"]').count(), 1);
  assert.match(await page.locator('#ujian').textContent(), /Jam ujian belum tercantum.*Labkom/);
  assert.ok(await page.locator('#riset-uas').isHidden());
  await page.locator('#ujian').getByRole('link', { name: 'UAS · CBT' }).press('Enter');
  await page.waitForFunction(() => document.activeElement.matches('#riset-uas h3'));
  const download = await page.request.get(base + '/ruang-belajar/blok/metodologi-riset-ii/kalender/metodologi-riset-ii.ics');
  assert.ok(download.ok());
  const calendar = await download.text();
  assert.match(calendar, /DTSTART;VALUE=DATE:20261209/);
  assert.match(calendar, /DTSTART:20261125T000000Z/);
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 18);
  await checkWidth(page, 'Metodologi Penelitian II', width);
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

  await page.goto(base + '/ruang-belajar/');
  const backToTop = page.getByRole('button', { name: 'Kembali ke atas' });
  assert.ok(!(await backToTop.isVisible()));
  await page.evaluate(() => window.scrollTo(0, 900));
  await backToTop.waitFor();
  const bar = page.locator('body > header');
  assert.ok(Math.abs((await bar.boundingBox()).y) <= 1);
  await backToTop.focus();
  await backToTop.press('Enter');
  await page.waitForFunction(() => window.scrollY === 0);
  assert.ok(await bar.locator('.brand').evaluate(element => element === document.activeElement));
  await backToTop.waitFor({ state: 'hidden' });

  const footer = await page.locator('.site-footer').evaluate(element => {
    const { borderRadius, backdropFilter } = getComputedStyle(element);
    return { borderRadius, backdropFilter };
  });
  assert.equal(footer.borderRadius, '24px');
  assert.match(footer.backdropFilter, /blur/);

  await page.goto(base + '/ruang-belajar/#jadwal-kuliah');
  await page.waitForFunction(() => window.scrollY > 0);
  const target = await page.locator('#jadwal-kuliah').boundingBox();
  const sticky = await bar.boundingBox();
  assert.ok(target.y >= sticky.y + sticky.height, 'Agenda is covered by the sticky header');
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      try {
        await checkHeader(page, width);
        await checkStudyFlow(page, width);
        if (width === 320) {
          await checkExamPriorities(page, width);
          await checkKmsAndResearch(page, width);
        }
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
