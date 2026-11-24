export function mount(panel, signal) {
  const root = panel.querySelector('.calendar-agenda[data-day]');
  if (!root || root.hasAttribute('data-calendar-full')) return;

  const { today, google } = root.dataset;
  const configured = google === 'true';
  const grid = root.querySelector('.days');
  const [previous, next] = root.querySelectorAll('.calendar-heading a');
  const monthHeading = root.querySelector('.calendar-heading h2');
  const dayHeading = root.querySelector('.agenda-heading h2');
  const googleAgenda = root.querySelector('#calendar-google');
  const dueList = root.querySelector('.due-list');
  const empty = root.querySelector('.agenda-empty');
  const template = root.querySelector('#calendar-tasks');
  const tasks = [...dueList.children, ...template.content.children]
    .sort((a, b) => a.dataset.due.localeCompare(b.dataset.due));

  const dateLabel = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const months = new Map();
  const pending = new Map();
  const calendarPath = location.pathname;
  const dayLink = day => calendarPath + '?day=' + day + '#agenda';
  const toDate = day => new Date(day + 'T12:00:00Z');
  const iso = date => date.toISOString().slice(0, 10);
  const initialDay = root.dataset.day;
  const initialUrl = location.href;
  let selected = initialDay;
  let visibleMonth = selected.slice(0, 7);
  let revision = 0;

  function setLink(link, day) {
    link.dataset.calendarDate = day;
    link.href = dayLink(day);
  }

  function showMonth(day) {
    const month = day.slice(0, 7);
    if (month === visibleMonth) return;
    visibleMonth = month;
    const date = toDate(day);
    const year = date.getUTCFullYear();
    const index = date.getUTCMonth();
    const monthStart = offset => new Date(Date.UTC(year, index + offset, 1));
    monthHeading.textContent = monthLabel.format(date);
    setLink(previous, iso(monthStart(-1)));
    setLink(next, iso(monthStart(1)));
    const cells = document.createDocumentFragment();
    for (let i = 0; i < monthStart(0).getUTCDay(); i++) cells.append(document.createElement('span'));
    const count = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
    for (let i = 1; i <= count; i++) {
      const link = document.createElement('a');
      const value = month + '-' + String(i).padStart(2, '0');
      setLink(link, value);
      link.textContent = i;
      if (value === today) link.setAttribute('aria-current', 'date');
      cells.append(link);
    }
    grid.querySelectorAll(':scope > :not(small)').forEach(cell => cell.remove());
    grid.append(cells);
  }

  function updateDays(calendar) {
    const taskDates = new Set(tasks.filter(task => !task.hasAttribute('data-agenda-completed')).map(task => task.dataset.due));
    for (const link of grid.querySelectorAll('a')) {
      const day = link.dataset.calendarDate;
      const hasTask = taskDates.has(day);
      const hasEvent = calendar && Object.hasOwn(calendar.days, day);
      link.classList.toggle('selected', day === selected);
      link.classList.toggle('marked', hasTask || hasEvent);
      link.setAttribute('aria-label', day + (hasTask ? ', ada tugas' : '') + (hasEvent ? ', ada acara Google Calendar' : ''));
    }
  }

  function loadMonth(month) {
    if (!pending.has(month)) {
      const request = fetch(calendarPath + '?calendar-data=' + month + '-01', { cache: 'no-store' })
        .then(response => {
          if (!response.ok) throw new Error('Calendar request failed');
          return response.json();
        })
        .then(calendar => {
          if (calendar.status === 'connected' || calendar.status === 'disconnected') {
            months.set(month, { calendar, expires: Date.now() + 120000 });
            if (months.size > 6) months.delete(months.keys().next().value);
          }
          return calendar;
        })
        .finally(() => pending.delete(month));
      pending.set(month, request);
    }
    return pending.get(month);
  }

  function showGoogle(calendar) {
    googleAgenda.innerHTML = calendar.days[selected] ?? calendar.fallback;
    updateDays(calendar);
  }

  async function showDay(day) {
    const requestRevision = ++revision;
    selected = day;
    const month = day.slice(0, 7);
    showMonth(day);
    dayHeading.textContent = dateLabel.format(toDate(day));
    const due = tasks.filter(task => !task.hidden && (day === today ? task.dataset.due <= today : task.dataset.due === day));
    dueList.replaceChildren(...due);
    dueList.hidden = !due.length;
    empty.hidden = Boolean(due.length);

    const cached = months.get(month);
    if (cached?.expires > Date.now()) {
      showGoogle(cached.calendar);
      return;
    }
    months.delete(month);
    updateDays();
    if (!configured) return;
    googleAgenda.textContent = 'Memuat Google Calendar…';
    try {
      const calendar = await loadMonth(month);
      if (requestRevision === revision) showGoogle(calendar);
    } catch {
      if (requestRevision !== revision) return;
      const fallback = document.createElement('a');
      fallback.href = calendarPath + '?day=' + day + '&calendar=full#agenda';
      fallback.textContent = 'Coba muat ulang agenda Google';
      googleAgenda.replaceChildren(fallback);
    }
  }

  root.addEventListener('click', event => {
    const link = event.target.closest('a[data-calendar-date]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey ||
        event.ctrlKey || event.shiftKey || event.altKey) return;
    const day = link.dataset.calendarDate;
    if (!/^(19|20)\d{2}-\d{2}-\d{2}$/.test(day)) return;
    if (day !== selected) history.pushState(null, '', link.href);
    event.preventDefault();
    showDay(day);
  });

  window.addEventListener('popstate', () => {
    const day = location.href === initialUrl ? initialDay : new URLSearchParams(location.search).get('day') ?? today;
    if (location.pathname === calendarPath) showDay(day);
  }, { signal });

  root.addEventListener('agenda-task-change', () => updateDays(months.get(selected.slice(0, 7))?.calendar));
  showDay(selected);
}
