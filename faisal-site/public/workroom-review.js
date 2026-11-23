(() => {
  const deferred = document.querySelector('[data-workroom-deferred]');
  const timeline = deferred?.querySelector('[data-deferred-content]') ?? document.getElementById('review-timeline-content');
  const dataUrl = deferred?.dataset.url ?? timeline?.dataset.url;
  const status = deferred?.querySelector('[data-deferred-status]') ?? document.getElementById('review-calendar-status');
  if (!dataUrl || !status) return;

  status.hidden = false;
  fetch(dataUrl, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('Review request failed');
      return response.json();
    })
    .then(data => {
      timeline.innerHTML = data.html;
      status.hidden = true;
    })
    .catch(() => {
      const retry = document.createElement('a');
      const url = new URL(dataUrl, location.href);
      url.searchParams.set('timeline', 'full');
      retry.href = deferred?.dataset.retry ?? url.href;
      retry.textContent = 'Coba muat ulang Google Calendar';
      status.replaceChildren(retry);
    });
})();
