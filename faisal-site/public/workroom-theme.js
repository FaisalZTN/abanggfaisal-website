(() => {
  for (const [setting, values, attribute] of [
    ['workroom-theme', ['blue', 'midnight', 'light'], 'workroomTheme'],
    ['workroom-font', ['inter', 'mona', 'jakarta'], 'workroomFont'],
  ]) {
    let current = values[0];
    try {
      const saved = localStorage.getItem(setting);
      if (values.includes(saved)) current = saved;
    } catch {}
    document.documentElement.dataset[attribute] = current;

    function sync() {
      const choice = document.querySelector(`input[name="${setting}"][value="${current}"]`);
      if (choice) choice.checked = true;
    }

    document.addEventListener('DOMContentLoaded', sync);
    document.addEventListener('workroom-panel-change', sync);
    document.addEventListener('change', event => {
      const choice = event.target;
      if (!choice.matches(`input[name="${setting}"]`) || !values.includes(choice.value)) return;
      current = choice.value;
      document.documentElement.dataset[attribute] = current;
      try { localStorage.setItem(setting, current); } catch {}
    });
  }
})();
