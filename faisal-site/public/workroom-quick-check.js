(() => {
  const grid = document.querySelector('.daily-task-grid');
  if (!grid) return;
  const feedback = document.querySelector('.quick-check-feedback');
  const filter = new URLSearchParams(location.search).get('status');

  grid.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.matches('[data-quick-check]')) return;
    event.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;

    const button = form.querySelector('[role="checkbox"]');
    const row = form.closest('li');
    const card = row.closest('.daily-task-card');
    const progress = card.querySelector('.daily-task-progress');
    const input = form.elements.namedItem('status');
    const next = input.value;
    const previous = button.getAttribute('aria-checked') === 'true';
    const data = new FormData(form);
    data.set('action', 'status');

    function display(done) {
      const wasDone = button.getAttribute('aria-checked') === 'true';
      const completed = Number(progress.dataset.completed) + Number(done) - Number(wasDone);
      progress.dataset.completed = completed;
      progress.textContent = completed + '/' + progress.dataset.total;
      progress.setAttribute('aria-label', completed + ' dari ' + progress.dataset.total + ' selesai');
      button.setAttribute('aria-checked', String(done));
      button.setAttribute('aria-label', (done ? 'Buka kembali: ' : 'Tandai selesai: ') + button.dataset.title);
      row.classList.toggle('is-done', done);
    }

    form.setAttribute('aria-busy', 'true');
    button.setAttribute('aria-disabled', 'true');
    feedback.hidden = true;
    display(next === 'done');
    try {
      const response = await fetch(form.action, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      if (!response.ok || (await response.json()).status !== next) throw new Error('Status belum tersimpan');
      input.value = next === 'done' ? 'active' : 'done';
      if (filter && filter !== next) {
        const nextButton = row.nextElementSibling?.querySelector('button') ||
          row.previousElementSibling?.querySelector('button') || card.querySelector('summary');
        if (document.activeElement === button) nextButton.focus();
        row.remove();
        const total = Number(progress.dataset.total) - 1;
        const completed = Number(progress.dataset.completed) - Number(next === 'done');
        progress.dataset.total = total;
        progress.dataset.completed = completed;
        progress.textContent = completed + '/' + total;
        progress.setAttribute('aria-label', completed + ' dari ' + total + ' selesai');
        if (!total) {
          const empty = document.createElement('p');
          empty.textContent = 'Tidak ada tugas dengan status ini.';
          card.querySelector('ul').replaceWith(empty);
        }
      }
    } catch {
      display(previous);
      feedback.hidden = false;
      feedback.textContent = 'Status belum tersimpan. Coba centang lagi.';
    } finally {
      form.removeAttribute('aria-busy');
      button.removeAttribute('aria-disabled');
    }
  });
})();
