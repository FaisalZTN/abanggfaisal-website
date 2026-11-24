(() => {
  const storageKey = 'workroom-theme';
  const themes = ['blue', 'midnight', 'light'];
  let current = 'blue';
  try {
    const saved = localStorage.getItem(storageKey);
    if (themes.includes(saved)) current = saved;
  } catch {}
  document.documentElement.dataset.workroomTheme = current;

  function sync() {
    const choice = document.querySelector(`input[name="workroom-theme"][value="${current}"]`);
    if (choice) choice.checked = true;
  }

  document.addEventListener('DOMContentLoaded', sync);
  document.addEventListener('workroom-panel-change', sync);
  document.addEventListener('change', event => {
    const choice = event.target;
    if (!choice.matches('input[name="workroom-theme"]') || !themes.includes(choice.value)) return;
    current = choice.value;
    document.documentElement.dataset.workroomTheme = current;
    try { localStorage.setItem(storageKey, current); } catch {}
  });
})();
