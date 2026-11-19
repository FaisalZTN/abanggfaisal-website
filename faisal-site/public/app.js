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
const menu=document.querySelector('#menu'),nav=document.querySelector('#nav');menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open)});document.addEventListener('keydown',e=>{if(e.key==='Escape'){nav.classList.remove('open');menu.setAttribute('aria-expanded','false')}});const search=document.querySelector('#search'),category=document.querySelector('#category');if (search) {
  const results = document.querySelector('#results');
  const cards = [...results.querySelectorAll('.card')];
  const sort = document.querySelector('#study-sort');
  const catalogue = document.querySelector('#study-catalogue');
  const more = document.querySelector('#study-more');
  const step = Number(results.dataset.pageSize) || cards.length || 1;
  let limit = step;
  function filter() {
    const query = search.value.trim().toLocaleLowerCase('id');
    let count = 0;
    for (const card of cards) {
      const matches = (!category.value || card.dataset.category === category.value)
        && (card.dataset.search + ' ' + card.dataset.category).toLocaleLowerCase('id').includes(query);
      card.hidden = !matches || ++count > limit;
    }
    document.querySelector('#empty').hidden = count > 0;
    document.querySelector('#count').textContent = count > limit
      ? limit + ' dari ' + count + ' hasil' : count + ' hasil';
    if (more) more.hidden = count <= limit;
  }
  function reset() { limit = step; filter(); }
  function revealLinkedCard() {
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
    window.addEventListener('hashchange', revealLinkedCard);
    document.addEventListener('click', event => {
      const anchor = event.target.closest('a[href]');
      if (anchor && anchor.pathname === location.pathname && anchor.origin === location.origin
          && anchor.hash && anchor.hash === location.hash) revealLinkedCard();
    });
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
    window.addEventListener('hashchange', revealLinkedCard);
  }
  filter();
  if (more || sort) revealLinkedCard();
}
const agenda = document.querySelector('#jadwal-kuliah');
if (agenda) {
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
  const slots = new Map();
  for (const slot of agenda.querySelector('template').content.children) {
    const day = slot.dataset.day;
    if (!slots.has(day)) slots.set(day, []);
    slots.get(day).push(slot);
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

  let shownDay;
  function refreshAgenda(now = new Date()) {
    const { year, month, day, hour, minute } = Object.fromEntries(
      wita.formatToParts(now).map(({ type, value }) => [type, value]),
    );
    const key = `${year}-${month}-${day}`;
    const localTime = `${hour}:${minute}`;
    clockTime.dateTime = `${key}T${localTime}:00+08:00`;
    clockTime.textContent = localTime;

    if (key !== shownDay) {
      // UTC here represents calendar dates after converting the timestamp to WITA.
      const today = new Date(Date.UTC(+year, +month - 1, +day));
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(today.getUTCDate() + 1);
      showDay(panels[0], today);
      showDay(panels[1], tomorrow);
      shownDay = key;
    }

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
  window.addEventListener('pageshow', tickAgenda);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tickAgenda();
  });
}

// Compatibility for old bookmarks, with a strict allowlist.
const old=location.hash.slice(1);if(['home','journal','shop','about'].includes(old))location.replace(old==='home'?'/':'/'+old+'/');else if(/^(article|product)\/[a-z0-9-]+$/.test(old)){const [kind,id]=old.split('/');location.replace('/'+(kind==='article'?'journal':'shop')+'/'+id+'/')}
