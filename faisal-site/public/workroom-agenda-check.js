export function mount(panel, signal) {
  panel.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.matches('[data-task-toggle]')) return;
    event.preventDefault();
    if (form.hasAttribute('aria-busy')) return;

    const row = form.closest('li');
    const button = form.querySelector('[role="checkbox"]');
    const feedback = row.querySelector('[data-task-feedback]') ?? panel.querySelector('[data-task-feedback]');
    const original = form.elements.expected.value;
    const requested = form.elements.status.value;
    const data = new FormData(form);
    data.set('action', 'status');
    form.setAttribute('aria-busy', 'true');
    button.setAttribute('aria-disabled', 'true');
    feedback.textContent = 'Menyimpan…';
    try {
      const response = await fetch(form.getAttribute('action'), { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Perubahan belum tersimpan. Coba lagi.');
      const status = result.status;
      const complete = status === 'done';
      if (requested === 'reopen' ? !['active', 'doing'].includes(status) : !complete) throw new Error();
      if (signal.aborted) return;
      form.elements.expected.value = status;
      form.elements.status.value = complete ? 'reopen' : 'done';
      button.setAttribute('aria-checked', String(complete));
      button.setAttribute('aria-label', (complete ? 'Buka kembali: ' : 'Tandai selesai: ') + button.dataset.title);
      row.classList.toggle('is-done', complete);
      if (row.hasAttribute('data-agenda-task')) {
        row.dataset.status = status;
        row.toggleAttribute('data-agenda-completed', complete);
        row.toggleAttribute('data-completed-today', complete);
        row.querySelector('[data-task-overdue]').hidden = complete || row.dataset.due >= row.dataset.taskToday;
      }
      if (row.hasAttribute('data-task-status')) row.dataset.taskStatus = status;
      row.querySelector('[data-task-doing]').hidden = status !== 'doing';
      feedback.textContent = complete ? 'Tugas selesai.' : 'Tugas dibuka kembali.';
      const count = panel.querySelector('[data-overview-open-count]');
      if (count && original !== status) count.textContent = Math.max(0, Number(count.textContent) + (complete ? -1 : 1));
      (row.isConnected ? row : panel).dispatchEvent(new Event('agenda-task-change', { bubbles: true }));
    } catch (error) {
      if (!signal.aborted) feedback.textContent = error.message || 'Perubahan belum tersimpan. Coba lagi.';
    } finally {
      form.removeAttribute('aria-busy');
      button.removeAttribute('aria-disabled');
    }
  }, { signal });
}
