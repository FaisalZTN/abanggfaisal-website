export function mount(panel, signal) {
  const greeting = panel.querySelector('[data-workroom-greeting]');
  if (!greeting) return;
  const witaClock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Makassar', hourCycle: 'h23',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  let timer;

  function updateGreeting() {
    clearTimeout(timer);
    const now = new Date();
    const [hour, minute, second] = witaClock.format(now).split(':').map(Number);
    const period = hour < 6 || hour >= 18 ? 'night' : hour < 12 ? 'morning' : 'afternoon';
    const text = greeting.dataset[period];
    if (greeting.textContent !== text) greeting.textContent = text;
    const nextHour = hour < 6 ? 6 : hour < 12 ? 12 : hour < 18 ? 18 : 30;
    const delay = ((nextHour - hour) * 3600 - minute * 60 - second) * 1000 - now.getMilliseconds();
    timer = setTimeout(updateGreeting, delay);
  }

  updateGreeting();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateGreeting();
  }, { signal });
  window.addEventListener('pageshow', updateGreeting, { signal });
  signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
}
