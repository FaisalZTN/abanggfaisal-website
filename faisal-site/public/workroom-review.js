export function mount(panel, signal) {
  const deferred = panel.querySelector('[data-workroom-deferred]');
  const timeline = deferred?.querySelector('[data-deferred-content]') ?? panel.querySelector('#review-timeline-content');
  const dataUrl = deferred?.dataset.url ?? timeline?.dataset.url;
  const status = deferred?.querySelector('[data-deferred-status]') ?? panel.querySelector('#review-calendar-status');
  if (!dataUrl || !status) return;

  function load() {
    status.hidden = false;
    fetch(dataUrl, { cache: 'no-store', signal })
      .then(response => {
        if (!response.ok) throw new Error('Review request failed');
        return response.json();
      })
      .then(data => {
        timeline.innerHTML = data.html;
        status.hidden = true;
      })
      .catch(() => {
        if (signal.aborted) return;
        const retry = document.createElement('a');
        const url = new URL(dataUrl, location.href);
        url.searchParams.set('timeline', 'full');
        retry.href = deferred?.dataset.retry ?? url.href;
        retry.textContent = 'Coba muat ulang Google Calendar';
        status.replaceChildren(retry);
      });
  }

  if (deferred?.hasAttribute('data-lazy') && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      load();
    }, { rootMargin: '200px' });
    observer.observe(deferred);
    signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  } else {
    load();
  }
}
