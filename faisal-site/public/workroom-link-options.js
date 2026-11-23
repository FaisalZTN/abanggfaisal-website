(() => {
  const menu = document.createElement('div');
  menu.className = 'workroom-link-options';
  menu.hidden = true;
  menu.setAttribute('aria-label', 'Opsi link');
  menu.setAttribute('role', 'group');
  menu.contentEditable = 'false';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 4H6a2 2 0 0 0-2 2v10"/></svg>Salin';
  copy.setAttribute('aria-label', 'Salin link');
  const open = document.createElement('a');
  open.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>Buka';
  open.setAttribute('aria-label', 'Buka link di tab baru');
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  menu.append(copy, open, status);
  document.body.append(menu);

  const allowed = '#edit-body a[href], .task-detail-preview a[href]';
  const eligible = link => link?.matches(allowed) && /^https?:$/.test(link.protocol);
  let active, trigger, timer, hoverTimer;
  function hide() {
    clearTimeout(timer);
    clearTimeout(hoverTimer);
    trigger?.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
    active = trigger = null;
  }
  function show(link, button = null) {
    if (!eligible(link)) return;
    if (active !== link) hide();
    clearTimeout(timer);
    active = link;
    trigger = button || trigger;
    trigger?.setAttribute('aria-expanded', 'true');
    open.href = link.href;
    status.textContent = '';
    menu.hidden = false;
    const rect = link.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = (rect.bottom + menu.offsetHeight + 8 <= innerHeight
      ? rect.bottom : Math.max(8, rect.top - menu.offsetHeight)) + 'px';
  }

  const scheduleHide = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!menu.matches(':hover') && !menu.contains(document.activeElement)) hide();
    }, 220);
  };
  const hrefAt = target => target.closest?.(allowed);
  document.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse' || menu.contains(event.target)) return;
    const link = hrefAt(event.target);
    if (!eligible(link) || link.contains(event.relatedTarget)) return;
    clearTimeout(hoverTimer);
    if (active !== link) hoverTimer = setTimeout(() => show(link), 180);
    else clearTimeout(timer);
  });
  document.addEventListener('pointerout', event => {
    const link = hrefAt(event.target);
    if (link && !link.contains(event.relatedTarget)) clearTimeout(hoverTimer);
    if (menu.contains(event.relatedTarget)) return;
    if (menu.contains(event.target) || active?.contains(event.target)) scheduleHide();
  });
  menu.addEventListener('pointerenter', () => clearTimeout(timer));
  document.addEventListener('contextmenu', event => {
    const link = hrefAt(event.target);
    if (eligible(link)) {
      event.preventDefault();
      show(link);
    }
  });
  document.addEventListener('click', event => {
    if (menu.contains(event.target)) return;
    const button = event.target.closest?.('.task-detail-preview [data-link-options]');
    if (button) {
      if (trigger === button) hide();
      else {
        show(button.parentElement.querySelector('a[href]'), button);
        copy.focus();
      }
      return;
    }
    const link = hrefAt(event.target);
    if (eligible(link) && link.closest('#edit-body')) {
      event.preventDefault();
      show(link);
      return;
    }
    hide();
  });
  document.addEventListener('keydown', event => {
    const link = hrefAt(event.target);
    if (event.altKey && event.key === 'ArrowDown' && eligible(link)) {
      event.preventDefault();
      show(link);
      copy.focus();
    }
    if (event.key === 'Escape' && active) {
      if (menu.contains(document.activeElement)) (trigger || active).focus();
      hide();
    }
  });
  window.addEventListener('scroll', hide, { capture: true, passive: true });
  window.addEventListener('resize', hide);
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(open.href);
      status.textContent = 'Link disalin.';
    } catch {
      status.textContent = 'Link belum bisa disalin.';
    }
  };
})();
