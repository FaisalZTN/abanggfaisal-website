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
      const rows = [...card.querySelectorAll('[data-task-status]')];
      const completed = rows.filter(row => row.dataset.taskStatus === 'done').length;
      const progress = card.querySelector('.daily-task-progress');
      progress.dataset.completed = completed;
      progress.dataset.total = rows.length;
      progress.textContent = completed + '/' + rows.length;
      progress.setAttribute('aria-label', completed + ' dari ' + rows.length + ' selesai');
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
  }, { signal });

  workspace.addEventListener('agenda-task-change', event => {
    const row = event.target;
    if (select.value && select.value !== row.dataset.taskStatus && row.contains(document.activeElement)) select.focus();
    applyFilter();
  }, { signal });
}
