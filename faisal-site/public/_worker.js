const WORKROOM = '/workroom/';
const workroomKinds = {
  task: { title: 'Tugas', statuses: { active: 'Belum mulai', doing: 'Dikerjakan', done: 'Selesai' } },
  project: { title: 'Proyek', statuses: { active: 'Aktif', done: 'Selesai' } },
  note: { title: 'Catatan', statuses: { active: 'Tersimpan' } },
  goal: { title: 'Goals', statuses: { active: 'Sedang berjalan', done: 'Tercapai' } },
};
const workroomPages = {
  home: { path: WORKROOM, title: 'Ringkasan', icon: 'M3 10l9-7 9 7v10H3z M9 20v-7h6v7' },
  task: { path: WORKROOM + 'tasks/', title: 'Tugas', icon: 'M20 12v8H4V4h12 M8 11l4 4 9-10' },
  note: { path: WORKROOM + 'notes/', title: 'Catatan', icon: 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6' },
  project: { path: WORKROOM + 'projects/', title: 'Proyek', icon: 'M3 6h7l2 3h9v11H3z' },
  goal: { path: WORKROOM + 'goals/', title: 'Goals', icon: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0z M12 12h.01' },
};
const privateHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src https:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function escapeWorkroom(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function workroomPage(content, status = 200, page = null) {
  const sidebar = page ? `<nav class="workroom-nav" aria-label="Navigasi Workroom">
    ${Object.entries(workroomPages).map(([key, {path, title, icon}]) =>
      `<a href="${path}" aria-label="${title}"${page === key ? ' aria-current="page"' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icon}"/></svg>
        <span aria-hidden="true">${title}</span>
      </a>`).join('')}
  </nav>` : '';
  return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${page && page !== 'home' ? workroomPages[page].title + ' · ' : ''}Workroom · abangfaisal</title><link rel="stylesheet" href="/workroom.css"></head>
    <body${page ? ' class="workroom-layout"' : ''}>${sidebar}
    <header><a href="/">abangfaisal.</a><a href="/ruang-belajar/">Ruang Belajar</a></header>
    <main>${content}</main></body></html>`, { status, headers: privateHeaders });
}

function decodeAccessPart(part) {
  return Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), letter => letter.charCodeAt(0));
}

async function isWorkroomOwner(request, env) {
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion || assertion.length > 8192) return false;
  try {
    const [header, payload, signature, extra] = assertion.split('.');
    if (!signature || extra !== undefined) return false;
    const decode = part => JSON.parse(new TextDecoder().decode(decodeAccessPart(part)));
    const { alg, kid } = decode(header);
    const claims = decode(payload);
    const now = Date.now() / 1000;
    if (alg !== 'RS256' || !kid || claims.iss !== env.WORKROOM_ACCESS_ISSUER ||
        !Array.isArray(claims.aud) || !claims.aud.includes(env.WORKROOM_ACCESS_AUD) ||
        !Number.isFinite(claims.exp) || claims.exp <= now ||
        (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now)) ||
        typeof claims.email !== 'string' || claims.email.toLowerCase() !== env.WORKROOM_OWNER_EMAIL.trim().toLowerCase()) return false;

    const response = await fetch(env.WORKROOM_ACCESS_ISSUER + '/cdn-cgi/access/certs');
    if (!response.ok) return false;
    const { keys } = await response.json();
    const jwk = keys.find(key => key.kid === kid && key.kty === 'RSA');
    if (!jwk) return false;
    const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    const key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
    return await crypto.subtle.verify(algorithm, key, decodeAccessPart(signature),
      new TextEncoder().encode(header + '.' + payload));
  } catch {
    return false;
  }
}

function workroomForm(kind, entry, projects, standalone = false) {
  const e = escapeWorkroom;
  const fields = workroomKinds[kind];
  const statuses = Object.entries(fields.statuses).map(([key, label]) =>
    `<option value="${key}"${entry?.status === key ? ' selected' : ''}>${label}</option>`).join('');
  const projectOptions = projects.map(project =>
    `<option value="${project.id}"${entry?.project_id === project.id ? ' selected' : ''}>${e(project.title)}</option>`).join('');
  return `<form method="post" action="${workroomPages[kind].path}">
    <input type="hidden" name="kind" value="${kind}">
    <input type="hidden" name="id" value="${entry?.id ?? ''}">
    <label>Judul<input name="title" required maxlength="160" value="${e(entry?.title)}"></label>
    <label>${kind === 'note' ? 'Isi catatan' : 'Detail'}<textarea name="body" rows="${standalone ? 12 : 3}" maxlength="10000">${e(entry?.body)}</textarea></label>
    <div class="fields">
    ${kind !== 'note' ? `<label>Status<select name="status">${statuses}</select></label>
      <label>Tenggat<input type="date" name="due" value="${e(entry?.due)}"></label>` : ''}
    ${kind === 'task' ? `<label>Prioritas<select name="priority">${[['normal', 'Normal'], ['high', 'Tinggi']].map(([value, label]) =>
      `<option value="${value}"${entry?.priority === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>` : ''}
    ${kind !== 'project' ? `<label>Proyek<select name="project_id"><option value="">Tanpa proyek</option>${projectOptions}</select></label>` : ''}
    </div>
    <button name="action" value="save">${entry ? 'Simpan perubahan' : 'Tambah'}</button>
    ${entry ? '<details><summary>Hapus entri</summary><button name="action" value="delete" formnovalidate>Konfirmasi hapus</button></details>' : ''}
  </form>`;
}

const googleScope = 'https://www.googleapis.com/auth/calendar.events.readonly';
const googleStateCookie = '__Host-workroom-google-state';
const workroomTimeZone = 'Asia/Makassar';
const workroomDay = new Intl.DateTimeFormat('en-CA', { timeZone: workroomTimeZone });
const workroomTime = new Intl.DateTimeFormat('id-ID', { timeZone: workroomTimeZone, hour: '2-digit', minute: '2-digit' });
const googleConfigured = env => Boolean(env.WORKROOM_GOOGLE_CLIENT_ID && env.WORKROOM_GOOGLE_CLIENT_SECRET);

function googleRedirect(url, target, cookie) {
  const headers = new Headers(privateHeaders);
  headers.set('Location', new URL(target, url).href);
  if (cookie) headers.set('Set-Cookie', googleStateCookie + '=' + cookie + '; Path=/; Secure; HttpOnly; SameSite=Lax');
  return new Response(null, { status: 303, headers });
}

async function googleToken(env, fields) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.WORKROOM_GOOGLE_CLIENT_ID,
      client_secret: env.WORKROOM_GOOGLE_CLIENT_SECRET,
      ...fields,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Google authentication failed');
  return response.json();
}

async function googleCalendarConnection(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS workroom_google_calendar (id INTEGER PRIMARY KEY CHECK (id = 1), refresh_token TEXT NOT NULL)').run();
  return db.prepare('SELECT refresh_token FROM workroom_google_calendar WHERE id = 1').first();
}

async function connectGoogleCalendar(request, env, url) {
  if (!googleConfigured(env)) return googleRedirect(url, WORKROOM);
  const redirectUri = url.origin + WORKROOM + 'google-calendar/';
  if (url.searchParams.get('google') === 'connect') {
    const state = crypto.randomUUID();
    const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorize.search = new URLSearchParams({
      client_id: env.WORKROOM_GOOGLE_CLIENT_ID, redirect_uri: redirectUri,
      response_type: 'code', scope: googleScope, access_type: 'offline',
      prompt: 'consent select_account', state,
    });
    return googleRedirect(url, authorize.href, state + '; Max-Age=600');
  }

  const state = request.headers.get('Cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(googleStateCookie + '='))?.slice(googleStateCookie.length + 1);
  const code = url.searchParams.get('code');
  const result = status => googleRedirect(url, WORKROOM + '?google=' + status + '#agenda', '; Max-Age=0');
  if (!state || state !== url.searchParams.get('state')) return result('error');
  if (!code) return result('error');

  try {
    const token = await googleToken(env, { grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    if (!token.refresh_token || !token.scope?.split(' ').includes(googleScope)) return result('error');
    await googleCalendarConnection(env.WORKROOM_DB);
    await env.WORKROOM_DB.prepare('INSERT INTO workroom_google_calendar (id, refresh_token) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET refresh_token = excluded.refresh_token').bind(token.refresh_token).run();
    return result('connected');
  } catch {
    return result('error');
  }
}

async function googleCalendarEvents(id, accessToken, query, signal) {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events`);
  url.search = query;
  const events = [];
  do {
    const response = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken }, signal });
    if (!response.ok) throw new Error('Google Calendar request failed');
    const page = await response.json();
    events.push(...(page.items ?? []));
    if (!page.nextPageToken) return events;
    url.searchParams.set('pageToken', page.nextPageToken);
  } while (true);
}

async function googleMonth(env, day) {
  const entries = new Map();
  if (!googleConfigured(env)) return { entries, status: 'disabled' };
  try {
    const connection = await googleCalendarConnection(env.WORKROOM_DB);
    if (!connection) return { entries, status: 'disconnected' };
    const token = await googleToken(env, { grant_type: 'refresh_token', refresh_token: connection.refresh_token });
    const first = day.slice(0, 7) + '-01';
    const from = new Date(first + 'T00:00:00+08:00');
    const next = new Date(first + 'T12:00:00Z');
    next.setUTCMonth(next.getUTCMonth() + 1);
    const end = new Date(next.toISOString().slice(0, 10) + 'T00:00:00+08:00');
    const query = new URLSearchParams({
      timeMin: from.toISOString(), timeMax: end.toISOString(), timeZone: workroomTimeZone,
      singleEvents: 'true', orderBy: 'startTime', maxResults: '2500',
      fields: 'nextPageToken,items(summary,start,end)',
    });
    const signal = AbortSignal.timeout(5000);
    const extraIds = (env.WORKROOM_GOOGLE_CALENDAR_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean);
    const ids = [...new Set(['primary', ...extraIds])];
    const calendars = await Promise.allSettled(ids.map(id =>
      googleCalendarEvents(id, token.access_token, query, signal)));
    if (calendars.every(calendar => calendar.status === 'rejected')) throw new Error('No Google Calendar could be loaded');
    for (const calendar of calendars) {
      if (calendar.status !== 'fulfilled') continue;
      for (const event of calendar.value) {
        const allDay = Boolean(event.start?.date);
        const start = new Date(allDay ? event.start.date + 'T00:00:00+08:00' : event.start?.dateTime);
        const finish = new Date(allDay ? event.end?.date + 'T00:00:00+08:00' : event.end?.dateTime);
        if (!Number.isFinite(+start) || !Number.isFinite(+finish)) continue;
        const startDay = workroomDay.format(start);
        for (let date = +from; date < +end; date += 86400000) {
          if (+start >= date + 86400000 || +finish <= date) continue;
          const key = workroomDay.format(new Date(date));
          const list = entries.get(key) ?? [];
          list.push({
            start: +start,
            title: event.summary || 'Acara tanpa judul',
            time: allDay ? 'Seharian' : key === startDay ? workroomTime.format(start) + ' WITA' : 'Berlangsung',
          });
          entries.set(key, list);
        }
      }
    }
    for (const list of entries.values()) list.sort((a, b) => a.start - b.start);
    return { entries, status: calendars.some(calendar => calendar.status === 'rejected') ? 'partial' : 'connected' };
  } catch {
    return { entries: new Map(), status: 'error' };
  }
}

function googleAgenda(calendar, day, result) {
  if (calendar.status === 'disabled') return '';
  const events = calendar.entries.get(day) ?? [];
  const connect = '<a href="/workroom/?google=connect">Hubungkan Google Calendar</a>';
  const status = result === 'error' ? '<p role="status">Izin Google Calendar belum tersimpan.</p>' : '';
  return `<div class="google-agenda"><h3>Google Calendar</h3>${status}
    ${calendar.status === 'error' ? '<p>Jadwal Google belum bisa dimuat. Coba muat ulang atau hubungkan kembali.</p>' + connect : ''}
    ${calendar.status === 'disconnected' ? connect : ''}
    ${calendar.status === 'partial' ? '<p>Sebagian kalender belum bisa dimuat. Periksa ID kalender dan izin aksesnya.</p>' : ''}
    ${['connected', 'partial'].includes(calendar.status) ? events.length ? '<ul>' + events.map(event =>
      `<li><small>${escapeWorkroom(event.time)}</small><strong>${escapeWorkroom(event.title)}</strong></li>`).join('') + '</ul>'
      : calendar.status === 'connected' ? '<p>Tidak ada acara pada tanggal ini.</p>' : '' : ''}
  </div>`;
}

function workroomCalendar(day, tasks, today, google) {
  const date = new Date(day + 'T12:00:00Z');
  const year = date.getUTCFullYear(), month = date.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const iso = value => value.toISOString().slice(0, 10);
  const href = value => `${WORKROOM}?day=${value}#agenda`;
  const monthLink = (offset, label, symbol) => `<a aria-label="${label}" href="${href(iso(new Date(Date.UTC(year, month + offset, 1))))}">${symbol}</a>`;
  const dated = new Set(tasks.map(task => task.due));
  const cells = Array.from({length: days}, (_, i) => {
    const value = day.slice(0, 8) + String(i + 1).padStart(2, '0');
    return `<a href="${href(value)}" class="${value === day ? 'selected ' : ''}${dated.has(value) || google.has(value) ? 'marked' : ''}" aria-label="${value}${dated.has(value) ? ', ada tugas' : ''}${google.has(value) ? ', ada acara Google Calendar' : ''}"${value === today ? ' aria-current="date"' : ''}>${i + 1}</a>`;
  });
  return `<section class="collection calendar"><div class="calendar-heading"><h2>${date.toLocaleDateString('id-ID', {month:'long', year:'numeric', timeZone:'UTC'})}</h2><div>${monthLink(-1,'Bulan sebelumnya','‹')}${monthLink(1,'Bulan berikutnya','›')}</div></div><div class="days">${['Sn','Sl','Rb','Km','Jm','Sb','Mg'].map(d => `<small>${d}</small>`).join('')}${'<span></span>'.repeat((first.getUTCDay()+6)%7)}${cells.join('')}</div></section>`;
}

function workroomWorkspace(entries, params) {
  const e = escapeWorkroom;
  const path = workroomPages.task.path;
  const editLink = entry => `<a href="${workroomEntryLink(entry)}#workspace">${e(entry.title)}</a>${entry.priority === 'high' ? ' <small>Prioritas tinggi</small>' : ''}`;
  const view = params.get('view') === 'board' ? 'board' : 'table';
  const filter = params.get('status');
  const selected = entries.find(entry => entry.kind === 'task' && String(entry.id) === params.get('edit'));
  const tasks = entries.filter(entry => entry.kind === 'task' && (!Object.hasOwn(workroomKinds.task.statuses, filter) || entry.status === filter));
  const statuses = Object.entries(workroomKinds.task.statuses);
  const statusForm = entry => `<form class="task-status" method="post" action="${path}">
    <input type="hidden" name="kind" value="task"><input type="hidden" name="id" value="${entry.id}">
    <input type="hidden" name="view" value="${view}">
    <input type="hidden" name="filter" value="${Object.hasOwn(workroomKinds.task.statuses, filter) ? filter : ''}">
    <select name="status" aria-label="Status ${e(entry.title)}">${statuses.map(([value, label]) =>
      `<option value="${value}"${entry.status === value ? ' selected' : ''}>${label}</option>`).join('')}</select>
    <button name="action" value="status">Ubah</button></form>`;
  const table = `<div class="task-table"><table><thead><tr><th>Judul</th><th>Tenggat</th><th>Status</th></tr></thead>
    <tbody>${tasks.map(entry => `<tr><td>${editLink(entry)}</td><td>${e(entry.due || '—')}</td><td>${statusForm(entry)}</td></tr>`).join('')}</tbody></table></div>`;
  const board = `<div class="task-board">${statuses.map(([status, label]) => `<section><h3>${label}</h3>
    ${tasks.filter(entry => entry.status === status).map(entry => `<article>${editLink(entry)}${statusForm(entry)}</article>`).join('') || '<p>Belum ada tugas.</p>'}</section>`).join('')}</div>`;
  const views = Object.entries({table: 'Tabel', board: 'Papan'}).map(([key, label]) => {
    const query = new URLSearchParams({view: key});
    if (Object.hasOwn(workroomKinds.task.statuses, filter)) query.set('status', filter);
    return `<a href="${path}?${e(query)}#workspace"${view === key ? ' aria-current="true"' : ''}>${label}</a>`;
  }).join('');
  const editor = selected ? `<section class="collection workspace-editor"><h2>${e(selected.title)}</h2>
    ${workroomForm(selected.kind, selected, entries.filter(entry => entry.kind === 'project'), true)}</section>` : '';
  return `<div class="workspace" id="workspace">${editor}<section class="collection">
    <h2>Daftar tugas</h2><div class="workspace-tools">${views}
    <form method="get" action="${path}#workspace"><input type="hidden" name="view" value="${view}">
    <select name="status" aria-label="Filter status"><option value="">Semua status</option>
    ${statuses.map(([value, label]) => `<option value="${value}"${filter === value ? ' selected' : ''}>${label}</option>`).join('')}</select>
    <button>Filter</button></form></div>
    ${view === 'board' ? board : table}
    ${view === 'table' && !tasks.length ? '<p>Belum ada tugas untuk filter ini.</p>' : ''}</section></div>`;
}

function workroomEntryLink(entry) {
  const path = workroomPages[entry.kind].path;
  return path + '?edit=' + entry.id;
}

async function renderWorkroom(db, page, url, env) {
  const e = escapeWorkroom;
  const { results: entries } = await db.prepare('SELECT * FROM workroom_entries ORDER BY id DESC').all();
  const params = url.searchParams;
  const notice = params.has('saved') ? '<p class="save-notice" role="status">Perubahan tersimpan.</p>' : '';
  const projects = entries.filter(entry => entry.kind === 'project');
  const collection = kind => {
    const { title, statuses } = workroomKinds[kind];
    return `<section class="collection" id="${kind}">
      <details class="add-entry" id="add-${kind}"${params.get('add') === kind ? ' open' : ''}>
        <summary>Tambah ${title.toLowerCase()}</summary>${workroomForm(kind, null, projects)}
      </details>
      ${kind === 'task' ? '' : entries.filter(entry => entry.kind === kind).map(entry =>
        `<details id="entry-${entry.id}"${params.get('edit') === String(entry.id) ? ' open' : ''}>
          <summary>${e(entry.title)} <small>${statuses[entry.status]}${entry.due ? ' · ' + e(entry.due) : ''}</small></summary>
          ${workroomForm(kind, entry, projects)}
        </details>`).join('')}
    </section>`;
  };
  if (page !== 'home') {
    return workroomPage(`<div class="dashboard-content"><h1>${workroomPages[page].title}</h1>
      ${notice}${collection(page)}${page === 'task' ? workroomWorkspace(entries, params) : ''}</div>`, 200, page);
  }

  const selected = entries.find(entry => String(entry.id) === params.get('edit'));
  if (selected) return workroomRedirect(url, workroomEntryLink(selected));
  if (params.get('add') === 'task') return workroomRedirect(url, workroomPages.task.path + '?add=task#add-task');
  const selectedDay = params.get('day');
  const today = workroomDay.format(new Date());
  const validDay = /^(19|20)\d{2}-\d{2}-\d{2}$/.test(selectedDay) && Number.isFinite(Date.parse(selectedDay)) && new Date(selectedDay).toISOString().startsWith(selectedDay);
  const day = validDay ? selectedDay : today;
  const google = await googleMonth(env, day);
  const due = entries.filter(entry => entry.kind === 'task' && entry.status !== 'done' && entry.due && (day === today ? entry.due <= today : entry.due === day))
    .sort((a, b) => a.due.localeCompare(b.due));
  const openTasks = entries.filter(entry => entry.kind === 'task' && entry.status !== 'done').length;
  const activeProjects = projects.filter(project => project.status === 'active').length;
  const activeGoals = entries.filter(entry => entry.kind === 'goal' && entry.status === 'active').length;
  const dateLabel = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'Asia/Makassar' }).format(new Date());
  return workroomPage(`<div class="dashboard-content">
      <div class="workroom-hero">
        <img src="/workroom-hero.webp" width="1600" height="870" alt="" fetchpriority="high">
        <h1>Workroom</h1>
      </div>
      ${notice}
      <section class="today-panel" id="hari-ini">
        <div class="today-heading"><div><p>${e(dateLabel)} · WITA</p><h2>Agenda Faisal</h2></div></div>
        <form class="capture" method="post" action="${WORKROOM}">
          <input type="hidden" name="action" value="save"><input type="hidden" name="priority" value="normal">
          <select aria-label="Jenis entri" name="kind"><option value="task">Tugas</option><option value="note">Catatan</option></select>
          <input name="title" aria-label="Judul entri baru" placeholder="Apa yang ingin kamu catat?" required maxlength="160">
          <button>Simpan</button>
        </form>
      </section>
      <div class="dashboard-stats">
        <a href="${workroomPages.task.path}">Tugas terbuka<strong>${openTasks}</strong></a>
        <a href="${workroomPages.project.path}">Proyek aktif<strong>${activeProjects}</strong></a>
        <a href="${workroomPages.note.path}">Catatan<strong>${entries.filter(entry => entry.kind === 'note').length}</strong></a>
        <a href="${workroomPages.goal.path}">Goals aktif<strong>${activeGoals}</strong></a>
      </div>
      <div class="overview" id="agenda">
        <section class="collection agenda"><h2>${day === today ? 'Hari ini' : new Date(day+'T12:00:00Z').toLocaleDateString('id-ID',{day:'numeric',month:'long',timeZone:'UTC'})}</h2>
          ${due.length ? '<ul class="due-list">' + due.map(entry => `<li><form method="post" action="${WORKROOM}"><input type="hidden" name="kind" value="task"><input type="hidden" name="id" value="${entry.id}"><button name="action" value="complete" aria-label="Tandai selesai: ${e(entry.title)}">✓</button></form><div><a href="${workroomEntryLink(entry)}">${e(entry.title)}</a><small>${entry.due < today ? 'Lewat tenggat · ' : ''}${e(entry.due)}</small></div></li>`).join('') + '</ul>' : '<p class="agenda-empty">Tidak ada tugas jatuh tempo.</p>'}
          <a class="quick-add" href="${workroomPages.task.path}?add=task#add-task">+ Tambah tugas</a>
          ${googleAgenda(google, day, params.get('google'))}
          ${day !== today ? '<a class="reset-day" href="/workroom/#agenda">Kembali ke hari ini</a>' : ''}
        </section>
        ${workroomCalendar(day, entries.filter(entry => entry.kind === 'task' && entry.status !== 'done'), today, google.entries)}
        <section class="collection recent-notes"><h2>Catatan terbaru</h2>
          ${entries.some(entry => entry.kind === 'note') ? '<ul>' + entries.filter(entry => entry.kind === 'note').slice(0,3).map(note =>
            `<li><a href="${workroomEntryLink(note)}"><strong>${e(note.title)}</strong>${note.body ? '<small>' + e(note.body.slice(0,120)) + '</small>' : ''}</a></li>`).join('') + '</ul>' : '<p>Catatan pertama bisa kamu tulis lewat kolom di atas.</p>'}
          <a href="${workroomPages.note.path}">Semua catatan</a>
        </section>
      </div>
    </div>`, 200, page);
}

const builtInNoteCategories = ['belajar', 'ide', 'pribadi', 'referensi'];

async function workroomNotesData(request, db) {
  const reply = (value, status = 200) => Response.json(value, {status, headers: {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }});
  const columns = async () => (await db.prepare('PRAGMA table_info(workroom_entries)').all()).results;
  const current = await columns();
  for (const [name, type] of [['note_category', 'TEXT'], ['note_updated', 'INTEGER']]) {
    if (current.some(column => column.name === name)) continue;
    try {
      await db.prepare(`ALTER TABLE workroom_entries ADD COLUMN ${name} ${type}`).run();
    } catch (error) {
      if (!(await columns()).some(column => column.name === name)) throw error;
    }
  }
  await db.prepare('CREATE TABLE IF NOT EXISTS workroom_note_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE)').run();
  if (request.method === 'GET') {
    const [notes, categories] = await db.batch([
      db.prepare("SELECT id, kind, title, body, note_category AS category, note_updated AS updated FROM workroom_entries WHERE kind = 'note' ORDER BY id DESC"),
      db.prepare('SELECT id, name FROM workroom_note_categories ORDER BY name'),
    ]);
    return reply({notes: notes.results, categories: categories.results});
  }
  let data;
  try { data = await request.json(); } catch { return reply({error:'Permintaan tidak valid.'}, 400); }
  if (!data || typeof data !== 'object') return reply({error:'Permintaan tidak valid.'}, 400);
  if (data.action === 'category') {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name || name.length > 40) return reply({error:'Nama kategori tidak valid.'}, 400);
    const id = 'custom-' + crypto.randomUUID();
    const result = await db.prepare('INSERT OR IGNORE INTO workroom_note_categories (id, name) VALUES (?, ?)').bind(id, name).run();
    return result.meta.changes ? reply({id, name}, 201) : reply({error:'Kategori sudah ada.'}, 409);
  }
  const {id, title, body, category} = data;
  if (data.action !== 'save' || (id !== null && (!Number.isSafeInteger(id) || id < 1)) ||
      typeof title !== 'string' || !title.trim() || title.length > 160 || typeof body !== 'string' || body.length > 10000 ||
      typeof category !== 'string' || category.length > 50) return reply({error:'Periksa judul, isi, dan kategori.'}, 400);
  if (category !== 'none' && !builtInNoteCategories.includes(category) &&
      !await db.prepare('SELECT id FROM workroom_note_categories WHERE id = ?').bind(category).first()) {
    return reply({error:'Kategori tidak ditemukan.'}, 400);
  }
  const updated = Date.now();
  const values = [title.trim(), body, category, updated];
  const result = id === null
    ? await db.prepare("INSERT INTO workroom_entries (title, body, note_category, note_updated, kind, status, due, priority) VALUES (?, ?, ?, ?, 'note', 'active', '', 'normal')").bind(...values).run()
    : await db.prepare("UPDATE workroom_entries SET title = ?, body = ?, note_category = ?, note_updated = ? WHERE id = ? AND kind = 'note'").bind(...values, id).run();
  if (!result.meta.changes) return reply({error:'Catatan tidak ditemukan.'}, 404);
  return reply({id: id ?? result.meta.last_row_id, kind:'note', title:title.trim(), body, category, updated});
}

function workroomRedirect(url, target, status = 302) {
  return new Response(null, { status, headers: { ...privateHeaders, Location: new URL(target, url).href } });
}

async function handleWorkroom(request, env, url) {
  if (!env.WORKROOM_ACCESS_AUD || !env.WORKROOM_OWNER_EMAIL ||
      !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.WORKROOM_ACCESS_ISSUER || '') || !env.WORKROOM_DB) {
    return workroomPage('<h1>Workroom</h1><p>Workroom sedang disiapkan.</p>', 503);
  }
  if (!await isWorkroomOwner(request, env)) {
    return workroomPage('<h1>Workroom privat</h1><p>Akses hanya tersedia untuk akun pemilik.</p>', 403);
  }
  if (request.method === 'GET' && (url.pathname === WORKROOM + 'google-calendar/' ||
      (url.pathname === WORKROOM && url.searchParams.get('google') === 'connect'))) {
    return connectGoogleCalendar(request, env, url);
  }
  const path = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';
  const page = Object.keys(workroomPages).find(key => workroomPages[key].path === path);
  if (!page) return workroomPage('<h1>Halaman tidak ditemukan</h1>', 404);
  if (url.pathname !== path) return workroomRedirect(url, path + url.search, 308);
  if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) {
    return workroomPage('<h1>Permintaan ditolak</h1>', 403);
  }
  if (request.method !== 'GET' && request.method !== 'POST') return workroomPage('<h1>Metode tidak didukung</h1>', 405);

  const db = env.WORKROOM_DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS workroom_entries (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    due TEXT NOT NULL,
    priority TEXT NOT NULL,
    project_id INTEGER REFERENCES workroom_entries(id) ON DELETE SET NULL,
    note_category TEXT,
    note_updated INTEGER
  )`).run();
  if ((page === 'home' || page === 'note') && url.searchParams.has('notes-data')) {
    return workroomNotesData(request, db);
  }
  if (request.method === 'GET') {
    if (page === 'home' && url.searchParams.has('notes')) {
      url.searchParams.delete('notes');
      return workroomRedirect(url, workroomPages.note.path + url.search);
    }
    if (page === 'note' && !url.searchParams.has('basic')) {
      return workroomPage('<div id="view" aria-busy="true">Memuat catatan…</div><p id="note-status" role="status"></p><noscript>Aktifkan JavaScript untuk membuka editor. <a href="?basic">Buka daftar catatan dasar</a></noscript><script src="/workroom-notes.js" defer></script>', 200, page);
    }
    return renderWorkroom(db, page, url, env);
  }

  const data = await request.formData();
  const get = key => String(data.get(key) ?? '').trim();
  const id = get('id') ? Number(get('id')) : null;
  const kind = get('kind');
  const invalid = () => workroomPage('<h1>Data belum valid</h1><p>Kembali ke formulir untuk memeriksa isian.</p>', 400);
  if (!Object.hasOwn(workroomKinds, kind) || (page !== 'home' && page !== kind) || (id !== null && (!Number.isSafeInteger(id) || id < 1))) return invalid();

  if (get('action') === 'status' && kind === 'task' && id) {
    const status = get('status');
    if (!Object.hasOwn(workroomKinds.task.statuses, status)) return invalid();
    await db.prepare("UPDATE workroom_entries SET status = ? WHERE id = ? AND kind = 'task'").bind(status, id).run();
    const query = new URLSearchParams({saved: '', view: get('view') === 'board' ? 'board' : 'table'});
    if (Object.hasOwn(workroomKinds.task.statuses, get('filter'))) query.set('status', get('filter'));
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: workroomPages.task.path + '?' + query + '#workspace' } });
  } else if (get('action') === 'complete' && kind === 'task' && id) {
    await db.prepare("UPDATE workroom_entries SET status = 'done' WHERE id = ? AND kind = 'task'").bind(id).run();
  } else if (get('action') === 'delete' && id) {
    await db.prepare('DELETE FROM workroom_entries WHERE id = ? AND kind = ?').bind(id, kind).run();
  } else if (get('action') === 'save') {
    const title = get('title');
    const body = get('body');
    const status = get('status') || 'active';
    const due = kind === 'note' ? '' : get('due');
    const priority = kind === 'task' ? get('priority') : 'normal';
    const project = kind !== 'project' && get('project_id') ? Number(get('project_id')) : null;
    if (!title || title.length > 160 || body.length > 10000 || !Object.hasOwn(workroomKinds[kind].statuses, status) ||
        !['normal', 'high'].includes(priority) ||
        (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(due)) ||
          new Date(due).toISOString().slice(0, 10) !== due))) return invalid();
    if (project !== null && (!Number.isSafeInteger(project) || project < 1 ||
        !await db.prepare("SELECT id FROM workroom_entries WHERE id = ? AND kind = 'project'").bind(project).first())) return invalid();

    const values = [title, body, status, due, priority, project];
    if (id) {
      await db.prepare('UPDATE workroom_entries SET title = ?, body = ?, status = ?, due = ?, priority = ?, project_id = ? WHERE id = ? AND kind = ?')
        .bind(...values, id, kind).run();
    } else {
      await db.prepare('INSERT INTO workroom_entries (title, body, status, due, priority, project_id, kind) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(...values, kind).run();
    }
  } else return invalid();

  if (page === 'home') return workroomRedirect(url, WORKROOM + '?saved', 303);
  const query = new URLSearchParams({saved: ''});
  if (page === 'note') query.set('basic', '');
  if (id && get('action') === 'save') query.set('edit', id);
  return workroomRedirect(url, path + '?' + query, 303);
}

const COMMENTS_PATH = '/api/study-comments';
const FORMSPREE_URL = 'https://formspree.io/f/xrpqaorq';

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function comments(request, db) {
  if (!db) return json({ error: 'Database binding COMMENTS_DB is missing' }, 503);
  await db.prepare(`CREATE TABLE IF NOT EXISTS study_comments (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    message TEXT NOT NULL
  )`).run();

  if (request.method === 'GET') {
    const { results } = await db.prepare(
      'SELECT name, message FROM study_comments ORDER BY id DESC LIMIT 50'
    ).all();
    return json({ comments: results });
  }

  const fields = await request.formData();
  const name = String(fields.get('name') || '').trim();
  const message = String(fields.get('message') || '').trim();
  const email = String(fields.get('email') || '').trim();
  const category = String(fields.get('category') || '').trim();
  if (fields.get('public_comment') !== 'yes' || !name || !message || !category ||
      name.length > 100 || message.length > 1200 || email.length > 254 || category.length > 60) {
    return json({ error: 'Invalid feedback' }, 400);
  }

  const submission = new URLSearchParams({
    name, message, category, public_comment: 'yes', subject: 'Masukan Ruang Belajar',
  });
  if (email) submission.set('email', email);
  const sent = await fetch(FORMSPREE_URL, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: submission,
  });
  if (!sent.ok) return json({ error: 'Feedback could not be sent' }, 502);

  try {
    await db.prepare('INSERT INTO study_comments (name, message) VALUES (?, ?)').bind(name, message).run();
  } catch {
    return json({ published: false });
  }
  return json({ published: true, comment: { name, message } }, 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/workroom' || url.pathname.startsWith(WORKROOM)) {
      try {
        return await handleWorkroom(request, env, url);
      } catch {
        return workroomPage('<h1>Workroom</h1><p>Workroom sedang tidak tersedia.</p>', 503);
      }
    }
    if (url.pathname !== COMMENTS_PATH) return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }
    if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) {
      return json({ error: 'Invalid origin' }, 403);
    }
    try {
      return await comments(request, env.COMMENTS_DB);
    } catch {
      return json({ error: 'Could not access the comments database' }, 503);
    }
  },
};
