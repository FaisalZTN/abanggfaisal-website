export function mount(panel, signal) {
  const content = panel.querySelector('[data-private-notes-expires]');
  if (!content) return;
  const expires = Number(content.dataset.privateNotesExpires) * 1000;

  function removeContent() {
    content.replaceChildren();
    const link = document.createElement('a');
    link.href = '/workroom/private-notes/';
    link.textContent = 'Buka kembali Catatan Rahasia';
    content.append(link);
  }

  const timer = setTimeout(removeContent, Math.max(0, expires - Date.now()));
  document.addEventListener('visibilitychange', () => {
    if (Date.now() >= expires) removeContent();
  }, { signal });
  window.addEventListener('pagehide', removeContent, { signal });
  signal.addEventListener('abort', () => {
    clearTimeout(timer);
    removeContent();
  }, { once: true });
  let dirty = false;
  content.addEventListener('input', () => { dirty = true; }, { signal });
  content.addEventListener('submit', () => { dirty = false; }, { signal });
  window.addEventListener('beforeunload', event => {
    if (!dirty || Date.now() >= expires) return;
    event.preventDefault();
    event.returnValue = '';
  }, { signal });
  return () => dirty && Date.now() < expires;
}
