(() => {
  const more = document.querySelector('.workroom-nav-more');
  if (!more) return;
  const summary = more.querySelector('summary');
  document.addEventListener('click', event => {
    if (more.open && (!more.contains(event.target) || event.target.closest('a[href]'))) more.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !more.open) return;
    const restoreFocus = more.contains(document.activeElement);
    more.open = false;
    if (restoreFocus) summary.focus();
  });
  window.addEventListener('pagehide', () => { more.open = false; });
})();
