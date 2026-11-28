const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const checkWorkroom = require('./check-workroom.cjs');

const base = 'http://localhost:8080';
const widths = [320, 360, 375, 390, 400, 412, 768, 867, 1024, 1440];

async function checkResponsivePages(browser) {
  const routes = ['/', '/about/', '/journal/', '/journal/awal-dari-segalanya/',
    '/shop/', '/shop/creative-kit/', '/ruang-belajar/', '/ruang-belajar/jadwal-lengkap/',
    '/ruang-belajar/pengajar/', '/ruang-belajar/tutorial/kusta/'];
  for (const width of widths) {
    const galaxy = width === 400 || width === 867;
    const page = await browser.newPage({
      viewport: { width, height: width === 867 ? 400 : galaxy ? 867 : 800 },
      isMobile: width <= 867, hasTouch: width <= 867,
      deviceScaleFactor: galaxy ? 2.7 : 1, reducedMotion: 'reduce',
    });
    try {
      for (const path of routes) {
        assert.ok((await page.goto(base + path)).ok(), path);
        await checkWidth(page, path, width);
      }
      await checkHeader(page, width);
    } finally {
      await page.close();
    }
  }
  console.log('PASS responsive public pages at all target widths and Galaxy A16 landscape');
}

async function checkWidth(page, name, width) {
  await page.waitForFunction(expected => document.documentElement.clientWidth === expected,
    width, { timeout: 5000 });
  const { content, viewport } = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  assert.equal(viewport, width, name + ' did not use the requested viewport');
  assert.ok(content <= viewport, name + ' overflows at ' + width + ' px');
}

async function chooseBlock(page, name) {
  await page.locator('.study-block-picker > summary').click();
  await page.getByRole('navigation', { name: 'Pilih blok belajar' })
    .getByRole('link', { name, exact: true }).click();
}

async function checkStudyFlow(page, width) {
  await page.clock.setFixedTime(new Date('2026-11-19T01:30:00Z'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(base);
  await checkWidth(page, 'Beranda', width);
  await page.getByRole('link', { name: 'Jadwal kuliah hari ini', exact: true }).click();
  assert.match(page.url(), /\/ruang-belajar\/#ringkasan-jadwal$/);
  const overview = page.locator('#ringkasan-jadwal');
  await overview.getByRole('link', { name: 'Buka materi' }).waitFor();
  await overview.getByRole('link', { name: 'Jadwal lengkap', exact: true }).click();
  assert.match(page.url(), /\/ruang-belajar\/#jadwal-kuliah$/);
  await checkWidth(page, 'Agenda', width);
  const tomorrow = page.locator('[data-agenda-days] section').nth(1);
  const glaucoma = tomorrow.locator('.study-slot').filter({ hasText: 'Glaukoma dan kelainan' });
  assert.equal(await glaucoma.getAttribute('data-start'), '07:00');
  assert.equal(await glaucoma.getAttribute('data-end'), '08:00');
  assert.match(await tomorrow.textContent(), /Muhammad Mazaya Atif/);
  assert.doesNotMatch(await tomorrow.textContent(), /Antivirus/);
  if (width === 320) {
    const result = await page.request.get(base + '/ruang-belajar/kalender/kuliah-antivirus.ics');
    assert.equal(result.status(), 404);
    const rescheduled = page.locator('#antivirus');
    assert.match(await rescheduled.textContent(), /Waktu baru belum ditentukan/);
    assert.equal(await rescheduled.locator('a[href$=".ics"]').count(), 0);
  }

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
  await search.fill('gigtan serangga');
  assert.ok(await card.isVisible());
  await search.fill('bukan-sesi');
  assert.ok(await page.locator('#empty').isVisible());

  await chooseBlock(page, 'Blok berikutnya Segera hadir');
  assert.match(page.url(), /\/ruang-belajar\/blok\/blok-berikutnya\/$/);
  await checkWidth(page, 'Blok segera hadir', width);
  assert.equal(await page.locator('#jadwal-kuliah').count(), 0);
  assert.ok(await page.getByRole('link', { name: /Pedoman IAUI/ }).isVisible());
  await chooseBlock(page, 'Keluhan Sensoris dan Integumentum');
  assert.ok(await page.locator('#jadwal-kuliah').isVisible());
  await checkWidth(page, 'Kembali ke blok KSI', width);

  await chooseBlock(page, 'Keluhan Neuropsikiatri Arsip');
  assert.equal(await page.locator('[data-agenda-clock]').count(), 0);
  const archive = page.locator('#jadwal-kuliah');
  await archive.getByRole('link', { name: /Lihat jadwal lengkap/ }).click();
  await page.waitForURL('**/neuropsikiatri/jadwal-lengkap/');
  await checkWidth(page, 'Arsip Neuropsikiatri terbuka', width);
  await page.locator('[data-full-schedule]').getByRole('link', { name: 'Anatomi otak, hubungan dengan peningkatan TIK' }).press('Enter');
  await page.waitForFunction(() => document.activeElement.matches('#neuro-anatomi-otak-hubungan-dengan-peningkatan-tik h3'));
  assert.ok(await page.getByRole('link', { name: 'Anakku kejang', exact: true }).isVisible());

  await page.goto(base + '/ruang-belajar/pengajar/');
  await checkWidth(page, 'Direktori pengajar', width);
  const teacherSearch = page.getByRole('searchbox', { name: 'Cari dosen' });
  for (const query of ['dr agung', 'Agung, dr.', 'agng', 'agugn']) {
    await teacherSearch.fill(query);
    assert.ok(await page.getByRole('link', { name: /Agung Biworo/ }).isVisible(), query);
  }
  await teacherSearch.fill('agus');
  assert.ok(await page.getByRole('link', { name: /Agus Fitrian Noor/ }).isVisible());
  await page.goto(base + '/ruang-belajar/tutorial/kusta/');
  await page.getByText('Definisi', { exact: true }).first().click();
  await checkWidth(page, 'Tutorial terbuka', width);
  assert.deepEqual(errors, []);
}

async function checkExamPriorities(page, width) {
  await page.goto(base + '/ruang-belajar/');
  const panel = page.locator('.study-exam-panel');
  const heading = panel.locator(':scope > summary');
  assert.equal(await page.locator('#study-exam-heading').textContent(), 'Prioritas Ujian CBT KSI');
  assert.equal(await heading.innerText(), 'Tampilkan daftar prioritas');
  assert.equal(await panel.evaluate(element => element.open), false);
  await heading.press('Enter');
  assert.equal(await panel.evaluate(element => element.open), true);
  assert.equal(await heading.innerText(), 'Sembunyikan daftar prioritas');
  await heading.press('Enter');
  assert.equal(await panel.evaluate(element => element.open), false);
  await page.getByRole('link', { name: 'Prioritas Ujian', exact: true }).click();
  const priorities = page.locator('#prioritas-ujian');
  await page.waitForFunction(() => document.querySelector('.study-exam-panel').open);
  assert.equal(await priorities.locator('.study-topic > summary').count(), 9);
  assert.match(await priorities.textContent(), /84 dari 150 soal \(56%\)/);
  const skin = priorities.locator('.study-topic').first();
  assert.match(await skin.locator('summary').textContent(), /Kulit dan Kelamin.*40 soal/);
  await skin.locator('summary').press('Enter');
  await checkWidth(page, 'Prioritas ujian KSI', width);
  const dermatitis = skin.locator('li').filter({ hasText: 'Dermatitis eksematosa' });
  const teacher = dermatitis.getByRole('link', { name: 'dr. Sani Widjaja, Sp.KK, FINSDV', exact: true });
  assert.equal(await teacher.getAttribute('href'), '/ruang-belajar/pengajar/dr-sani-widjaja/');
  await skin.getByRole('link', { name: 'Dermatitis eksematosa', exact: true }).press('Enter');
  await page.waitForFunction(() => document.activeElement.matches('#dermatitis-eksematosa h3'));
  assert.ok(await page.locator('#study-catalogue').evaluate(element => element.open));
}

async function checkCurrentBlockArchive(page, width) {
  await page.goto(base + '/ruang-belajar/#jadwal-kuliah');
  const archive = page.locator('#arsip-kelas');
  await archive.locator('summary').waitFor();
  assert.equal(await archive.locator('.study-slot').count(), 0);
  await archive.locator('summary').click();
  await archive.locator('h3 time').first().waitFor();
  assert.equal(await archive.locator('h3 time').first().getAttribute('datetime'), '2026-11-18');
  assert.ok(await archive.getByRole('link', { name: 'Radang telinga luar', exact: true }).isHidden());

  await page.clock.setFixedTime(new Date('2026-11-19T03:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  assert.ok(await archive.getByRole('link', { name: 'Radang telinga luar', exact: true }).isVisible());
  assert.ok(await archive.getByRole('link', { name: 'Insect bites', exact: true }).isHidden());

  await page.clock.setFixedTime(new Date('2026-11-19T04:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  assert.ok(await archive.getByRole('link', { name: 'Insect bites', exact: true }).isVisible());
  assert.ok(await archive.getByRole('link', { name: 'Arthropoda beracun', exact: true }).isHidden());
  assert.equal(await archive.locator('.study-slot[data-day="2026-11-19"]').count(), 2);
  await checkWidth(page, 'Arsip kelas blok berjalan', width);
}

async function checkKmsAndResearch(page, width) {
  await page.goto(base + '/ruang-belajar/');
  await chooseBlock(page, 'Keluhan Muskuloskeletal (KMS) Arsip');
  await checkWidth(page, 'Arsip KMS', width);
  await page.locator('#jadwal-kuliah').getByRole('link', { name: /Lihat jadwal lengkap/ }).click();
  await page.locator('[data-full-schedule]').getByRole('link', { name: 'Ortopedi Onkologi 1' }).waitFor();
  await page.getByRole('link', { name: 'Kembali ke ringkasan jadwal' }).click();
  await page.locator('#study-catalogue > summary').click();
  const conflicting = page.locator('#kms-streptococcus .study-date');
  assert.match(await conflicting.textContent(), /Tanggal berbeda/);
  assert.equal(await conflicting.locator('time').count(), 0);
  assert.equal(await page.locator('#skill-lab article').count(), 3);
  assert.equal(await page.locator('#skill-lab time').count(), 6);
  assert.equal(await page.locator('#tutorial article').count(), 3);
  await checkWidth(page, 'Katalog KMS terbuka', width);

  await chooseBlock(page, 'Metodologi Penelitian II');
  assert.equal(await page.locator('#ujian time[datetime="2026-10-07"]').count(), 1);
  assert.equal(await page.locator('#ujian time[datetime="2026-12-09"]').count(), 1);
  assert.match(await page.locator('#ujian').textContent(), /Jam ujian belum tercantum.*Labkom/);
  assert.ok(await page.locator('#riset-uas').isHidden());
  await page.locator('#ujian').getByRole('link', { name: 'UAS · CBT' }).press('Enter');
  await page.waitForFunction(() => document.activeElement.matches('#riset-uas h3'));
  const download = await page.request.get(base + '/ruang-belajar/blok/metodologi-riset-ii/kalender/metodologi-riset-ii.ics');
  assert.ok(download.ok());
  const calendar = await download.text();
  assert.match(calendar, /DTSTART;VALUE=DATE:20261007/);
  assert.match(calendar, /DTSTART:20261209T000000Z/);
  assert.match(calendar, /DTSTART:20261124T233000Z/);
  assert.match(calendar, /LOCATION:Zoom/);
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 18);
  await checkWidth(page, 'Metodologi Penelitian II', width);
}

async function checkDashboardOverview(page, width) {
  await page.goto(base + '/ruang-belajar/');
  await page.clock.setFixedTime(new Date('2026-11-19T01:30:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  const today = page.locator('[data-study-next]');
  await page.locator('[data-agenda-days]').waitFor();
  assert.equal(await today.getByRole('heading', { level: 2 }).textContent(), 'Hari Ini');
  assert.match(await today.textContent(), /Sedang berlangsung.*Radang telinga luar.*08:00–10:00 WITA · RKB 4/s);
  await today.getByRole('link', { name: 'Buka materi' }).click();
  await page.waitForFunction(() => document.activeElement.matches('#radang-telinga-luar h3'));
  assert.ok(await page.locator('#radang-telinga-luar .study-material').evaluate(element => element.open));

  await page.clock.setFixedTime(new Date('2026-11-19T15:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  assert.equal(await today.getByRole('heading', { level: 2 }).textContent(), 'Hari yang Akan Datang');
  assert.match(await today.textContent(), /Jadwal terdekat.*Glaukoma.*20 November 2026.*07:00–08:00 WITA/s);
  assert.ok(await today.getByRole('link', { name: 'Buka materi' }).isHidden());
  await page.clock.setFixedTime(new Date('2026-12-20T00:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  assert.equal(await today.getByRole('heading', { level: 2 }).textContent(), 'Jadwal Kuliah');
  assert.match(await today.textContent(), /Belum ada jadwal berikutnya/);

  const shortcuts = page.getByRole('navigation', { name: 'Pintasan Ruang Belajar' });
  assert.equal(await shortcuts.getByRole('link').count(), 4);
  await shortcuts.getByText('Lainnya', { exact: true }).press('Enter');
  assert.ok(await shortcuts.getByRole('link', { name: 'Direktori dosen' }).isVisible());
  await shortcuts.getByText('Lainnya', { exact: true }).press('Enter');

  const search = page.getByRole('searchbox', { name: 'Cari di Ruang Belajar' });
  const results = page.locator('#study-search-results');
  const teachers = results.locator('[data-search-group="Dosen"]');
  await search.fill('agus');
  assert.match(await teachers.getByRole('link').first().textContent(), /Agus/);
  await search.fill('agng');
  assert.ok(await teachers.getByRole('link', { name: /Agung Biworo/ }).isVisible());
  await search.fill('telinga');
  const chapter = results.getByRole('link', { name: /Pemeriksaan THT dan penanganan epistaksis/ });
  assert.equal(await chapter.getAttribute('href'), '/dokumen/modul-skill-lab-4-ksi-2026.pdf#page=65');
  assert.equal(await chapter.getAttribute('target'), '_blank');
  await checkWidth(page, 'Hasil pencarian Ruang Belajar', width);
  const lecture = results.getByRole('link', { name: /Radang telinga luar/ });
  await lecture.press('Enter');
  await page.waitForFunction(() => document.activeElement.matches('#radang-telinga-luar h3'));
  await search.fill('zzqxyv');
  assert.ok(await page.getByRole('status').filter({ hasText: 'Tidak ada hasil' }).isVisible());
  await search.press('Escape');
  assert.equal(await search.inputValue(), '');
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
  await page.waitForURL(base + '/about/');
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

async function checkPageTransition(browser) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 800 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'no-preference',
  });
  try {
    await page.goto(base);
    await page.evaluate(() => {
      window.originalHeader = document.querySelector('header');
      const nativeTransition = document.startViewTransition.bind(document);
      document.startViewTransition = update => {
        const transition = nativeTransition(update);
        transition.ready.then(() => {
          const incoming = document.getAnimations().find(animation => animation.animationName === 'page-cover');
          document.documentElement.dataset.pageCoverDuration = incoming?.effect.getTiming().duration ?? '';
        }, () => {
          document.documentElement.dataset.pageCoverDuration = 'skipped';
        });
        return transition;
      };
    });
    await page.getByRole('link', { name: 'Jelajahi Journal', exact: false }).first().tap();
    await page.waitForURL('**/journal/');
    await page.waitForFunction(() => document.activeElement.matches('#main h1') &&
      document.querySelector('#site-route-status').textContent.includes('A collection of thoughts'));
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-page-cover-duration'));
    assert.equal(await page.locator('html').getAttribute('data-page-cover-duration'), '160');
    assert.ok(await page.evaluate(() => window.originalHeader === document.querySelector('header')));

    await page.goBack();
    await page.waitForURL(base + '/');
    await page.locator('.site-destinations').waitFor();
    assert.ok(await page.evaluate(() => window.originalHeader === document.querySelector('header')));

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.site-destinations a[href="/ruang-belajar/"]').tap();
    await page.waitForURL('**/ruang-belajar/');
    const search = page.getByRole('searchbox', { name: 'Cari di Ruang Belajar' });
    await search.fill('agng');
    assert.match(await page.locator('#study-search-results').textContent(), /Agung Biworo/i);
    assert.ok(await page.evaluate(() => window.originalHeader === document.querySelector('header')));
    console.log('PASS mobile navigation: document retained, overlap, history, and study search');
  } finally {
    await page.close();
  }
}

async function checkInteractiveAccessibility(browser) {
  const axePath = require.resolve('axe-core/axe.min.js');
  for (const width of [360, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 850 }, reducedMotion: 'reduce' });
    async function audit(selector, state) {
      await page.addScriptTag({ path: axePath });
      const violations = await page.evaluate(async context => {
        const { violations } = await axe.run(context, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
        return violations.map(rule => [rule.id, rule.nodes.map(node => node.target)]);
      }, selector);
      assert.deepEqual(violations, [], state + ' at ' + width + 'px: ' + JSON.stringify(violations));
    }
    try {
      await page.goto(base + '/');
      if (width === 360) await page.locator('#menu').click();
      await audit('body > header', 'Open navigation');
      await checkWidth(page, 'Jelajahi situs', width);
      assert.equal(await page.locator('.site-destinations li').count(), 4);
      await page.locator('#theme').click();
      assert.equal(await page.locator('#theme').getAttribute('aria-pressed'), 'true');
      await audit('.site-destinations', 'Dark destination grid');

      await page.goto(base + '/ruang-belajar/');
      const search = page.getByRole('searchbox', { name: 'Cari di Ruang Belajar' });
      await search.fill('agung');
      await page.locator('#study-search-results a').first().waitFor();
      assert.equal(await page.locator('[data-search-group]:visible > h2').count() > 0, true);
      await audit('#main', 'Open study search');

      await page.route('https://formspree.io/**', route => route.fulfill({ status: 503, json: {} }));
      const feedback = page.locator('[data-study-feedback]');
      await feedback.getByLabel('Topik masukan').selectOption({ label: 'Materi belajar' });
      await feedback.getByLabel('Nama (wajib)', { exact: true }).fill('Penguji');
      await feedback.getByLabel('Pesan (wajib)', { exact: true }).fill('Uji pesan gagal.');
      await feedback.getByRole('button', { name: 'Kirim masukan' }).click();
      await feedback.getByRole('alert').filter({ hasText: 'Masukan belum bisa dikirim' }).waitFor();
      assert.equal(await feedback.getByLabel('Pesan (wajib)', { exact: true }).inputValue(), 'Uji pesan gagal.');
      await audit('.study-feedback-form', 'Feedback failure');
      await checkWidth(page, 'Ruang Belajar', width);
      if (width === 360) {
        await page.route('**/api/study-comments', async route => {
          if (route.request().method() === 'GET') return route.fulfill({ json: { comments: [], siteKey: 'fixture-key' } });
          assert.match(route.request().postData(), /challenge-fixture/);
          return route.fulfill({ status: 202, json: { pending: true } });
        });
        await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', route =>
          route.fulfill({ contentType: 'text/javascript', body: `
            window.turnstile = {
              render(container, options) {
                if (options.action !== 'study_comment' || options.sitekey !== 'fixture-key') throw Error('Wrong challenge');
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = 'cf-turnstile-response';
                input.value = 'challenge-fixture';
                container.append(input);
                return 'fixture';
              },
              remove() {},
              reset() {},
            };
          ` }));
        await page.reload();
        await feedback.getByLabel('Topik masukan').selectOption({ label: 'Materi belajar' });
        await feedback.getByLabel('Nama (wajib)', { exact: true }).fill('Penguji');
        await feedback.getByLabel('Pesan (wajib)', { exact: true }).fill('Uji tantangan.');
        await feedback.getByRole('checkbox', { name: /Izinkan nama/ }).check();
        await feedback.locator('[name="cf-turnstile-response"]').waitFor({ state: 'attached' });
        await feedback.getByRole('button', { name: 'Kirim masukan' }).click();
        await feedback.getByRole('status').filter({ hasText: 'Komentar menunggu persetujuan' }).waitFor();
      }
    } finally {
      await page.close();
    }
  }
  console.log('PASS axe: interactive navigation, search, and feedback at 360, 1024 and 1440 px');
}

async function main() {
  const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch(chromiumPath ? { executablePath: chromiumPath } : { channel: 'chrome' });
  try {
    await checkPageTransition(browser);
    await checkResponsivePages(browser);
    for (const width of [320, 360, 412]) {
      const page = await browser.newPage({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      try {
        await checkHeader(page, width);
        await checkStudyFlow(page, width);
        if (width === 320) {
          await checkExamPriorities(page, width);
          await checkCurrentBlockArchive(page, width);
          await checkKmsAndResearch(page, width);
        }
        await checkDashboardOverview(page, width);
        console.log('PASS ' + width + ' px: beranda, agenda, fokus, katalog, pengajar, dan tutorial');
      } finally {
        await page.close();
      }
    }
    const page = await browser.newPage({ viewport: { width: 768, height: 800 }, reducedMotion: 'reduce' });
    try {
      await checkHeader(page, 768);
      await checkDashboardOverview(page, 768);
    } finally {
      await page.close();
    }
    await checkInteractiveAccessibility(browser);
    await checkWorkroom(browser, base);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
