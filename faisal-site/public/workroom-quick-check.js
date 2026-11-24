export function mount(panel, signal) {
  const workspace = panel.querySelector('#workspace');
  const select = workspace?.querySelector('[data-task-filter] select');
  if (!select) return;

  function applyFilter() {
    const status = select.value;
    let totalVisible = 0;
    for (const row of workspace.querySelectorAll('[data-task-status]')) {
      row.hidden = Boolean(status && row.dataset.taskStatus !== status);
      if (!row.hidden) totalVisible++;
    }
    for (const column of workspace.querySelectorAll('[data-status-column]')) {
      column.hidden = Boolean(status && column.dataset.statusColumn !== status);
    }
    for (const card of workspace.querySelectorAll('.daily-task-card')) {
      const visible = [...card.querySelectorAll('[data-task-status]:not([hidden])')];
      const completed = visible.filter(row => row.dataset.taskStatus === 'done').length;
      const progress = card.querySelector('.daily-task-progress');
      progress.dataset.completed = completed;
      progress.dataset.total = visible.length;
      progress.textContent = completed + '/' + visible.length;
      progress.setAttribute('aria-label', completed + ' dari ' + visible.length + ' selesai');
      card.hidden = !visible.length && !card.querySelector('.daily-task-today');
      const empty = card.querySelector('[data-daily-empty]');
      empty.hidden = Boolean(visible.length);
      empty.textContent = status ? 'Tidak ada tugas dengan status ini.' : 'Belum ada tugas untuk hari ini.';
    }
    const empty = workspace.querySelector('[data-table-empty]');
    if (empty) empty.hidden = Boolean(totalVisible);
    for (const input of workspace.querySelectorAll('input[name="filter"]')) input.value = status;
    for (const link of workspace.querySelectorAll('.workspace-tools a, .daily-task-add, a[href*="?edit="]')) {
      const url = new URL(link.href, location.href);
      if (status) url.searchParams.set('status', status);
      else url.searchParams.delete('status');
      link.href = url.href;
    }
  }

  select.addEventListener('change', () => {
    const url = new URL(location.href);
    if (select.value) url.searchParams.set('status', select.value);
    else url.searchParams.delete('status');
    history.replaceState(history.state, '', url);
    applyFilter();
  });

  const grid = workspace.querySelector('.daily-task-grid');
  if (!grid) return;
  const feedback = workspace.querySelector('.quick-check-feedback');

  grid.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.matches('[data-quick-check]')) return;
    event.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;

    const button = form.querySelector('[role="checkbox"]');
    const row = form.closest('li');
    const input = form.elements.namedItem('status');
    const next = input.value;
    const previous = row.dataset.taskStatus;
    const data = new FormData(form);
    data.set('action', 'status');

    function display(status) {
      const done = status === 'done';
      button.setAttribute('aria-checked', String(done));
      button.setAttribute('aria-label', (done ? 'Buka kembali: ' : 'Tandai selesai: ') + button.dataset.title);
      row.classList.toggle('is-done', done);
    }

    form.setAttribute('aria-busy', 'true');
    button.setAttribute('aria-disabled', 'true');
    feedback.hidden = true;
    display(next);
    if (!select.value) { row.dataset.taskStatus = next; applyFilter(); }
    try {
      const response = await fetch(form.getAttribute('action'), { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      if (!response.ok || (await response.json()).status !== next) throw new Error('Status belum tersimpan');
      input.value = next === 'done' ? 'active' : 'done';
      row.dataset.taskStatus = next;
      const doing = row.querySelector('[data-task-doing]');
      if (doing) doing.hidden = next !== 'doing';
      if (select.value && select.value !== next && document.activeElement === button) select.focus();
      applyFilter();
    } catch {
      row.dataset.taskStatus = previous;
      display(previous);
      applyFilter();
      feedback.hidden = false;
      feedback.textContent = 'Status belum tersimpan. Coba centang lagi.';
    } finally {
      form.removeAttribute('aria-busy');
      button.removeAttribute('aria-disabled');
    }
  });
}
