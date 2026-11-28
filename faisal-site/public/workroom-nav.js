(() => {
  const sidebar = document.querySelector('.workroom-nav');
  if (!sidebar) return;
  const more = sidebar.querySelector('.workroom-nav-more');
  const trigger = more.querySelector('summary');
  const dialog = more.querySelector('dialog');
  const mobile = matchMedia('(max-width: 600px)');
  trigger.addEventListener('click', event => {
    event.preventDefault();
    more.open = true;
    dialog.showModal();
  });
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    const backdrop = event.target === dialog && (event.clientX < bounds.left ||
      event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
    if (backdrop || event.target.closest('a[href]')) dialog.close();
  });
  dialog.addEventListener('close', () => { more.open = false; });
  mobile.addEventListener('change', () => { if (!mobile.matches && dialog.open) dialog.close(); });
  window.addEventListener('pagehide', () => { if (dialog.open) dialog.close(); });

  const wide = matchMedia('(min-width: 960px)');
  const collapse = sidebar.querySelector('.workroom-nav-collapse');
  const group = sidebar.querySelector('.workroom-nav-group');
  let preference;
  try { preference = localStorage.getItem('workroom-sidebar'); } catch {}
  const isCollapsed = () => preference === 'rail' || (preference !== 'expanded' && !wide.matches);
  function updateSidebar() {
    const collapsed = isCollapsed();
    document.body.dataset.sidebarMode = collapsed ? 'rail' : 'expanded';
    const label = collapsed ? 'Bentangkan sidebar' : 'Ciutkan sidebar';
    collapse.setAttribute('aria-label', label);
    collapse.setAttribute('title', label);
    collapse.setAttribute('aria-expanded', String(!collapsed));
  }
  function setCollapsed(collapsed) {
    preference = collapsed ? 'rail' : 'expanded';
    try { localStorage.setItem('workroom-sidebar', preference); } catch {}
    updateSidebar();
  }
  collapse.hidden = false;
  collapse.addEventListener('click', () => setCollapsed(!isCollapsed()));
  group.querySelector('summary').addEventListener('click', event => {
    if (!isCollapsed()) return;
    event.preventDefault();
    setCollapsed(false);
    group.open = true;
  });
  wide.addEventListener('change', updateSidebar);
  updateSidebar();
})();

(() => {
  const moduleSelector = 'script[type="application/workroom-module"][data-src]';
  const sidebar = document.querySelector('.workroom-nav');
  let panel = document.querySelector('main');
  if (!sidebar || !panel) return;

  const routes = new Map([
    ['/workroom/', 'home'],
    ['/workroom/today/', 'today'],
    ['/workroom/tasks/', 'task'],
    ['/workroom/projects/', 'project'],
    ['/workroom/goals/', 'goal'],
    ['/workroom/settings/', 'settings'],
    ['/workroom/drive/', 'drive'],
    ['/workroom/private-notes/', 'privateNotes'],
    ['/workroom/notes/', 'note'],
    ['/workroom/review/', 'review'],
  ]);
  let lifecycle = new AbortController();
  let preventLeaving;
  let pending;
  let shownUrl = new URL(location.href);

  async function loadModules(scope, signal) {
    const modules = [...scope.querySelectorAll(moduleSelector)];
    return Promise.all(modules.map(script => {
      const path = script.dataset.src;
      if (!/^\/workroom-(?:notes|review|quick-check|task-detail|link-options|image-upload|agenda-check|calendar|greeting|private-notes)(?:\.[a-f0-9]{12})?\.js$/.test(path)) {
        throw new Error('Invalid Workroom module');
      }
      return import(path);
    })).then(result => signal.aborted ? [] : result);
  }

  function mount(modules) {
    preventLeaving = undefined;
    for (const module of modules) {
      const guard = module.mount(panel, lifecycle.signal);
      if (guard) preventLeaving = guard;
    }
  }

  function markRoute(path, attribute) {
    const more = sidebar.querySelector('.workroom-nav-more');
    const marker = attribute === 'aria-current' ? 'data-active' : 'data-pending';
    let inMore = false;
    for (const link of sidebar.querySelectorAll('a[aria-label]:not([data-nav-action])')) {
      if (path && new URL(link.href).pathname === path) {
        link.setAttribute(attribute, attribute === 'aria-current' ? 'page' : '');
        if (link.closest('.workroom-nav-menu')) inMore = true;
      } else {
        link.removeAttribute(attribute);
      }
    }
    more.toggleAttribute(marker, inMore);
    if (attribute === 'aria-current') {
      const group = sidebar.querySelector('.workroom-nav-group');
      if (group.querySelector('[aria-current="page"]')) group.open = true;
    }
  }

  const status = document.createElement('p');
  status.className = 'workroom-route-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  sidebar.after(status);

  function clearPending() {
    pending?.abort();
    pending = undefined;
    status.hidden = true;
    panel.inert = false;
    panel.removeAttribute('aria-busy');
    markRoute(null, 'data-pending');
  }

  async function navigate(url, push) {
    clearPending();
    const request = new AbortController();
    pending = request;
    markRoute(url.pathname, 'data-pending');
    panel.inert = true;
    panel.setAttribute('aria-busy', 'true');
    const timer = setTimeout(() => {
      status.textContent = 'Memuat halaman…';
      status.hidden = false;
    }, 150);
    try {
      const response = await fetch(url, { signal: request.signal, cache: 'no-store' });
      if (!response.ok || response.redirected || !response.headers.get('Content-Type')?.startsWith('text/html')) {
        throw new Error('Workroom navigation failed');
      }
      const next = new DOMParser().parseFromString(await response.text(), 'text/html');
      const nextPanel = next.querySelector('main[data-workroom-panel]');
      const nextSidebar = next.querySelector('.workroom-nav');
      if (nextPanel?.dataset.workroomPanel !== routes.get(url.pathname) || !nextSidebar) {
        throw new Error('Workroom panel unavailable');
      }
      const modules = await loadModules(next, request.signal);
      if (request.signal.aborted) return;
      nextPanel.querySelectorAll('noscript').forEach(element => element.remove());
      const replacement = document.importNode(nextPanel, true);
      replacement.classList.add('workroom-panel-enter');
      if (push) {
        const opensTask = panel.dataset.workroomPanel === 'task' &&
          url.pathname === '/workroom/tasks/' && url.searchParams.has('edit') &&
          !shownUrl.searchParams.has('edit');
        if (opensTask) {
          const openDates = [...panel.querySelectorAll('.daily-task-card > details[open]')]
            .map(details => details.parentElement.id);
          history.replaceState({ ...history.state, taskListScroll: window.scrollY, openDates }, '');
        }
        history.pushState(opensTask ? { fromTaskList: true } : null, '', url);
      }
      shownUrl = url;
      markRoute(url.pathname, 'aria-current');
      lifecycle.abort();
      lifecycle = new AbortController();
      panel.replaceWith(replacement);
      panel = replacement;
      panel.dispatchEvent(new Event('workroom-panel-change', { bubbles: true }));
      mount(modules);
      document.title = next.title;
      panel.tabIndex = -1;
      panel.focus({ preventScroll: true });
      const target = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!push && Number.isFinite(history.state?.taskListScroll)) {
        const openDates = new Set(history.state.openDates);
        for (const details of panel.querySelectorAll('.daily-task-card > details')) {
          details.open = openDates.has(details.parentElement.id);
        }
        window.scrollTo(0, history.state.taskListScroll);
      } else if (target) target.scrollIntoView();
      else window.scrollTo(0, 0);
    } catch {
      if (!request.signal.aborted) {
        if (push && location.href !== url.href) location.assign(url);
        else location.replace(url);
      }
    } finally {
      clearTimeout(timer);
      if (pending === request) clearPending();
    }
  }

  function canLeave() {
    if (panel.querySelector('form[aria-busy="true"], [data-agenda-task][aria-busy="true"]')) return false;
    const guard = preventLeaving?.();
    if (guard === 'busy') return false;
    return !guard || window.confirm('Ada perubahan catatan yang belum disimpan. Tinggalkan halaman?');
  }

  loadModules(document, lifecycle.signal).then(modules => {
    mount(modules);
    if (!panel.dataset.workroomPanel) return;

    // Only Workroom GET links participate in the shared shell. Forms keep their native submission.
    document.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest('a[href]');
      if (!link || link.target || link.hasAttribute('download')) return;
      if (!sidebar.contains(link) && !panel.contains(link)) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || !routes.has(url.pathname) || (url.pathname === '/workroom/' && !url.search) ||
          (url.pathname === location.pathname && url.search === location.search && url.hash)) return;
      event.preventDefault();
      if (url.href === location.href) {
        if (pending) clearPending();
        return;
      }
      if (!canLeave()) return;
      if (link.hasAttribute('data-task-list-back') && history.state?.fromTaskList) {
        history.back();
        return;
      }
      void navigate(url, true);
    });

    window.addEventListener('popstate', () => {
      const url = new URL(location.href);
      if (!routes.has(url.pathname)) return;
      if (url.pathname === shownUrl.pathname && url.search === shownUrl.search) {
        shownUrl = url;
        return;
      }
      if (!canLeave()) {
        history.pushState(null, '', shownUrl);
        clearPending();
        return;
      }
      void navigate(url, false);
    });
  }).catch(error => console.error('Workroom modules unavailable', error));
})();
