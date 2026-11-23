(() => {
  const timeline = document.getElementById('review-timeline-content');
  const status = document.getElementById('review-calendar-status');
  if (!timeline?.dataset.url || !status) return;

  status.hidden = false;
  fetch(timeline.dataset.url, { cache: 'no-store' })
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
      const url = new URL(timeline.dataset.url, location.href);
      url.searchParams.set('timeline', 'full');
      retry.href = url.href;
      retry.textContent = 'Coba muat ulang Google Calendar';
      status.replaceChildren(retry);
    });
})();
