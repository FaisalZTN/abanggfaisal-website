const theme = document.querySelector('#theme');
const themeColor = document.querySelector('meta[name="theme-color"]');
function setTheme(dark) {
  document.documentElement.classList.toggle('dark', dark);
  themeColor.content = dark ? '#18261f' : '#f6f4ed';
  theme.setAttribute('aria-label', dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap');
}
setTheme(document.documentElement.classList.contains('dark'));
theme.addEventListener('click', () => {
  const dark = !document.documentElement.classList.contains('dark');
  setTheme(dark);
  try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch {}
});
const menu = document.querySelector('#menu');
const nav = document.querySelector('#nav');

function setMenu(open) {
  menu.setAttribute('aria-expanded', String(open));
  nav.classList.toggle('open', open);
}

menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
    if (nav.contains(document.activeElement) && menu.getClientRects().length) menu.focus();
    setMenu(false);
  }
});

const backToTop = document.querySelector('#back-to-top');

function updateBackToTop() {
  if (document.activeElement !== backToTop) backToTop.hidden = window.scrollY < 480;
}

window.addEventListener('scroll', updateBackToTop, { passive: true });
window.addEventListener('pageshow', updateBackToTop);
backToTop.addEventListener('blur', updateBackToTop);
backToTop.addEventListener('click', () => {
  setMenu(false);
  document.querySelector('.header-inner .brand').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
});
updateBackToTop();

function studySearchWords(value) {
  return value.toLocaleLowerCase('id').normalize('NFD')
    .replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? [];
}

function oneStudyTypo(query, word) {
  if (query.length < 3 || Math.max(query.length, word.length) < 4
      || Math.abs(query.length - word.length) > 1
      || /\d/.test(query + word)) return false;

  const shorter = query.length <= word.length ? query : word;
  const longer = query.length <= word.length ? word : query;
  let index = 0;
  while (index < shorter.length && shorter[index] === longer[index]) index++;
  if (shorter.length !== longer.length) {
    return shorter.slice(index) === longer.slice(index + 1);
  }
  return shorter.slice(index + 1) === longer.slice(index + 1)
    || (shorter[index] === longer[index + 1] && shorter[index + 1] === longer[index]
        && shorter.slice(index + 2) === longer.slice(index + 2));
}

function studyMatchScore(terms, words, context = []) {
  let score = 0;
  for (const term of terms) {
    if (words.includes(term)) continue;
    if (words.some(word => word.startsWith(term))) score += 1;
    else if (words.some(word => word.includes(term)) || context.includes(term)) score += 2;
    else if (context.some(word => word.includes(term)) || words.some(word => oneStudyTypo(term, word))) score += 3;
    else if (context.some(word => oneStudyTypo(term, word))) score += 4;
    else return Infinity;
  }
  return score;
}

function initializePage(signal) {
  const feedback = document.querySelector('[data-study-feedback]');
  const commentsEndpoint = '/api/study-comments';
  const comments = document.querySelector('[data-study-comments]');
  const commentList = comments?.querySelector('[data-new-comments]');
  function showComment(comment) {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    const message = document.createElement('p');
    name.textContent = comment.name;
    message.textContent = comment.message;
    item.append(name, message);
    commentList.append(item);
    commentList.hidden = false;
    comments.querySelector('[data-no-comments]')?.remove();
  }
  if (feedback && commentList) {
    fetch(commentsEndpoint, { signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!Array.isArray(data?.comments) || signal.aborted) return;
        for (const comment of data.comments) showComment(comment);
        feedback.querySelector('[data-public-comment-option]').hidden = false;
      })
      .catch(() => {});
  }
  feedback?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = feedback.querySelector('button[type="submit"]');
    if (button.disabled) return;
    const status = feedback.querySelector('[data-feedback-status]');
    const fields = new FormData(feedback);
    button.disabled = true;
    status.dataset.state = 'pending';
    status.textContent = 'Mengirim masukan…';
    try {
      const publish = fields.get('public_comment') === 'yes';
      const response = await fetch(publish ? commentsEndpoint : feedback.action, {
        method: 'POST',
        body: fields,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Feedback submission failed');
      const result = publish ? await response.json() : null;
      feedback.reset();
      status.dataset.state = 'success';
      status.textContent = result?.pending ? 'Masukan terkirim. Komentar menunggu persetujuan.'
        : result?.published === false ? 'Masukan terkirim, tetapi komentar belum masuk antrean.'
        : 'Masukan berhasil dikirim. Terima kasih!';
    } catch {
      status.dataset.state = 'error';
      status.textContent = 'Masukan belum bisa dikirim. Coba lagi atau hubungi alamat email di bawah.';
    } finally {
      button.disabled = false;
    }
  }, { signal });

  const search=document.querySelector('#search'),category=document.querySelector('#category');if (search) {
    const results = document.querySelector('#results');
    const cards = [...results.querySelectorAll('.card')];
    const sort = document.querySelector('#study-sort');
    const catalogue = document.querySelector('#study-catalogue');
    const more = document.querySelector('#study-more');
    const studyWords = sort || more
      ? new Map(cards.map(card => [card, studySearchWords(card.dataset.search + ' ' + card.dataset.category)]))
      : null;
    const step = Number(results.dataset.pageSize) || cards.length || 1;
    let limit = step;
    function filter() {
      const query = search.value.trim().toLocaleLowerCase('id');
      const terms = studyWords ? studySearchWords(query) : [];
      let count = 0;
      for (const card of cards) {
        const matches = (!category.value || card.dataset.category === category.value)
          && (studyWords
            ? Number.isFinite(studyMatchScore(terms, studyWords.get(card)))
            : (card.dataset.search + ' ' + card.dataset.category).toLocaleLowerCase('id').includes(query));
        card.hidden = !matches || ++count > limit;
      }
      document.querySelector('#empty').hidden = count > 0;
      document.querySelector('#count').textContent = count > limit
        ? limit + ' dari ' + count + ' hasil' : count + ' hasil';
      if (more) more.hidden = count <= limit;
    }
    function reset() { limit = step; filter(); }
    function revealLinkedCard() {
      if (location.hash === '#prioritas-ujian') {
        const examPanel = document.querySelector('.study-exam-panel');
        if (examPanel) examPanel.open = true;
      }
      const target = cards.find(card => card.id && '#' + card.id === location.hash);
      if (catalogue && (target || location.hash === '#kuliah')) catalogue.open = true;
      if (!target) return;
      search.value = '';
      category.value = '';
      limit = Math.max(limit, cards.indexOf(target) + 1);
      filter();
      const title = target.querySelector('h3');
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start' });
    }
    search.addEventListener('input', reset);
    category.addEventListener('change', reset);
    if (sort) {
      sort.addEventListener('change', () => {
        const ordered = sort.value === 'date'
          ? [...cards].sort((left, right) => (left.dataset.sortDate || '9999').localeCompare(right.dataset.sortDate || '9999'))
          : cards;
        results.append(...ordered);
        filter();
      });
      window.addEventListener('hashchange', revealLinkedCard, { signal });
      document.addEventListener('click', event => {
        const anchor = event.target.closest('a[href]');
        if (!anchor || anchor.pathname !== location.pathname || anchor.origin !== location.origin || !anchor.hash
            || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const linkedCard = cards.find(card => '#' + card.id === anchor.hash);
        if (anchor.hasAttribute('data-next-material')) {
          const material = linkedCard?.querySelector('.study-material');
          if (material) material.open = true;
        }
        if (anchor.hash === location.hash) {
          if (linkedCard) event.preventDefault();
          revealLinkedCard();
        }
      }, { signal });
    }
    if (more) {
      more.addEventListener('click', () => {
        const previous = cards.filter(card => !card.hidden).length;
        limit += step;
        filter();
        const next = cards.filter(card => !card.hidden)[previous];
        if (next) {
          next.tabIndex = -1;
          next.focus();
        }
      });
      window.addEventListener('hashchange', revealLinkedCard, { signal });
    }
    filter();
    if (more || sort) revealLinkedCard();
  }
  const agenda = document.querySelector('#jadwal-kuliah');
  if (agenda?.querySelector('[data-agenda-clock]')) {
    const wita = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Makassar', calendar: 'gregory', numberingSystem: 'latn',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    const dateLabel = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'UTC' });
    const clock = agenda.querySelector('[data-agenda-clock]');
    const clockTime = clock.querySelector('time');
    const grid = agenda.querySelector('[data-agenda-days]');
    const panels = [...grid.children];
    const pastClasses = agenda.querySelector('#arsip-kelas');
    const nextClass = document.querySelector('[data-study-next]');
    const slots = new Map();
    for (const slot of agenda.querySelectorAll('[data-full-schedule] .study-slot')) {
      const day = slot.dataset.day;
      if (!slots.has(day)) slots.set(day, []);
      slots.get(day).push(slot);
    }

    let shownSlot;
    let shownStatus;
    function showNextClass(today, time) {
      const todaysSlots = slots.get(today) ?? [];
      const current = todaysSlots.find(({ dataset }) => dataset.start && dataset.start <= time && time < dataset.end);
      const upcoming = todaysSlots.find(({ dataset }) => dataset.start > time);
      const untimed = todaysSlots.find(({ dataset }) => !dataset.start);
      const nextDay = [...slots.keys()].find(day => day > today);
      const slot = current ?? upcoming ?? untimed ?? slots.get(nextDay)?.[0];
      const status = current ? 'Sedang berlangsung' : upcoming ? 'Kelas berikutnya hari ini'
        : untimed ? 'Terjadwal hari ini' : slot ? 'Jadwal terdekat' : 'Belum ada jadwal berikutnya.';
      if (slot === shownSlot && status === shownStatus) return;
      shownSlot = slot;
      shownStatus = status;

      nextClass.querySelector('h2').textContent = !slot ? 'Jadwal Kuliah'
        : slot.dataset.day === today ? 'Hari Ini' : 'Hari yang Akan Datang';
      nextClass.querySelector('[data-next-status]').textContent = status;
      const title = nextClass.querySelector('[data-next-title]');
      const details = nextClass.querySelector('[data-next-details]');
      const people = nextClass.querySelector('[data-next-people]');
      const material = nextClass.querySelector('[data-next-material]');
      title.hidden = details.hidden = people.hidden = !slot;
      material.hidden = true;
      if (slot) {
        const { day, start, hours, location: room, people: teachers } = slot.dataset;
        const session = slot.querySelector('h4 a');
        title.textContent = session.textContent;
        details.textContent = [day === today ? '' : dateLabel.format(new Date(day)),
          start ? hours + ' WITA' : hours, room || 'Lokasi belum tercantum'].filter(Boolean).join(' · ');
        people.textContent = teachers || 'Dosen belum tercantum';
        const url = new URL(session.getAttribute('href'), location.href);
        material.href = url.href;
        const otherPage = url.pathname !== location.pathname;
        const lecture = document.getElementById(url.hash.slice(1));
        material.textContent = otherPage ? 'Lihat sesi' : 'Buka materi';
        material.hidden = !otherPage && !lecture?.querySelector('.study-material');
      }
    }

    function showDay(panel, day) {
      const key = day.toISOString().slice(0, 10);
      const date = panel.querySelector('[data-agenda-date]');
      const sessions = slots.get(key) ?? [];
      date.textContent = dateLabel.format(day);
      date.dateTime = key;
      panel.querySelector('[data-agenda-count]').textContent = `${sessions.length} kuliah`;
      panel.querySelector('[data-agenda-empty]').hidden = sessions.length > 0;
      panel.querySelector('[data-agenda-list]').replaceChildren(...sessions.map(slot => slot.cloneNode(true)));
    }

    let shownPastCount = -1;
    function showPastClasses(today, time) {
      const days = [];
      let count = 0;
      // The build emits date groups in chronological order.
      for (const [day, sessions] of slots) {
        if (day > today) break;
        const finished = day < today ? sessions : sessions.filter(slot => slot.dataset.end && slot.dataset.end <= time);
        if (!finished.length) continue;
        days.push([day, finished]);
        count += finished.length;
      }
      pastClasses.querySelector('[data-past-count]').textContent = `· ${count} kelas`;
      pastClasses.hidden = false;
      if (!pastClasses.open || count === shownPastCount) return;

      const groups = days.reverse().map(([day, finished]) => {
        const group = document.createElement('div');
        const heading = document.createElement('h3');
        const date = document.createElement('time');
        date.dateTime = day;
        date.textContent = dateLabel.format(new Date(day));
        heading.append(date);
        const list = document.createElement('ul');
        list.className = 'study-agenda-list';
        list.append(...finished.map(slot => slot.cloneNode(true)));
        group.append(heading, list);
        return group;
      });
      pastClasses.querySelector('[data-past-list]').replaceChildren(...groups);
      pastClasses.querySelector('[data-past-empty]').hidden = count > 0;
      shownPastCount = count;
    }

    pastClasses?.addEventListener('toggle', () => { if (pastClasses.open) refreshAgenda(); }, { signal });

    let shownDay;
    function refreshAgenda(now = new Date()) {
      const { year, month, day, hour, minute } = Object.fromEntries(
        wita.formatToParts(now).map(({ type, value }) => [type, value]),
      );
      const key = `${year}-${month}-${day}`;
      const localTime = `${hour}:${minute}`;
      clockTime.dateTime = `${key}T${localTime}:00+08:00`;
      clockTime.textContent = localTime;

      if (nextClass) showNextClass(key, localTime);

      if (key !== shownDay) {
        // UTC here represents calendar dates after converting the timestamp to WITA.
        const today = new Date(Date.UTC(+year, +month - 1, +day));
        const tomorrow = new Date(today);
        tomorrow.setUTCDate(today.getUTCDate() + 1);
        showDay(panels[0], today);
        showDay(panels[1], tomorrow);
        shownDay = key;
      }

      if (pastClasses) showPastClasses(key, localTime);

      for (const slot of panels[0].querySelectorAll('.study-slot[data-start]:not([data-start=""])')) {
        const status = slot.querySelector('[data-session-state]');
        const { start, end } = slot.dataset;
        if (localTime < start) {
          status.textContent = 'Akan mulai';
          status.dataset.sessionState = 'upcoming';
        } else if (localTime < end) {
          status.textContent = 'Sesi terjadwal';
          status.dataset.sessionState = 'current';
        } else {
          status.textContent = 'Jam berlalu';
          status.dataset.sessionState = 'past';
        }
        status.hidden = false;
      }
    }

    let agendaTimer;
    function tickAgenda() {
      clearTimeout(agendaTimer);
      refreshAgenda();
      agendaTimer = setTimeout(tickAgenda, 60_000 - Date.now() % 60_000 + 50);
    }
    tickAgenda();
    grid.hidden = false;
    clock.hidden = false;
    signal.addEventListener('abort', () => clearTimeout(agendaTimer), { once: true });
    window.addEventListener('pageshow', tickAgenda, { signal });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tickAgenda();
    }, { signal });
  }

  const unifiedSearch = document.querySelector('#study-search');
  if (unifiedSearch) {
    const panel = unifiedSearch.closest('[role="search"]');
    const results = panel.querySelector('#study-search-results');
    const status = panel.querySelector('[role="status"]');
    let groups;
    function indexSearchGroups() {
      return [...results.querySelectorAll('[data-search-group]')].map(section => ({
        section,
        entries: [...section.querySelector('template').content.children].map(item => ({
          item,
          words: studySearchWords(item.querySelector('strong').textContent),
          context: studySearchWords(item.dataset.terms),
        })),
      }));
    }

    function updateSearch() {
      const terms = studySearchWords(unifiedSearch.value);
      if (terms.length) groups ??= indexSearchGroups();
      let count = 0;
      for (const { section, entries } of groups ?? []) {
        const matches = terms.length ? entries
          .map(({ item, words, context }) => ({ item, score: studyMatchScore(terms, words, context) }))
          .filter(result => Number.isFinite(result.score))
          .sort((a, b) => a.score - b.score)
          .map(({ item }) => item.cloneNode(true)) : [];
        const more = section.querySelector('details');
        section.querySelector(':scope > ul').replaceChildren(...matches.slice(0, 5));
        more.querySelector('ul').replaceChildren(...matches.slice(5));
        more.querySelector('summary').textContent = `Tampilkan ${matches.length - 5} hasil lainnya`;
        more.open = false;
        more.hidden = matches.length <= 5;
        section.hidden = matches.length === 0;
        count += matches.length;
      }
      results.hidden = count === 0;
      status.textContent = count ? `${count} hasil`
        : unifiedSearch.value.trim() ? 'Tidak ada hasil. Coba nama atau kata kunci lain.' : '';
    }

    unifiedSearch.addEventListener('input', updateSearch);
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape' && unifiedSearch.value) {
        event.preventDefault();
        unifiedSearch.value = '';
        unifiedSearch.focus();
        updateSearch();
      }
    });
    panel.hidden = false;
    updateSearch();
  }

  const studyQuote = document.querySelector('.study-quote');
  if (studyQuote && 'IntersectionObserver' in window) {
    const quoteObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        studyQuote.classList.add('study-quote--near');
        quoteObserver.disconnect();
      }
    }, { rootMargin: '300px' });
    quoteObserver.observe(studyQuote);
    signal.addEventListener('abort', () => quoteObserver.disconnect(), { once: true });
  }

  const homeCarousel = document.querySelector('.home-carousel');
  if (homeCarousel && 'registerProperty' in CSS && CSS.supports('width', 'calc(sin(22deg) * 1px)') && CSS.supports('opacity', 'mod(1, 2)')) {
    const cards = [...homeCarousel.querySelectorAll('li')];
    const track = homeCarousel.querySelector('.home-carousel-cards');
    const controls = homeCarousel.querySelector('.home-carousel-controls');
    const status = controls.querySelector('.home-carousel-status');
    let turn = 0;
    let gesture;
    cards.forEach((card, i) => card.style.setProperty('--slot', i));

    function showDestination(nextIndex) {
      turn = nextIndex;
      const index = ((turn % cards.length) + cards.length) % cards.length;
      track.style.setProperty('--panorama-turn', -turn);
      status.textContent = (index + 1) + ' / ' + cards.length;
      return cards[index];
    }

    controls.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => showDestination(turn + Number(button.dataset.step)));
    });
    homeCarousel.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const active = showDestination(turn + (event.key === 'ArrowLeft' ? -1 : 1));
      if (track.contains(event.target)) active.querySelector('a').focus({preventScroll: true});
    });
    track.addEventListener('focusin', event => {
      const target = cards.indexOf(event.target.closest('li'));
      if (target < 0) return;
      const distance = ((target - turn) % cards.length + cards.length) % cards.length;
      if (distance) showDestination(turn + (distance > cards.length / 2 ? distance - cards.length : distance));
    });
    track.addEventListener('touchstart', event => {
      gesture = event.touches.length === 1 ? event.touches[0] : null;
    }, { passive: true });
    track.addEventListener('touchcancel', () => { gesture = null; });
    track.addEventListener('touchend', event => {
      if (!gesture) return;
      const dx = event.changedTouches[0].clientX - gesture.clientX;
      const dy = event.changedTouches[0].clientY - gesture.clientY;
      gesture = null;
      if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
      event.preventDefault();
      showDestination(turn + (dx > 0 ? -1 : 1));
    }, { passive: false });

    homeCarousel.classList.add('is-interactive');
    showDestination(0);
    controls.hidden = false;
  }
}

// Compatibility for old bookmarks, with a strict allowlist.
const old=location.hash.slice(1);if(['home','journal','shop','about'].includes(old))location.replace(old==='home'?'/':'/'+old+'/');else if(/^(article|product)\/[a-z0-9-]+$/.test(old)){const [kind,id]=old.split('/');location.replace('/'+(kind==='article'?'journal':'shop')+'/'+id+'/')}

let pageLifecycle = new AbortController();
initializePage(pageLifecycle.signal);

const primaryRoutes = new Set(['/', '/journal/', '/ruang-belajar/', '/shop/', '/about/']);
const loadedPages = new Map();
const scrollPositions = new Map();
const headSelectors = [
  'meta[name="description"]', 'meta[property="og:title"]',
  'meta[property="og:description"]', 'meta[property="og:url"]',
  'meta[property="og:image"]', 'link[rel="canonical"]',
];
let renderedPath = location.pathname;
let navigationVersion = 0;
let pageTransition;

function isPrimaryRoute(url) {
  return url.origin === location.origin && primaryRoutes.has(url.pathname) && !url.search && !url.hash;
}

function navigationDestination(event) {
  const link = event.target.closest('a[href]');
  if (!link || link.hasAttribute('download') || (link.target && link.target.toLowerCase() !== '_self')) return null;

  const destination = new URL(link.href);
  return isPrimaryRoute(destination) && destination.pathname !== renderedPath ? destination : null;
}

function requestPage(url) {
  if (loadedPages.has(url.href)) return loadedPages.get(url.href);
  const request = fetch(url, { headers: { Accept: 'text/html' } })
    .then(async response => {
      if (!response.ok || response.url !== url.href) throw new Error('Unexpected navigation response');

      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const main = page.querySelector('main#main');
      if (!main || page.querySelector('link[rel="stylesheet"]')?.getAttribute('href') !==
          document.querySelector('link[rel="stylesheet"]')?.getAttribute('href')) throw new Error('Incompatible page');
      return { page, main };
    })
    .catch(error => {
      loadedPages.delete(url.href);
      throw error;
    });

  loadedPages.set(url.href, request);
  return request;
}

function replacePage(destination, page, main, restoring) {
  if (!restoring) {
    scrollPositions.set(renderedPath, window.scrollY);
    history.pushState(null, '', destination);
  }
  renderedPath = destination.pathname;
  pageLifecycle.abort();
  pageLifecycle = new AbortController();
  const nextMain = document.importNode(main, true);
  document.querySelector('main#main').replaceWith(nextMain);
  document.title = page.title;
  for (const selector of headSelectors) {
    const element = document.head.querySelector(selector);
    const next = page.head.querySelector(selector);
    if (element && next) element.replaceWith(document.importNode(next, true));
  }

  for (const selector of ['.header-inner .brand', '.site-footer-brand .brand', '.site-footer-bottom > small']) {
    const current = document.querySelector(selector);
    const next = page.querySelector(selector);
    if (current && next && !current.isEqualNode(next)) current.replaceWith(document.importNode(next, true));
  }

  for (const link of document.querySelectorAll('header nav a, footer nav a')) {
    if (link.pathname === renderedPath) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  setMenu(false);
  initializePage(pageLifecycle.signal);
  nextMain.tabIndex = -1;
  nextMain.focus({ preventScroll: true });
  window.scrollTo({ top: restoring ? scrollPositions.get(renderedPath) ?? 0 : 0, behavior: 'instant' });
  updateBackToTop();
}

async function visitPage(destination, restoring = false) {
  const version = ++navigationVersion;
  pageTransition?.skipTransition();
  try {
    const { page, main } = await requestPage(destination);
    if (version !== navigationVersion) return;

    const update = () => {
      if (version === navigationVersion) replacePage(destination, page, main, restoring);
    };
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pageTransition = document.startViewTransition(update);
      await pageTransition.updateCallbackDone;
    } else {
      update();
    }
  } catch {
    if (version !== navigationVersion) return;
    if (restoring) location.reload();
    else location.assign(destination);
  }
}

if (primaryRoutes.has(renderedPath) && !location.search) {
  function warmPage(event) {
    if (navigator.connection?.saveData) return;
    const destination = navigationDestination(event);
    if (destination) requestPage(destination).catch(() => {});
  }

  // Warm the most likely destinations one at a time, after the current page loads.
  function prefetchPrimaryPages() {
    const connection = navigator.connection;
    if (connection?.saveData || (connection?.effectiveType && connection.effectiveType !== '4g')) return;
    const queue = ['/journal/', '/shop/'].filter(path => path !== renderedPath).slice(0, 2);
    const whenIdle = callback => window.requestIdleCallback
      ? window.requestIdleCallback(callback, { timeout: 1500 })
      : window.setTimeout(callback, 750);
    function warmNext() {
      const path = queue.shift();
      if (!path) return;
      if (path === renderedPath || document.visibilityState !== 'visible') {
        whenIdle(warmNext);
        return;
      }
      requestPage(new URL(path, location.origin)).catch(() => {}).finally(() => whenIdle(warmNext));
    }
    whenIdle(warmNext);
  }
  if (document.readyState === 'complete') prefetchPrimaryPages();
  else window.addEventListener('load', prefetchPrimaryPages, { once: true });

  document.addEventListener('pointerover', warmPage);
  document.addEventListener('pointerdown', warmPage, { passive: true });
  document.addEventListener('focusin', warmPage);
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const destination = navigationDestination(event);
    if (!destination) return;
    event.preventDefault();
    visitPage(destination);
  });
  window.addEventListener('popstate', () => {
    ++navigationVersion;
    pageTransition?.skipTransition();
    const destination = new URL(location.href);
    if (destination.pathname === renderedPath && !destination.search) return;
    if (isPrimaryRoute(destination)) visitPage(destination, true);
    else location.reload();
  });
}
