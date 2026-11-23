(() => {
  const content = document.querySelector('[data-private-notes-expires]');
  if (!content) return;
  const expires = Number(content.dataset.privateNotesExpires) * 1000;

  function removeContent() {
    content.replaceChildren();
    const link = document.createElement('a');
    link.href = '/workroom/private-notes/';
    link.textContent = 'Buka kembali Catatan Rahasia';
    content.append(link);
  }

  setTimeout(removeContent, Math.max(0, expires - Date.now()));
  document.addEventListener('visibilitychange', () => {
    if (Date.now() >= expires) removeContent();
  });
  window.addEventListener('pagehide', removeContent);
})();
