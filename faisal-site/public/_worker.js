import { notePreview } from './workroom-note-format.js';

const WORKROOM = '/workroom/';
const workroomOverviewUrl = WORKROOM + '?view=overview';
const workroomKinds = {
  task: { title: 'Tugas', statuses: { active: 'Belum mulai', doing: 'Dikerjakan', done: 'Selesai' } },
  project: { title: 'Proyek', statuses: { active: 'Aktif', done: 'Selesai' } },
  note: { title: 'Catatan', statuses: { active: 'Tersimpan' } },
  goal: { title: 'Goals', statuses: { active: 'Sedang berjalan', done: 'Tercapai' } },
};
const workroomPages = {
  home: { path: WORKROOM, title: 'Ringkasan', icon: 'home' },
  today: { path: WORKROOM + 'today/', title: 'Hari Ini', icon: 'calendar-day' },
  task: { path: WORKROOM + 'tasks/', title: 'Tugas', icon: 'checklist' },
  privateNotes: { path: WORKROOM + 'private-notes/', title: 'Catatan Rahasia', icon: 'lock' },
  note: { path: WORKROOM + 'notes/', title: 'Catatan', icon: 'file-text' },
  project: { path: WORKROOM + 'projects/', title: 'Proyek', icon: 'folder' },
  goal: { path: WORKROOM + 'goals/', title: 'Goals', icon: 'target' },
  review: { path: WORKROOM + 'review/', title: 'Review', icon: 'book-open' },
};
const privateHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; img-src 'self' https:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function escapeWorkroom(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function workroomIcon(name, classes = 'ui-icon') {
  return `<svg class="${classes}" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><use href="/gentleface-icons.svg#${name}"/></svg>`;
}

function taskCheckboxIcons() {
  return workroomIcon('square', 'ui-icon check-empty') + workroomIcon('checkbox', 'ui-icon check-marked');
}

function workroomPage(content, status = 200, page = null) {
  const wordmark = '<a class="workroom-wordmark" href="/">abanggfaisal.</a>';
  const currentPage = page === 'privateNotes' ? 'note' : page;
  const secondaryPages = ['project', 'goal', 'review'];
  const sidebarLink = ([key, { path, title, icon }], extra = false) => {
    const secondary = secondaryPages.includes(key);
    return `<a href="${key === 'home' ? workroomOverviewUrl : path}" aria-label="${title}"${currentPage === key ? ' aria-current="page"' : ''}${secondary && !extra ? ' class="workroom-nav-secondary"' : ''}>
      ${workroomIcon(icon)}
      <span aria-hidden="true">${!extra && key === 'home' ? '<span class="workroom-nav-full">Ringkasan</span><span class="workroom-nav-short">Ringkas</span>' : title}</span>
    </a>`;
  };
  const sidebar = page ? `<nav class="workroom-nav" aria-label="Navigasi Workroom">
    ${wordmark}
    ${Object.entries(workroomPages).filter(([key]) => key !== 'privateNotes').map(entry => sidebarLink(entry)).join('')}
    <details class="workroom-nav-more"${secondaryPages.includes(currentPage) ? ' data-active' : ''}>
      <summary aria-label="Lainnya">
        ${workroomIcon('more-horizontal')}
        <span>Lainnya</span>
      </summary>
      <div class="workroom-nav-menu">
        ${secondaryPages.map(key => sidebarLink([key, workroomPages[key]], true)).join('')}
      </div>
    </details>
  </nav><script src="/workroom-nav.js" defer></script>` : '';
  return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${page && page !== 'home' ? workroomPages[page].title + ' · ' : ''}Workroom · abangfaisal</title><link rel="icon" type="image/svg+xml" href="/workroom-favicon.svg"><link rel="stylesheet" href="/workroom.css"></head>
    <body${page ? ' class="workroom-layout"' : ''}>${sidebar}
    ${page === 'home' || page === 'today' ? '<script src="/workroom-agenda-check.js" defer></script>' : ''}
    <header class="workroom-header">
      ${wordmark}
      <nav aria-label="Navigasi situs"><a href="/">Menu Utama</a><a href="/ruang-belajar/">Ruang Belajar</a></nav>
    </header>
    <main>${page === 'note' ? `<div class="notes-private-entry">
      <a href="${workroomPages.privateNotes.path}">${workroomIcon('lock')}Catatan Rahasia</a>
    </div>` : ''}${content}</main>
    ${page === 'task' || page === 'note' ? '<script src="/workroom-link-options.js" defer></script>' : ''}
    ${page === 'task' || page === 'note' ? '<script src="/workroom-image-upload.js" defer></script>' : ''}
    ${page ? `<footer class="workroom-footer" aria-label="Teknologi Workroom">
      <span role="img" class="workroom-logo googlecalendar" aria-label="Terintegrasi dengan Google Calendar" title="Terintegrasi dengan Google Calendar"><svg aria-hidden="true" fill="currentColor" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Google Calendar</title><path d="M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931l.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0 0 22.105 0zm-3.289 23.5l4.684-4.684h-4.684V23.5zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0v3.289z"/></svg></span>
      <span role="img" class="workroom-logo github" aria-label="Kode dikelola di GitHub" title="Kode dikelola di GitHub"><svg aria-hidden="true" fill="currentColor" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>GitHub</title><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg></span>
      <span role="img" class="workroom-logo cloudflare" aria-label="Dihosting di Cloudflare" title="Dihosting di Cloudflare"><svg aria-hidden="true" fill="currentColor" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Cloudflare</title><path d="M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.3154-.2246-.3164-.6045-.499-1.0615-.5205l-8.6592-.1123a.1559.1559 0 0 1-.1333-.0713c-.0283-.042-.0351-.0986-.021-.1553.0278-.084.1123-.1484.2036-.1562l8.7359-.1123c1.0351-.0489 2.1601-.8868 2.5537-1.9136l.499-1.3013c.0215-.0561.0293-.1128.0147-.168-.5625-2.5463-2.835-4.4453-5.5499-4.4453-2.5039 0-4.6284 1.6177-5.3876 3.8614-.4927-.3658-1.1187-.5625-1.794-.499-1.2026.119-2.1665 1.083-2.2861 2.2856-.0283.31-.0069.6128.0635.894C1.5683 13.171 0 14.7754 0 16.752c0 .1748.0142.3515.0352.5273.0141.083.0844.1475.1689.1475h15.9814c.0909 0 .1758-.0645.2032-.1553l.12-.4268zm2.7568-5.5634c-.0771 0-.1611 0-.2383.0112-.0566 0-.1054.0415-.127.0976l-.3378 1.1744c-.1475.5068-.0918.9707.1543 1.3164.2256.3164.6055.498 1.0625.5195l1.8437.1133c.0557 0 .1055.0263.1329.0703.0283.043.0351.1074.0214.1562-.0283.084-.1132.1485-.204.1553l-1.921.1123c-1.041.0488-2.1582.8867-2.5527 1.914l-.1406.3585c-.0283.0713.0215.1416.0986.1416h6.5977c.0771 0 .1474-.0489.169-.126.1122-.4082.1757-.837.1757-1.2803 0-2.6025-2.125-4.727-4.7344-4.727"/></svg></span>
    </footer>` : ''}</body></html>`, { status, headers: privateHeaders });
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

function workroomForm(kind, entry, projects, standalone = false, defaultDue = '') {
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
    <label>${kind === 'note' ? 'Isi catatan (Markdown)' : 'Detail'}<textarea name="body" rows="${standalone ? 12 : 3}" maxlength="10000">${e(entry?.body)}</textarea></label>
    ${kind === 'task' ? `<div class="task-detail-tools" hidden>
      <button type="button" class="task-image-toggle" aria-expanded="false">+ Tambah gambar lewat URL</button>
      <div class="task-image-fields" hidden>
        <label>URL gambar HTTPS<input type="text" inputmode="url" class="task-image-url" placeholder="https://…" autocomplete="off"></label>
        <button type="button" class="task-image-add">Sisipkan gambar</button>
      </div>
      <p class="task-detail-status" role="status"></p>
      <div class="task-detail-preview" aria-label="Pratinjau detail tugas" hidden></div>
    </div>` : ''}
    <div class="fields">
    ${kind !== 'note' ? `<label>Status<select name="status">${statuses}</select></label>
      <label>Tenggat<input type="date" name="due" value="${e(entry?.due ?? defaultDue)}"></label>` : ''}
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

function googleMonth(env, day) {
  const first = day.slice(0, 7) + '-01';
  const next = new Date(first + 'T12:00:00Z');
  next.setUTCMonth(next.getUTCMonth() + 1);
  return googleCalendarRange(env, first, next.toISOString().slice(0, 10));
}

async function googleCalendarRange(env, first, endDate) {
  const entries = new Map();
  if (!googleConfigured(env)) return { entries, status: 'disabled' };
  try {
    const connection = await googleCalendarConnection(env.WORKROOM_DB);
    if (!connection) return { entries, status: 'disconnected' };
    const token = await googleToken(env, { grant_type: 'refresh_token', refresh_token: connection.refresh_token });
    const from = new Date(first + 'T00:00:00+08:00');
    const end = new Date(endDate + 'T00:00:00+08:00');
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
            start: +start, end: +finish,
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

function googleAgenda(calendar, day) {
  if (calendar.status === 'disabled') return '';
  const events = calendar.entries.get(day) ?? [];
  const connect = '<a href="/workroom/?google=connect">Hubungkan Google Calendar</a>';
  return `<div class="google-agenda"><h3>Google Calendar</h3>
    ${calendar.status === 'error' ? '<p>Jadwal Google belum bisa dimuat. Coba muat ulang atau hubungkan kembali.</p>' + connect : ''}
    ${calendar.status === 'disconnected' ? connect : ''}
    ${calendar.status === 'partial' ? '<p>Sebagian kalender belum bisa dimuat. Periksa ID kalender dan izin aksesnya.</p>' : ''}
    ${['connected', 'partial'].includes(calendar.status) ? events.length ? '<ul>' + events.map(event =>
      `<li><small>${escapeWorkroom(event.time)}</small><strong>${escapeWorkroom(event.title)}</strong></li>`).join('') + '</ul>'
      : calendar.status === 'connected' ? '<p>Tidak ada acara pada tanggal ini.</p>' : '' : ''}
  </div>`;
}

async function workroomCalendarData(env, day) {
  const calendar = await googleMonth(env, day);
  return Response.json({
    status: calendar.status,
    fallback: googleAgenda(calendar, ''),
    days: Object.fromEntries([...calendar.entries.keys()].map(date => [date, googleAgenda(calendar, date)])),
  }, { headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8' } });
}

function validWorkroomDay(value) {
  if (!/^(19|20)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}

function workroomDueTask(entry, today, action = WORKROOM) {
  const title = escapeWorkroom(entry.title);
  return `<li data-agenda-task data-status="${escapeWorkroom(entry.status)}" data-due="${escapeWorkroom(entry.due)}"><form method="post" action="${action}">
    <input type="hidden" name="kind" value="task"><input type="hidden" name="id" value="${entry.id}">
    <button name="action" value="complete" class="task-checkbox" role="checkbox" aria-checked="false" aria-label="Tandai selesai: ${title}">${taskCheckboxIcons()}</button><button type="button" class="task-checkbox" role="checkbox" aria-checked="true" aria-label="Urungkan penyelesaian: ${title}" title="Urungkan" data-agenda-undo hidden>${taskCheckboxIcons()}</button>
    </form><div><a href="${workroomEntryLink(entry)}">${title}</a><small>${entry.due < today ? 'Lewat tenggat · ' : ''}${escapeWorkroom(entry.due)}</small><small data-agenda-feedback role="status"></small></div></li>`;
}

function workroomCalendar(day, tasks, today, google, fullCalendar) {
  const date = new Date(day + 'T12:00:00Z');
  const year = date.getUTCFullYear(), month = date.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const iso = value => value.toISOString().slice(0, 10);
  const href = value => `${WORKROOM}?day=${value}${fullCalendar ? '&amp;calendar=full' : ''}#agenda`;
  const monthLink = (offset, label, symbol) => {
    const value = iso(new Date(Date.UTC(year, month + offset, 1)));
    return `<a data-calendar-date="${value}" aria-label="${label}" href="${href(value)}">${symbol}</a>`;
  };
  const todayLabel = new Date(today + 'T12:00:00Z').toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  const dated = new Set(tasks.map(task => task.due));
  const cells = Array.from({length: days}, (_, i) => {
    const value = day.slice(0, 8) + String(i + 1).padStart(2, '0');
    return `<a data-calendar-date="${value}" href="${href(value)}" class="${value === day ? 'selected ' : ''}${dated.has(value) || google.has(value) ? 'marked' : ''}" aria-label="${value}${dated.has(value) ? ', ada tugas' : ''}${google.has(value) ? ', ada acara Google Calendar' : ''}"${value === today ? ' aria-current="date"' : ''}>${i + 1}</a>`;
  });
  return `<section class="calendar"><div class="calendar-heading">
    ${monthLink(-1, 'Bulan sebelumnya', workroomIcon('arrow-left'))}
    <h2>${date.toLocaleDateString('id-ID', {month:'long', year:'numeric', timeZone:'UTC'})}</h2>
    ${monthLink(1, 'Bulan berikutnya', workroomIcon('arrow-right'))}
  </div>
  <a data-calendar-date="${today}" class="reset-day" href="${href(today)}">Hari ini · ${todayLabel}</a>
  <div class="days">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<small>${d}</small>`).join('')}${'<span></span>'.repeat(first.getUTCDay())}${cells.join('')}</div></section>`;
}

function workroomTaskView(value) {
  return value === 'table' || value === 'board' ? value : 'daily';
}

function workroomDailyTasks(tasks, projects, filter) {
  const e = escapeWorkroom;
  const path = workroomPages.task.path;
  const today = workroomDay.format(new Date());
  const byDate = new Map([[today, []]]);
  const projectTitles = new Map(projects.map(project => [project.id, project.title]));
  const dateLabel = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  for (const task of tasks) {
    const date = validWorkroomDay(task.due) ? task.due : '';
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(task);
  }
  const dates = [...byDate.keys()].sort((a, b) => (a || '9999').localeCompare(b || '9999'));
  return `<p class="quick-check-feedback" role="status" hidden></p><div class="daily-task-grid">${dates.map(date => {
    const items = byDate.get(date);
    const visible = items.filter(task => !filter || task.status === filter);
    const completed = visible.filter(task => task.status === 'done').length;
    const title = date ? dateLabel.format(new Date(date + 'T12:00:00Z')) : 'Tanpa tenggat';
    const add = new URLSearchParams({ add: 'task', view: 'daily' });
    if (date) add.set('due', date);
    if (Object.hasOwn(workroomKinds.task.statuses, filter)) add.set('status', filter);
    const collapsed = date && date < today && items.every(task => task.status === 'done');
    return `<article class="daily-task-card" id="tasks-${date || 'undated'}"${!visible.length && date !== today ? ' hidden' : ''}>
      <details${collapsed ? '' : ' open'}>
        <summary>${workroomIcon('chevron-right', 'ui-icon daily-task-chevron')}<strong>${e(title)}</strong>${date === today ? '<span class="daily-task-today">Hari ini</span>' : ''}
          <small class="daily-task-progress" data-completed="${completed}" data-total="${visible.length}" aria-label="${completed} dari ${visible.length} selesai">${completed}/${visible.length}</small></summary>
        ${items.length ? `<ul>${items.map(task => {
          const done = task.status === 'done';
          const change = done ? 'Buka kembali' : 'Tandai selesai';
          const project = projectTitles.get(task.project_id);
          return `<li data-task-status="${e(task.status)}"${filter && task.status !== filter ? ' hidden' : ''}${done ? ' class="is-done"' : ''}>
            <form method="post" action="${path}" data-quick-check>
              <input type="hidden" name="kind" value="task">
              <input type="hidden" name="id" value="${task.id}">
              <input type="hidden" name="view" value="daily">
              <input type="hidden" name="status" value="${done ? 'active' : 'done'}">
              <input type="hidden" name="filter" value="${Object.hasOwn(workroomKinds.task.statuses, filter) ? filter : ''}">
              <button name="action" value="status" class="task-checkbox" role="checkbox" aria-checked="${done}" data-title="${e(task.title)}" aria-label="${change}: ${e(task.title)}">${taskCheckboxIcons()}</button>
            </form>
            <div><a class="daily-task-title" href="${workroomEntryLink(task)}#workspace">${e(task.title)}</a>
              ${project || task.priority === 'high' || task.status === 'doing' ? `<div class="daily-task-meta">
                ${task.priority === 'high' ? '<small>Prioritas tinggi</small>' : ''}
                ${task.status === 'doing' ? '<small data-task-doing>Dikerjakan</small>' : ''}
                ${project ? `<small>${e(project)}</small>` : ''}
              </div>` : ''}
            </div>
          </li>`;
        }).join('')}</ul>` : ''}
        <p data-daily-empty${visible.length ? ' hidden' : ''}>${filter ? 'Tidak ada tugas dengan status ini.' : 'Belum ada tugas untuk hari ini.'}</p>
      </details>
      <a class="daily-task-add" href="${path}?${e(add)}#add-task" aria-label="Tambah tugas: ${e(title)}" title="Tambah tugas">${workroomIcon('plus')}</a>
    </article>`;
  }).join('')}</div>`;
}

function workroomWorkspace(entries, params) {
  const e = escapeWorkroom;
  const path = workroomPages.task.path;
  const view = workroomTaskView(params.get('view'));
  const requestedStatus = params.get('status');
  const filter = Object.hasOwn(workroomKinds.task.statuses, requestedStatus) ? requestedStatus : '';
  const editLink = entry => {
    const query = new URLSearchParams({ edit: entry.id, view });
    if (Object.hasOwn(workroomKinds.task.statuses, filter)) query.set('status', filter);
    return `<a href="${path}?${e(query)}#workspace">${e(entry.title)}</a>${entry.priority === 'high' ? ' <small>Prioritas tinggi</small>' : ''}`;
  };
  const selected = entries.find(entry => entry.kind === 'task' && String(entry.id) === params.get('edit'));
  const tasks = entries.filter(entry => entry.kind === 'task');
  const statuses = Object.entries(workroomKinds.task.statuses);
  const statusForm = entry => `<form class="task-status" method="post" action="${path}">
    <input type="hidden" name="kind" value="task"><input type="hidden" name="id" value="${entry.id}">
    <input type="hidden" name="view" value="${view}">
    <input type="hidden" name="filter" value="${Object.hasOwn(workroomKinds.task.statuses, filter) ? filter : ''}">
    <select name="status" aria-label="Status ${e(entry.title)}">${statuses.map(([value, label]) =>
      `<option value="${value}"${entry.status === value ? ' selected' : ''}>${label}</option>`).join('')}</select>
    <button name="action" value="status">Ubah</button></form>`;
  const table = view === 'table' ? `<div class="task-table"><table><thead><tr><th>Judul</th><th>Tenggat</th><th>Status</th></tr></thead>
    <tbody>${tasks.map(entry => `<tr data-task-status="${e(entry.status)}"${filter && entry.status !== filter ? ' hidden' : ''}><td>${editLink(entry)}</td><td>${e(entry.due || '—')}</td><td>${statusForm(entry)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const board = view === 'board' ? `<div class="task-board">${statuses.map(([status, label]) => `<section data-status-column="${status}"${filter && filter !== status ? ' hidden' : ''}><h3>${label}</h3>
    ${tasks.filter(entry => entry.status === status).map(entry => `<article data-task-status="${e(entry.status)}">${editLink(entry)}${statusForm(entry)}</article>`).join('') || '<p>Belum ada tugas.</p>'}</section>`).join('')}</div>` : '';
  const views = Object.entries({daily: 'Per tanggal', table: 'Tabel', board: 'Papan'}).map(([key, label]) => {
    const query = new URLSearchParams({view: key});
    if (Object.hasOwn(workroomKinds.task.statuses, filter)) query.set('status', filter);
    return `<a href="${path}?${e(query)}#workspace"${view === key ? ' aria-current="true"' : ''}>${label}</a>`;
  }).join('');
  const editor = selected ? `<section class="collection workspace-editor"><h2>${e(selected.title)}</h2>
    ${workroomForm(selected.kind, selected, entries.filter(entry => entry.kind === 'project'), true)}</section>` : '';
  return `<div class="workspace" id="workspace">${editor}<section class="collection">
    <h2>Daftar tugas</h2><div class="workspace-tools">${views}
    <form method="get" action="${path}#workspace" data-task-filter><input type="hidden" name="view" value="${view}">
    <select name="status" aria-label="Filter status"><option value="">Semua status</option>
    ${statuses.map(([value, label]) => `<option value="${value}"${filter === value ? ' selected' : ''}>${label}</option>`).join('')}</select>
    <noscript><button>Filter</button></noscript></form></div>
    ${view === 'daily' ? workroomDailyTasks(tasks, entries.filter(entry => entry.kind === 'project'), filter) : view === 'board' ? board : table}
    ${view === 'table' ? `<p data-table-empty${tasks.some(task => !filter || task.status === filter) ? ' hidden' : ''}>Belum ada tugas untuk filter ini.</p>` : ''}</section></div>`;
}

function workroomEntryLink(entry) {
  const path = workroomPages[entry.kind].path;
  return path + '?edit=' + entry.id;
}

async function ensureWorkroomActivity(db) {
  const record = action => `INSERT INTO workroom_activity (entry_id, kind, title, action, occurred)
    VALUES (NEW.id, NEW.kind, NEW.title, '${action}', unixepoch());`;
  await db.prepare(`CREATE TABLE IF NOT EXISTS workroom_activity (
    id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL, kind TEXT NOT NULL,
    title TEXT NOT NULL, action TEXT NOT NULL, occurred INTEGER NOT NULL
  )`).run();
  const keepDailyStatus = action => `DELETE FROM workroom_activity
    WHERE kind = 'task' AND entry_id = NEW.id AND action = '${action}'
    AND occurred >= unixepoch('now', '+8 hours', 'start of day', '-8 hours'); ${record(action)}`;
  await db.batch([
    db.prepare('CREATE INDEX IF NOT EXISTS workroom_activity_period ON workroom_activity (occurred)'),
    db.prepare('CREATE INDEX IF NOT EXISTS workroom_activity_task_status ON workroom_activity (entry_id, kind, action, occurred)'),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS workroom_activity_created AFTER INSERT ON workroom_entries
      BEGIN ${record('created')} END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS workroom_activity_completed_on_create AFTER INSERT ON workroom_entries
      WHEN NEW.kind = 'task' AND NEW.status = 'done' BEGIN ${record('completed')} END`),
    db.prepare('DROP TRIGGER IF EXISTS workroom_activity_completed'),
    db.prepare('DROP TRIGGER IF EXISTS workroom_activity_reopened'),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS workroom_activity_daily_completed AFTER UPDATE OF status ON workroom_entries
      WHEN NEW.kind = 'task' AND OLD.status <> 'done' AND NEW.status = 'done' BEGIN ${keepDailyStatus('completed')} END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS workroom_activity_daily_reopened AFTER UPDATE OF status ON workroom_entries
      WHEN NEW.kind = 'task' AND OLD.status = 'done' AND NEW.status <> 'done' BEGIN ${keepDailyStatus('reopened')} END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS workroom_activity_note_edited AFTER UPDATE OF body, title ON workroom_entries
      WHEN NEW.kind = 'note' AND (OLD.body <> NEW.body OR OLD.title <> NEW.title) BEGIN ${record('edited')} END`),
  ]);
}

function reviewPeriod(params, today) {
  const monthly = params.get('period') === 'month';
  const requested = params.get('day') || '';
  const anchor = /^20\d{2}-\d{2}-\d{2}$/.test(requested) && Number.isFinite(Date.parse(requested)) &&
    new Date(requested).toISOString().slice(0, 10) === requested ? requested : today;
  const start = new Date(anchor + 'T12:00:00Z');
  if (monthly) start.setUTCDate(1);
  else start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const shift = offset => {
    const date = new Date(start);
    if (monthly) date.setUTCMonth(date.getUTCMonth() + offset);
    else date.setUTCDate(date.getUTCDate() + 7 * offset);
    return date.toISOString().slice(0, 10);
  };
  return { monthly, anchor, start: shift(0), end: shift(1), previous: shift(-1) };
}

function reviewDateLabel(date) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(date + 'T12:00:00Z'));
}

function reviewTimeline(activity, google, source) {
  const e = escapeWorkroom;
  const timeline = new Map(source === 'workroom' ? [] : google.entries);
  const actionLabels = { created: 'Dibuat', completed: 'Diselesaikan', reopened: 'Dibuka lagi', edited: 'Diedit' };
  const dailyStatus = new Set();
  for (const item of source === 'google' ? [] : activity) {
    const time = new Date(item.occurred * 1000);
    const date = workroomDay.format(time);
    if (item.kind === 'task' && (item.action === 'completed' || item.action === 'reopened')) {
      const key = date + ':' + item.entry_id;
      if (dailyStatus.has(key)) continue;
      dailyStatus.add(key);
    }
    const entries = timeline.get(date) ?? [];
    entries.push({
      start: +time, title: item.title, time: workroomTime.format(time) + ' WITA',
      source: 'Workroom · ' + workroomKinds[item.kind].title + ' · ' + actionLabels[item.action],
    });
    timeline.set(date, entries);
  }
  const googleStatus = source !== 'workroom' && {
    disabled: 'Google Calendar belum dikonfigurasi.',
    disconnected: 'Google Calendar belum dihubungkan.',
    partial: 'Sebagian kalender Google belum bisa dimuat.',
    error: 'Google Calendar belum bisa dimuat. Muat ulang untuk mencoba lagi.',
  }[google.status];
  return `${googleStatus ? `<p class="review-hint">${googleStatus}</p>` : ''}
      ${timeline.size ? [...timeline].sort(([a], [b]) => b.localeCompare(a)).map(([date, entries], index) => `
        <details${index === 0 ? ' open' : ''}><summary>${reviewDateLabel(date)}</summary><ul class="review-list">
          ${entries.sort((a, b) => a.start - b.start).map(item => `<li>
            <small>${e(item.time)}</small><div><strong>${e(item.title)}</strong><small>${e(item.source || 'Google Calendar')}</small></div>
          </li>`).join('')}
        </ul></details>`).join('') : '<p>Tidak ada kegiatan atau jadwal yang tercatat di periode ini.</p>'}`;
}

function reviewActivity(db, start, end) {
  const fromSeconds = Date.parse(start + 'T00:00:00+08:00') / 1000;
  const toSeconds = Date.parse(end + 'T00:00:00+08:00') / 1000;
  return db.prepare('SELECT entry_id, kind, title, action, occurred FROM workroom_activity WHERE occurred >= ? AND occurred < ? ORDER BY occurred DESC, id DESC')
    .bind(fromSeconds, toSeconds).all();
}

async function renderWorkroomReview(db, url, env) {
  const e = escapeWorkroom;
  const today = workroomDay.format(new Date());
  const period = reviewPeriod(url.searchParams, today);
  const { monthly, anchor, start, end, previous } = period;
  const mode = url.searchParams.get('timeline');
  const requestedSource = url.searchParams.get('source');
  const source = ['workroom', 'google'].includes(requestedSource) ? requestedSource : 'all';
  const activityRequest = reviewActivity(db, start, end);
  const googleRequest = source !== 'workroom' && (mode === 'full' || mode === 'data')
    ? googleCalendarRange(env, start, end)
    : Promise.resolve({ entries: new Map(), status: source !== 'workroom' && googleConfigured(env) ? 'loading' : 'disabled' });
  if (mode === 'data') {
    const [{ results: activity }, google] = await Promise.all([activityRequest, googleRequest]);
    return Response.json({ html: reviewTimeline(activity, google, source) }, {
      headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  const fromSeconds = Date.parse(start + 'T00:00:00+08:00') / 1000;
  const toSeconds = Date.parse(end + 'T00:00:00+08:00') / 1000;
  const [{ results: activity }, [{ results: tasks }, { results: completed }], google] = await Promise.all([
    activityRequest,
    db.batch([
      db.prepare("SELECT id, kind, title, due FROM workroom_entries WHERE kind = 'task' AND status <> 'done' AND (due = '' OR (due >= ? AND due < ?)) ORDER BY due = '', due, id DESC")
        .bind(start, end),
      db.prepare(`SELECT task.title, event.occurred
        FROM workroom_entries AS task
        JOIN workroom_activity AS event ON event.id = (
          SELECT id FROM workroom_activity
          WHERE entry_id = task.id AND kind = 'task' AND action IN ('completed', 'reopened')
          ORDER BY occurred DESC, id DESC LIMIT 1
        )
        WHERE task.kind = 'task' AND task.status = 'done'
          AND event.action = 'completed' AND event.occurred >= ? AND event.occurred < ?
        ORDER BY event.occurred DESC, event.id DESC`).bind(fromSeconds, toSeconds),
    ]),
    googleRequest,
  ]);
  const awaitGoogle = google.status === 'loading';
  const timelineLink = timeline => {
    const params = new URLSearchParams({ period: monthly ? 'month' : 'week', day: anchor, timeline, source });
    return workroomPages.review.path + '?' + params;
  };
  const timelineUrl = timelineLink('data');
  const fullUrl = timelineLink('full');
  const label = reviewDateLabel;
  const current = today >= start && today < end;
  const created = new Set(activity.filter(item => item.kind === 'task' && item.action === 'created').map(item => item.entry_id));
  const open = tasks.filter(task => task.due || current || created.has(task.id));

  const last = new Date(Date.parse(end + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  const href = (length, date, filter = source) => workroomPages.review.path + '?' + e(new URLSearchParams({period: length, day: date, source: filter}));
  const length = monthly ? 'month' : 'week';
  const periodLabel = monthly ? 'Bulan' : 'Minggu';
  return workroomPage(`<div class="dashboard-content workroom-review">
    <div class="review-heading">
      <div><h1>Review ${monthly ? 'bulanan' : 'mingguan'}</h1><p>${label(start)} – ${label(last)} · WITA</p></div>
      <nav class="review-controls" aria-label="Jenis periode">
        <a href="${href('week', anchor)}"${monthly ? '' : ' aria-current="page"'}>Mingguan</a>
        <a href="${href('month', anchor)}"${monthly ? ' aria-current="page"' : ''}>Bulanan</a>
      </nav>
    </div>
    <nav class="review-controls" aria-label="Pilih periode">
      <a href="${href(length, previous)}" aria-label="${periodLabel} sebelumnya">${workroomIcon('arrow-left')}</a>
      <a href="${href(length, today)}">${periodLabel} ini</a>
      <a href="${href(length, end)}" aria-label="${periodLabel} berikutnya">${workroomIcon('arrow-right')}</a>
    </nav>
    <div class="review-task-grid">
      <section class="collection">
        <h2>Tugas selesai <span>${completed.length}</span></h2>
        ${completed.length ? '<ul class="review-list">' + completed.map(item =>
          `<li><strong>${e(item.title)}</strong><small>${label(workroomDay.format(new Date(item.occurred * 1000)))}</small></li>`).join('') + '</ul>'
          : '<p>Belum ada penyelesaian yang tercatat di periode ini.</p>'}
        <p class="review-hint">Menampilkan tugas yang masih berstatus selesai dan terakhir diselesaikan dalam periode ini. Tugas tanpa tanggal penyelesaian tercatat tidak muncul di sini.</p>
      </section>
      <section class="collection">
        <h2>Tugas belum selesai <span>${open.length}</span></h2>
        <p class="review-hint">Status saat ini, berdasarkan tenggat dalam periode dan tugas tanpa tenggat yang relevan.</p>
        ${open.length ? '<ul class="review-list">' + open.map(task =>
          `<li><a href="${workroomEntryLink(task)}">${e(task.title)}</a><small>${task.due ? label(task.due) : 'Tanpa tenggat'}</small></li>`).join('') + '</ul>'
          : '<p>Tidak ada tugas terbuka di periode ini.</p>'}
      </section>
    </div>
    <section class="collection review-timeline" id="review-timeline">
      <h2>Kegiatan dan jadwal</h2>
      <nav class="review-controls" aria-label="Sumber kegiatan">
        ${[['all', 'Semua'], ['workroom', 'Workroom'], ['google', 'Google Calendar']].map(([key, title]) =>
          `<a href="${href(length, anchor, key)}#review-timeline"${source === key ? ' aria-current="true"' : ''}>${title}</a>`).join('')}
      </nav>
      <div id="review-timeline-content" data-url="${awaitGoogle ? e(timelineUrl) : ''}">${reviewTimeline(activity, google, source)}</div>
      ${awaitGoogle ? `<p id="review-calendar-status" role="status" hidden>Memuat Google Calendar…</p>
        <noscript><p><a href="${e(fullUrl)}">Muat Google Calendar</a></p></noscript>
        <script src="/workroom-review.js" defer></script>` : ''}
    </section>
  </div>`, 200, 'review');
}

async function workroomInbox(db, data) {
  const action = data.get('action');
  if (action === 'capture') {
    const text = String(data.get('text') ?? '').trim();
    if (!text || text.length > 10000) return false;
    await db.prepare('INSERT INTO workroom_inbox (id, text) VALUES (?, ?)').bind(crypto.randomUUID(), text).run();
    return true;
  }
  const destination = data.get('destination');
  const id = data.get('id');
  if (action !== 'triage' || !['task', 'note', 'reference'].includes(destination) ||
      typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) return false;
  const remove = db.prepare('DELETE FROM workroom_inbox WHERE id = ?').bind(id);
  await ensureWorkroomActivity(db);
  await ensureWorkroomNotes(db);
  await db.batch([
    db.prepare(`INSERT INTO workroom_entries (kind, title, body, status, due, priority, note_category, note_updated)
        SELECT ?, substr(text, 1, 160), text, 'active', '', 'normal', ?, ? FROM workroom_inbox WHERE id = ?`)
        .bind(destination === 'task' ? 'task' : 'note', destination === 'reference' ? 'referensi' : null, Date.now(), id),
    remove,
  ]);
  return true;
}

async function workroomToday(request, url, env) {
  const db = env.WORKROOM_DB;
  const today = workroomDay.format(new Date());
  const path = workroomPages.today.path;
  const mode = url.searchParams.get('agenda');
  const nextDate = new Date(today + 'T12:00:00Z');
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const tomorrow = nextDate.toISOString().slice(0, 10);
  const renderAgenda = async () => {
    const calendar = await googleCalendarRange(env, today, tomorrow);
    const events = calendar.entries.get(today) ?? [];
    const next = events.find(event => event.start <= Date.now() && event.end > Date.now() && event.time !== 'Seharian') ??
      events.find(event => event.start > Date.now());
    return (next ? `<p class="today-next"><strong>${next.start <= Date.now() ? 'Sedang berlangsung:' : 'Berikutnya:'}</strong> ${escapeWorkroom(next.time)} · ${escapeWorkroom(next.title)}</p>` : '') +
      (events.length ? `<details><summary>Semua agenda hari ini</summary>${googleAgenda(calendar, today)}</details>` : googleAgenda(calendar, today));
  };
  if (request.method === 'GET' && mode === 'data') {
    return Response.json({ html: await renderAgenda() }, {
      headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  await db.prepare(`CREATE TABLE IF NOT EXISTS workroom_daily_focus (
    day TEXT PRIMARY KEY, items TEXT NOT NULL
  )`).run();
  await db.prepare('CREATE TABLE IF NOT EXISTS workroom_inbox (id TEXT PRIMARY KEY, text TEXT NOT NULL)').run();
  if (request.method === 'POST') {
    const data = await request.formData();
    if (['capture', 'triage'].includes(data.get('action'))) {
      if (!await workroomInbox(db, data)) return workroomPage('<h1>Entri Inbox tidak valid</h1><a href="/workroom/today/#inbox">Kembali ke Inbox</a>', 400, 'today');
      return workroomRedirect(url, path + '?captured#inbox', 303);
    }
    if (data.get('action') === 'focus') {
      const items = ['focus-1', 'focus-2', 'focus-3'].map(name => String(data.get(name) ?? '').trim());
      if (data.get('day') !== today || items.some(item => item.length > 160)) {
        return workroomPage('<h1>Fokus belum tersimpan</h1><p>Periksa tanggal dan panjang setiap fokus.</p><a href="/workroom/today/">Kembali ke Hari Ini</a>', 400, 'today');
      }
      await db.prepare('INSERT INTO workroom_daily_focus (day, items) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET items = excluded.items')
        .bind(today, JSON.stringify(items)).run();
    } else if (data.get('action') === 'complete' && /^[1-9]\d*$/.test(String(data.get('id')))) {
      await ensureWorkroomActivity(db);
      await db.prepare("UPDATE workroom_entries SET status = 'done' WHERE id = ? AND kind = 'task'").bind(data.get('id')).run();
    } else {
      return workroomPage('<h1>Permintaan tidak valid</h1><a href="/workroom/today/">Kembali ke Hari Ini</a>', 400, 'today');
    }
    return workroomRedirect(url, path + '?saved', 303);
  }

  nextDate.setUTCDate(nextDate.getUTCDate() + 6);
  const through = nextDate.toISOString().slice(0, 10);
  const [[focus, tasks, inbox], agenda] = await Promise.all([
    db.batch([
      db.prepare('SELECT items FROM workroom_daily_focus WHERE day = ?').bind(today),
      db.prepare("SELECT id, kind, title, due, status FROM workroom_entries WHERE kind = 'task' AND status <> 'done' AND due <> '' AND due <= ? ORDER BY due, id DESC").bind(through),
      db.prepare('SELECT id, text FROM workroom_inbox ORDER BY rowid DESC'),
    ]),
    mode === 'full' ? renderAgenda() : '',
  ]);
  const items = JSON.parse(focus.results[0]?.items ?? '[]');
  const e = escapeWorkroom;
  const date = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'UTC' })
    .format(new Date(today + 'T12:00:00Z'));
  const due = tasks.results.filter(task => task.due <= today);
  const upcoming = tasks.results.filter(task => task.due > today);
  const list = (entries, empty) => `<ul class="due-list"${entries.length ? '' : ' hidden'}>${entries.map(task => workroomDueTask(task, today, path)).join('')}</ul>
    <p data-due-empty${entries.length ? ' hidden' : ''}>${empty}</p>`;
  const deferred = googleConfigured(env) && mode !== 'full';
  return workroomPage(`<div class="dashboard-content workroom-today">
    <div><h1>Hari Ini</h1><p>${e(date)} · WITA</p></div>
    ${(url.searchParams.has('saved') || url.searchParams.has('captured')) ? '<p class="save-notice" role="status">Perubahan tersimpan.</p>' : ''}
    <div class="today-workspace-grid">
      <section class="collection today-focus"><h2>Fokus hari ini</h2>
        ${items.some(Boolean) ? `<ol>${items.filter(Boolean).map(item => `<li>${e(item)}</li>`).join('')}</ol>` : '<p>Belum ada fokus.</p>'}
        <details><summary class="today-icon" aria-label="Edit fokus" title="Edit fokus">${workroomIcon('pencil')}</summary>
        <form method="post" action="${path}">
          <input type="hidden" name="action" value="focus"><input type="hidden" name="day" value="${today}">
          ${[1, 2, 3].map(number => `<label>Fokus ${number}<input name="focus-${number}" maxlength="160" value="${e(items[number - 1])}"></label>`).join('')}
          <button>Simpan fokus</button>
        </form></details>
      </section>
      <section class="collection"><h2>Agenda hari ini</h2>
        <div data-workroom-deferred data-url="${deferred ? path + '?agenda=data' : ''}" data-retry="${path}?agenda=full">
          <div data-deferred-content>${agenda || (!deferred ? '<p>Google Calendar belum dikonfigurasi.</p>' : '')}</div>
          ${deferred ? `<p data-deferred-status role="status">Memuat Google Calendar…</p>
            <noscript><a href="${path}?agenda=full">Muat Google Calendar</a></noscript>` : ''}
        </div>
      </section>
      <section class="collection"><h2>Hari ini dan lewat tenggat</h2>
        ${list(due, 'Tidak ada tugas yang jatuh tempo.')}
        <a href="${workroomPages.task.path}?add=task&amp;due=${today}#add-task">${workroomIcon('plus')} Tambah tugas hari ini</a>
      </section>
      <details class="collection today-upcoming"><summary>7 hari ke depan</summary>
        ${list(upcoming, 'Tidak ada tenggat dalam 7 hari ke depan.')}
        <a href="${workroomPages.task.path}">Semua tugas</a>
      </details>
    </div>
    <section class="collection today-inbox" id="inbox"><h2>Inbox Cepat</h2>
      <details${url.searchParams.has('captured') ? ' open' : ''}>
        <summary class="today-icon" aria-label="Tambah ke Inbox" title="Tambah ke Inbox">${workroomIcon('plus')}</summary>
        <form method="post" action="${path}">
          <label>Teks atau tautan<textarea name="text" maxlength="10000" required rows="2"></textarea></label>
          <button name="action" value="capture">Simpan ke Inbox</button>
        </form>
      </details>
      ${inbox.results.length ? `<ul class="inbox-items">${inbox.results.map(item => `<li><p>${e(item.text)}</p>
        <form method="post" action="${path}">
          <input type="hidden" name="id" value="${e(item.id)}"><input type="hidden" name="action" value="triage">
          <label>Pindahkan ke<select name="destination"><option value="task">Tugas</option><option value="note">Catatan</option><option value="reference">Referensi</option></select></label>
          <button>Pindahkan</button>
        </form></li>`).join('')}</ul>` : '<p>Inbox kosong.</p>'}
    </section>
    ${deferred ? '<script src="/workroom-review.js" defer></script>' : ''}
  </div>`, 200, 'today');
}

async function renderWorkroom(db, page, url, env) {
  const e = escapeWorkroom;
  const params = url.searchParams;
  const edit = params.get('edit');
  if (page === 'home' && edit) {
    const selected = await db.prepare('SELECT id, kind FROM workroom_entries WHERE id = ?').bind(edit).first();
    if (selected && String(selected.id) === edit) return workroomRedirect(url, workroomEntryLink(selected));
  }
  if (page === 'home' && params.get('add') === 'task') {
    return workroomRedirect(url, workroomPages.task.path + '?add=task#add-task');
  }
  let entries, counts;
  if (page === 'home') {
    const [tasks, notes, totals] = await db.batch([
      db.prepare("SELECT id, kind, title, status, due FROM workroom_entries WHERE kind = 'task' AND status <> 'done' AND due <> '' ORDER BY id DESC"),
      db.prepare("SELECT id, kind, title, body FROM workroom_entries WHERE kind = 'note' ORDER BY id DESC LIMIT 3"),
      db.prepare(`SELECT
        COUNT(CASE WHEN kind = 'task' AND status <> 'done' THEN 1 END) AS tasks,
        COUNT(CASE WHEN kind = 'project' AND status = 'active' THEN 1 END) AS projects,
        COUNT(CASE WHEN kind = 'goal' AND status = 'active' THEN 1 END) AS goals,
        COUNT(CASE WHEN kind = 'note' THEN 1 END) AS notes
        FROM workroom_entries`),
    ]);
    entries = [...tasks.results, ...notes.results];
    counts = totals.results[0];
  } else if (page === 'task') {
    ({ results: entries } = await db.prepare(`SELECT id, kind, title, status, due, priority, project_id,
      CASE WHEN kind = 'task' AND CAST(id AS TEXT) = ? THEN body END AS body
      FROM workroom_entries WHERE kind IN ('task', 'project') ORDER BY id DESC`).bind(edit).all());
  } else {
    ({ results: entries } = await db.prepare(`SELECT id, kind, title, status, due, priority, project_id,
      CASE WHEN kind = ? THEN body END AS body
      FROM workroom_entries WHERE kind IN (?, 'project') ORDER BY id DESC`).bind(page, page).all());
  }
  const notice = params.has('saved') ? '<p class="save-notice" role="status">Perubahan tersimpan.</p>' : '';
  const projects = entries.filter(entry => entry.kind === 'project');
  const collection = kind => {
    const { title, statuses } = workroomKinds[kind];
    return `<section class="collection" id="${kind}">
      <details class="add-entry" id="add-${kind}"${params.get('add') === kind ? ' open' : ''}>
        <summary>Tambah ${title.toLowerCase()}</summary>${workroomForm(kind, null, projects, false, kind === 'task' && validWorkroomDay(params.get('due')) ? params.get('due') : '')}
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
      ${notice}${collection(page)}${page === 'task' ? workroomWorkspace(entries, params) + '<script src="/workroom-task-detail.js" defer></script><script src="/workroom-quick-check.js" defer></script>' : ''}</div>`, 200, page);
  }

  const selectedDay = params.get('day');
  const today = workroomDay.format(new Date());
  const day = validWorkroomDay(selectedDay) ? selectedDay : today;
  const showGoogle = googleConfigured(env);
  const fullCalendar = params.get('calendar') === 'full';
  const google = fullCalendar ? await googleMonth(env, day) : { entries: new Map(), status: 'disabled' };
  const tasks = entries.filter(entry => entry.kind === 'task' && entry.status !== 'done' && entry.due)
    .sort((a, b) => a.due.localeCompare(b.due));
  const isDue = entry => day === today ? entry.due <= today : entry.due === day;
  const due = tasks.filter(isDue);
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: workroomTimeZone }).format(now);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: workroomTimeZone, hour: '2-digit', hourCycle: 'h23' }).format(now));
  const greetings = { morning: 'Good morning, Faisal!', afternoon: 'Good afternoon, Faisal!', night: 'Good night, Faisal!' };
  const period = hour < 6 || hour >= 18 ? 'night' : hour < 12 ? 'morning' : 'afternoon';
  return workroomPage(`<div class="dashboard-content">
      <div class="workroom-hero">
        <img src="/workroom-hero.webp" width="1600" height="870" alt="" fetchpriority="high">
        <h1>Workroom</h1>
      </div>
      ${notice}
      <div class="overview">
        <section class="today-panel" id="hari-ini">
          <div class="today-heading"><div>
            <p>${e(dateLabel)} · WITA</p>
            <h2 data-workroom-greeting data-morning="${greetings.morning}" data-afternoon="${greetings.afternoon}" data-night="${greetings.night}">${greetings[period]}</h2>
            <p class="workroom-greeting-copy">Sudah siap ngopi, nugas, dan belajar?</p>
          </div></div>
          <script src="/workroom-greeting.js" defer></script>
          <form class="capture" method="post" action="${WORKROOM}">
            <input type="hidden" name="action" value="save"><input type="hidden" name="priority" value="normal">
            <select aria-label="Jenis entri" name="kind"><option value="task">Tugas</option><option value="note">Catatan</option></select>
            <input name="title" aria-label="Judul entri baru" placeholder="Apa yang ingin kamu catat?" required maxlength="160">
            <button>Simpan</button>
          </form>
        </section>
        <div class="dashboard-stats">
          <a href="${workroomPages.task.path}">Tugas terbuka<strong>${counts.tasks}</strong></a>
          <a href="${workroomPages.project.path}">Proyek aktif<strong>${counts.projects}</strong></a>
          <a href="${workroomPages.note.path}">Catatan<strong>${counts.notes}</strong></a>
          <a href="${workroomPages.goal.path}">Goals aktif<strong>${counts.goals}</strong></a>
        </div>
        <div class="collection calendar-agenda" id="agenda" data-day="${day}" data-today="${today}" data-google="${showGoogle}"${fullCalendar ? ' data-calendar-full' : ''}>
          ${workroomCalendar(day, tasks, today, google.entries, fullCalendar)}
          <template id="calendar-tasks">${tasks.filter(entry => !isDue(entry)).map(entry => workroomDueTask(entry, today)).join('')}</template>
          <script src="/workroom-calendar.js" defer></script>
          <section class="agenda" aria-label="Agenda tanggal terpilih">
            <div class="agenda-heading">
              <h2>${new Date(day + 'T12:00:00Z').toLocaleDateString('id-ID', {day:'numeric', month:'long', timeZone:'UTC'})}</h2>
            </div>
            ${params.get('google') === 'error' ? '<p role="status">Izin Google Calendar belum tersimpan.</p>' : ''}
            <div id="calendar-google" aria-live="polite">${fullCalendar ? googleAgenda(google, day) : ''}</div>
            ${showGoogle && !fullCalendar ? `<noscript><p><a href="${WORKROOM}?day=${day}&amp;calendar=full#agenda">Muat Google Calendar</a></p></noscript>` : ''}
            <div class="agenda-tasks">
              <h3>Tugas</h3>
              <ul class="due-list"${due.length ? '' : ' hidden'}>${due.map(entry => workroomDueTask(entry, today)).join('')}</ul>
              <p class="agenda-empty"${due.length ? ' hidden' : ''}>Tidak ada tugas jatuh tempo.</p>
              <a class="quick-add" href="${workroomPages.task.path}?add=task#add-task">${workroomIcon('plus')} Tambah tugas</a>
            </div>
          </section>
        </div>
        <section class="collection recent-notes"><h2>Catatan terbaru</h2>
          ${entries.some(entry => entry.kind === 'note') ? '<ul>' + entries.filter(entry => entry.kind === 'note').slice(0,3).map(note => {
            const preview = notePreview(note.body);
            return `<li><a href="${workroomEntryLink(note)}"><strong>${e(note.title)}</strong>${preview ? '<small>' + e(preview) + '</small>' : ''}</a></li>`;
          }).join('') + '</ul>' : '<p>Catatan pertama bisa kamu tulis lewat kolom di atas.</p>'}
          <a href="${workroomPages.note.path}">Semua catatan</a>
        </section>
      </div>
    </div>`, 200, page);
}

const builtInNoteCategories = ['belajar', 'ide', 'pribadi', 'referensi'];

async function ensureWorkroomNotes(db) {
  const columns = async () => (await db.prepare('PRAGMA table_info(workroom_entries)').all()).results;
  const current = await columns();
  for (const [name, type] of [['note_category', 'TEXT'], ['note_updated', 'INTEGER'], ['note_pinned', 'INTEGER NOT NULL DEFAULT 0']]) {
    if (current.some(column => column.name === name)) continue;
    try {
      await db.prepare(`ALTER TABLE workroom_entries ADD COLUMN ${name} ${type}`).run();
    } catch (error) {
      if (!(await columns()).some(column => column.name === name)) throw error;
    }
  }
  await db.prepare('CREATE TABLE IF NOT EXISTS workroom_note_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE)').run();
}

async function readWorkroomNotes(db) {
  const [notes, categories] = await db.batch([
    db.prepare("SELECT id, kind, title, body, note_category AS category, note_updated AS updated, note_pinned AS pinned FROM workroom_entries WHERE kind = 'note' ORDER BY id DESC"),
    db.prepare('SELECT id, name FROM workroom_note_categories ORDER BY name'),
  ]);
  return { notes: notes.results, categories: categories.results };
}

async function workroomNotesData(request, db) {
  const reply = (value, status = 200) => Response.json(value, {status, headers: {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }});
  await ensureWorkroomNotes(db);
  if (request.method === 'GET') return reply(await readWorkroomNotes(db));
  let data;
  try { data = await request.json(); } catch { return reply({error:'Permintaan tidak valid.'}, 400); }
  if (!data || typeof data !== 'object') return reply({error:'Permintaan tidak valid.'}, 400);
  if (data.action === 'pin' || data.action === 'delete') {
    if (!Number.isSafeInteger(data.id) || data.id < 1 ||
        (data.action === 'pin' && typeof data.pinned !== 'boolean')) {
      return reply({error:'Permintaan catatan tidak valid.'}, 400);
    }
    const note = data.action === 'pin'
      ? await db.prepare("UPDATE workroom_entries SET note_pinned = ? WHERE id = ? AND kind = 'note' RETURNING id, note_pinned AS pinned")
        .bind(Number(data.pinned), data.id).first()
      : await db.prepare("DELETE FROM workroom_entries WHERE id = ? AND kind = 'note' RETURNING id")
        .bind(data.id).first();
    return note ? reply(note) : reply({error:'Catatan tidak ditemukan.'}, 404);
  }
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

const workroomImageLimit = 1024 * 1024;

async function workroomImage(request, url, db) {
  const id = url.pathname.slice((WORKROOM + 'images/').length);
  const headers = { ...privateHeaders, 'Content-Type': 'image/webp', 'Cross-Origin-Resource-Policy': 'same-origin' };
  if (request.method === 'GET' && /^[a-f0-9]{64}$/.test(id)) {
    const image = await db.prepare('SELECT bytes FROM workroom_images WHERE id = ?').bind(id).first()
      .catch(error => {
        if (!String(error).includes('no such table: workroom_images')) throw error;
        return null;
      });
    return new Response(image ? new Uint8Array(image.bytes) : null, { status: image ? 200 : 404, headers });
  }
  const reply = (value, status) => Response.json(value, {
    status, headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
  if (request.method !== 'POST' || id || request.headers.get('Origin') !== url.origin ||
      request.headers.get('Content-Type') !== 'image/webp') {
    return reply({ error: 'Permintaan gambar tidak valid.' }, 400);
  }
  if (Number(request.headers.get('Content-Length')) > workroomImageLimit) {
    return reply({ error: 'Gambar terlalu besar.' }, 413);
  }
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: 'Gambar kosong.' }, 400);
  const buffer = new Uint8Array(workroomImageLimit);
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.length > buffer.length) {
      await reader.cancel();
      return reply({ error: 'Gambar terlalu besar.' }, 413);
    }
    buffer.set(value, size);
    size += value.length;
  }
  const bytes = buffer.slice(0, size);
  const header = new DataView(bytes.buffer);
  if (size < 20 || header.getUint32(0) !== 0x52494646 || header.getUint32(8) !== 0x57454250 ||
      header.getUint32(4, true) !== size - 8) {
    return reply({ error: 'Format gambar tidak valid.' }, 400);
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const key = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  await db.prepare('CREATE TABLE IF NOT EXISTS workroom_images (id TEXT PRIMARY KEY, bytes BLOB NOT NULL)').run();
  await db.prepare(`INSERT OR IGNORE INTO workroom_images (id, bytes)
    SELECT ?, ? WHERE (SELECT COALESCE(SUM(length(bytes)), 0) FROM workroom_images) + ? <= 104857600`)
    .bind(key, bytes.buffer, size).run();
  const stored = await db.prepare('SELECT id FROM workroom_images WHERE id = ?').bind(key).first();
  if (!stored) return reply({ error: 'Penyimpanan gambar Workroom penuh.' }, 507);
  return reply({ url: WORKROOM + 'images/' + key }, 201);
}

const privateNotesCookie = '__Secure-workroom-private-notes';
const privateNotesLifetime = 300;
const privateNotesEncoder = new TextEncoder();

function privateNotesReply(content, status = 200) {
  return workroomPage(`<div class="dashboard-content"><a class="private-notes-back" href="${workroomPages.note.path}">${workroomIcon('arrow-left')} Catatan</a><h1>Catatan Rahasia</h1>${content}</div>`, status, 'privateNotes');
}

function privateNotesHex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function privateNotesKey(secret, purpose, algorithm, usages) {
  const key = await crypto.subtle.importKey('raw', privateNotesEncoder.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({
    name: 'HKDF', hash: 'SHA-256', salt: privateNotesEncoder.encode('workroom-private-notes-v1'),
    info: privateNotesEncoder.encode(purpose),
  }, key, algorithm, false, usages);
}

async function workroomPrivateNotes(request, url, env) {
  const { WORKROOM_PRIVATE_NOTES_PASSWORD: password, WORKROOM_PRIVATE_NOTES_KEY: secret, WORKROOM_DB: db } = env;
  const path = workroomPages.privateNotes.path;
  if (typeof password !== 'string' || password.length < 8 ||
      typeof secret !== 'string' || !/^[a-f0-9]{64}$/i.test(secret)) {
    return privateNotesReply('<p>Catatan Rahasia terkunci sampai sandi dan kunci penyimpanan dikonfigurasi.</p>', 503);
  }
  const e = escapeWorkroom;
  const now = Math.floor(Date.now() / 1000);
  const form = request.method === 'POST' ? await request.formData() : null;
  const action = form?.get('action');
  const cookie = request.headers.get('Cookie')?.match(/(?:^|; *)__Secure-workroom-private-notes=([a-f0-9]{64})(?:;|$)/)?.[1];
  const hashToken = async token => privateNotesHex(await crypto.subtle.digest('SHA-256', privateNotesEncoder.encode(token)));
  const tokenHash = cookie ? await hashToken(cookie) : '';
  const redirect = (token = '', seconds = 0) => {
    const headers = new Headers(privateHeaders);
    headers.set('Location', new URL(path, url).href);
    headers.set('Set-Cookie',
      `${privateNotesCookie}=${token}; Path=${path}; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`);
    return new Response(null, { status: 303, headers });
  };
  const locked = (message = '', status = 200) => privateNotesReply(`<section class="collection private-notes-panel">
    ${message ? `<p role="alert">${e(message)}</p>` : ''}
    <form method="post" action="${path}">
      <input type="hidden" name="action" value="unlock">
      <label>Sandi Catatan Rahasia<input type="password" name="password" required maxlength="200" autocomplete="off"></label>
      <button>Buka Catatan Rahasia</button>
    </form></section>`, status);

  if (!tokenHash && action !== 'unlock') {
    return locked(form ? 'Sesi terkunci. Buka kembali halaman sebelum menyimpan.' : '', form ? 401 : 200);
  }

  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS workroom_private_notes (id TEXT PRIMARY KEY, payload BLOB NOT NULL, iv BLOB NOT NULL, updated INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS workroom_private_sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL, access_hash TEXT NOT NULL, config_hash TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS workroom_private_attempts (window INTEGER PRIMARY KEY, attempts INTEGER NOT NULL)'),
  ]);
  const accessHash = await hashToken(request.headers.get('Cf-Access-Jwt-Assertion'));
  const authKey = await privateNotesKey(secret, 'authentication', { name: 'HMAC', hash: 'SHA-256' }, ['sign', 'verify']);
  const signature = await crypto.subtle.sign('HMAC', authKey, privateNotesEncoder.encode(password));
  const configHash = privateNotesHex(signature);

  if (action === 'lock') {
    if (tokenHash) await db.prepare('DELETE FROM workroom_private_sessions WHERE token = ?').bind(tokenHash).run();
    return redirect();
  }
  if (action === 'unlock') {
    const attempt = form.get('password');
    if (typeof attempt !== 'string' || !attempt || attempt.length > 200) return locked('Masukkan sandi yang valid.', 400);
    const window = Math.floor(now / 300);
    const [,, rate] = await db.batch([
      db.prepare('DELETE FROM workroom_private_sessions WHERE expires <= ?').bind(now),
      db.prepare('DELETE FROM workroom_private_attempts WHERE window < ?').bind(window),
      db.prepare(`INSERT INTO workroom_private_attempts (window, attempts) VALUES (?, 1)
        ON CONFLICT(window) DO UPDATE SET attempts = attempts + 1 RETURNING attempts`).bind(window),
    ]);
    if ((rate.results[0]?.attempts ?? Infinity) > 5) return locked('Terlalu banyak percobaan. Coba lagi dalam beberapa menit.', 429);
    if (!await crypto.subtle.verify('HMAC', authKey, signature, privateNotesEncoder.encode(attempt))) {
      return locked('Sandi salah.', 401);
    }
    const token = privateNotesHex(crypto.getRandomValues(new Uint8Array(32)));
    await db.prepare('INSERT INTO workroom_private_sessions (token, expires, access_hash, config_hash) VALUES (?, ?, ?, ?)')
      .bind(await hashToken(token), now + privateNotesLifetime, accessHash, configHash).run();
    return redirect(token, privateNotesLifetime);
  }

  const session = tokenHash && await db.prepare(`SELECT expires FROM workroom_private_sessions
    WHERE token = ? AND expires > ? AND access_hash = ? AND config_hash = ?`)
    .bind(tokenHash, now, accessHash, configHash).first();
  if (!session) return locked(form ? 'Sesi terkunci. Buka kembali halaman sebelum menyimpan.' : '', form ? 401 : 200);

  const cipher = await privateNotesKey(secret, 'encryption', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']);
  const aes = (id, iv) => ({ name: 'AES-GCM', iv, additionalData: privateNotesEncoder.encode(id) });
  const validId = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
  if (form) {
    const id = form.get('id') || crypto.randomUUID();
    const title = form.get('title');
    const body = form.get('body');
    if (action !== 'save' || !validId(id) || typeof title !== 'string' || !title.trim() || title.length > 160 ||
        typeof body !== 'string' || body.length > 10000) return privateNotesReply('<p>Periksa judul dan panjang isi catatan.</p>', 400);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const payload = await crypto.subtle.encrypt(aes(id, iv), cipher, privateNotesEncoder.encode(JSON.stringify({ title: title.trim(), body })));
    await db.prepare(`INSERT INTO workroom_private_notes (id, payload, iv, updated) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, iv = excluded.iv, updated = excluded.updated`)
      .bind(id, payload, iv.buffer, now).run();
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: path + '?edit=' + id } });
  }
  const { results } = await db.prepare('SELECT id, payload, iv FROM workroom_private_notes ORDER BY updated DESC, id').all();
  const notes = await Promise.all(results.map(async row => {
    const plain = await crypto.subtle.decrypt(aes(row.id, new Uint8Array(row.iv)), cipher, new Uint8Array(row.payload));
    return { ...JSON.parse(new TextDecoder().decode(plain)), id: row.id };
  }));
  const selected = notes.find(note => note.id === url.searchParams.get('edit'));
  return privateNotesReply(`<div data-private-notes-expires="${session.expires}">
    <form method="post" action="${path}"><button name="action" value="lock">Kunci sekarang</button></form>
    <div class="today-workspace-grid">
      <section class="collection"><h2>Daftar catatan</h2><a href="${path}">${workroomIcon('plus')} Catatan baru</a>
        ${notes.length ? '<ul>' + notes.map(note => `<li><a href="${path}?edit=${e(note.id)}">${e(note.title)}</a></li>`).join('') + '</ul>' : '<p>Belum ada catatan rahasia.</p>'}
      </section>
      <section class="collection"><h2>${selected ? 'Edit catatan' : 'Catatan baru'}</h2>
        <form method="post" action="${path}" autocomplete="off">
          <input type="hidden" name="action" value="save"><input type="hidden" name="id" value="${e(selected?.id)}">
          <label>Judul<input name="title" required maxlength="160" value="${e(selected?.title)}"></label>
          <label>Isi catatan<textarea name="body" rows="12" maxlength="10000">${e(selected?.body)}</textarea></label>
          <button>Simpan</button>
        </form>
      </section>
    </div>
  </div><script src="/workroom-private-notes.js" defer></script>`);
}

async function handleWorkroom(request, env, url) {
  if (!env.WORKROOM_ACCESS_AUD || !env.WORKROOM_OWNER_EMAIL ||
      !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.WORKROOM_ACCESS_ISSUER || '') || !env.WORKROOM_DB) {
    return workroomPage('<h1>Workroom</h1><p>Workroom sedang disiapkan.</p>', 503);
  }
  if (!await isWorkroomOwner(request, env)) {
    return workroomPage('<h1>Workroom privat</h1><p>Akses hanya tersedia untuk akun pemilik.</p>', 403);
  }
  if (url.pathname.startsWith(WORKROOM + 'images/')) return workroomImage(request, url, env.WORKROOM_DB);
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

  if (page === 'privateNotes') return workroomPrivateNotes(request, url, env);

  if (page === 'home' && request.method === 'GET' && url.searchParams.has('calendar-data')) {
    const day = url.searchParams.get('calendar-data');
    if (!validWorkroomDay(day)) {
      return Response.json({ error: 'Tanggal tidak valid.' }, {
        status: 400, headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
    return workroomCalendarData(env, day);
  }

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
    note_updated INTEGER,
    note_pinned INTEGER NOT NULL DEFAULT 0
  )`).run();
  if (page === 'home' && request.method === 'GET' && !url.search) {
    return workroomRedirect(url, workroomPages.today.path);
  }
  if (page === 'today') return workroomToday(request, url, env);
  if (request.method === 'POST' || page === 'review') await ensureWorkroomActivity(db);
  if (page === 'review' && request.method === 'GET') return renderWorkroomReview(db, url, env);
  if ((page === 'home' || page === 'note') && url.searchParams.has('notes-data')) {
    return workroomNotesData(request, db);
  }
  if (request.method === 'GET') {
    if (page === 'home' && url.searchParams.has('notes')) {
      url.searchParams.delete('notes');
      return workroomRedirect(url, workroomPages.note.path + url.search);
    }
    if (page === 'note' && !url.searchParams.has('basic')) {
      await ensureWorkroomNotes(db);
      const notes = escapeWorkroom(JSON.stringify(await readWorkroomNotes(db)));
      return workroomPage(`<div id="view" aria-busy="true">Memuat catatan…</div><p id="note-status" role="status"></p><div hidden id="workroom-notes-data">${notes}</div><noscript>Aktifkan JavaScript untuk membuka editor. <a href="?basic">Buka daftar catatan dasar</a></noscript><script type="module" src="/workroom-notes.js"></script>`, 200, page);
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
    const expected = get('expected');
    if (!Object.hasOwn(workroomKinds.task.statuses, status) ||
        (expected && !Object.hasOwn(workroomKinds.task.statuses, expected))) return invalid();
    const task = await db.prepare(`UPDATE workroom_entries SET status = ? WHERE id = ? AND kind = 'task'
      AND (? = '' OR status IN (?, ?)) RETURNING due, status`).bind(status, id, expected, expected, status).first();
    if (request.headers.get('Accept') === 'application/json') {
      return Response.json(task ? { status: task.status } : { error: expected ? 'Status tugas telah berubah. Muat ulang halaman.' : 'Tugas tidak ditemukan.' }, {
        status: task ? 200 : expected ? 409 : 404,
        headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
    const query = new URLSearchParams({saved: '', view: workroomTaskView(get('view') || 'table')});
    if (Object.hasOwn(workroomKinds.task.statuses, get('filter'))) query.set('status', get('filter'));
    let anchor = 'workspace';
    if (query.get('view') === 'daily') {
      if (task) anchor = 'tasks-' + (validWorkroomDay(task.due) ? task.due : 'undated');
    }
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: workroomPages.task.path + '?' + query + '#' + anchor } });
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

  if (page === 'home') return workroomRedirect(url, workroomOverviewUrl + '&saved', 303);
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
