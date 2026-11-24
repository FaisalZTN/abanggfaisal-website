(() => {
  const main = document.querySelector('main');
  if (!main) return;

  function updateRow(row, complete) {
    const previousButton = row.querySelector(complete ? '[value="complete"]' : '[data-agenda-undo]');
    const nextButton = row.querySelector(complete ? '[data-agenda-undo]' : '[value="complete"]');
    const restoreFocus = document.activeElement === previousButton;
    row.toggleAttribute('data-agenda-completed', complete);
    row.querySelector('[value="complete"]').hidden = complete;
    row.querySelector('[data-agenda-undo]').hidden = !complete;
    if (restoreFocus) nextButton.focus({ preventScroll: true });
  }

  async function change(row, complete) {
    if (row.hasAttribute('aria-busy')) return;
    row.setAttribute('aria-busy', 'true');
    const feedback = row.querySelector('[data-agenda-feedback]');
    const form = row.querySelector('form');
    const original = row.dataset.status;
    const status = complete ? 'done' : original;
    const data = new URLSearchParams({
      id: new FormData(form).get('id'), kind: 'task', action: 'status', status, expected: complete ? original : 'done',
    });
    updateRow(row, complete);
    feedback.textContent = 'Menyimpan…';
    try {
      const response = await fetch('/workroom/tasks/', {
        method: 'POST', body: data, headers: { Accept: 'application/json' },
      });
      if (response.status === 409) throw new Error('Status tugas telah berubah. Muat ulang halaman.');
      if (!response.ok || (await response.json()).status !== status) throw new Error();
      feedback.textContent = complete ? 'Tugas selesai.' : 'Tugas dibuka kembali.';
      row.dispatchEvent(new Event('agenda-task-change', { bubbles: true }));
    } catch (error) {
      updateRow(row, !complete);
      feedback.textContent = error.message || 'Perubahan belum tersimpan. Coba lagi.';
    } finally {
      row.removeAttribute('aria-busy');
    }
  }

  main.addEventListener('submit', event => {
    const row = event.target.closest('[data-agenda-task]');
    if (!row || !['active', 'doing'].includes(row.dataset.status)) return;
    event.preventDefault();
    change(row, true);
  });
  main.addEventListener('click', event => {
    const button = event.target.closest('[data-agenda-undo]');
    if (button) change(button.closest('[data-agenda-task]'), false);
  });
})();
