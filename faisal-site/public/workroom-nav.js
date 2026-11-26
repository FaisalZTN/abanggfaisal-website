(() => {
  const more = document.querySelector('.workroom-nav-more');
  if (!more) return;
  const summary = more.querySelector('summary');
  document.addEventListener('click', event => {
    if (more.open && (!more.contains(event.target) || event.target.closest('a[href]'))) more.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !more.open) return;
    const restoreFocus = more.contains(document.activeElement);
    more.open = false;
    if (restoreFocus) summary.focus();
  });
  window.addEventListener('pagehide', () => { more.open = false; });
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

  function selectRoute(path) {
    if (routes.get(path) === 'privateNotes') path = '/workroom/notes/';
    if (routes.get(path) === 'project') path = '/workroom/tasks/';
    const more = sidebar.querySelector('.workroom-nav-more');
    more?.removeAttribute('data-active');
    for (const link of sidebar.querySelectorAll('a[aria-label]')) {
      if (new URL(link.href).pathname === path) {
        link.setAttribute('aria-current', 'page');
        if (more && link.closest('.workroom-nav-menu')) more.setAttribute('data-active', '');
      } else {
        link.removeAttribute('aria-current');
      }
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
    selectRoute(shownUrl.pathname);
  }

  async function navigate(url, push) {
    clearPending();
    const request = new AbortController();
    pending = request;
    selectRoute(url.pathname);
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
      if (push) history.pushState(null, '', url);
      shownUrl = url;
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
      if (target) target.scrollIntoView();
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
      if (canLeave()) void navigate(url, true);
    });

    window.addEventListener('popstate', () => {
      const url = new URL(location.href);
      if (!routes.has(url.pathname)) return;
      if (!canLeave()) {
        history.pushState(null, '', shownUrl);
        clearPending();
        return;
      }
      void navigate(url, false);
    });
  }).catch(error => console.error('Workroom modules unavailable', error));
})();
