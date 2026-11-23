const WORKROOM = '/workroom/';
const workroomKinds = {
  task: { title: 'Tugas', statuses: { active: 'Belum mulai', doing: 'Dikerjakan', done: 'Selesai' } },
  project: { title: 'Proyek', statuses: { active: 'Aktif', done: 'Selesai' } },
  note: { title: 'Catatan', statuses: { active: 'Tersimpan' } },
  goal: { title: 'Goals', statuses: { active: 'Sedang berjalan', done: 'Tercapai' } },
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

function workroomPage(content, status = 200) {
  return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Workroom · abangfaisal</title><link rel="stylesheet" href="/workroom.css"></head>
    <body><header><a href="/">abangfaisal.</a><a href="/ruang-belajar/">Ruang Belajar</a></header>
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
  return `<form method="post" action="${WORKROOM}">
    ${standalone ? '<input type="hidden" name="return" value="editor">' : ''}
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

function workroomCalendar(day, tasks, today) {
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
    return `<a href="${href(value)}" class="${value === day ? 'selected ' : ''}${dated.has(value) ? 'marked' : ''}" aria-label="${value}${dated.has(value) ? ', ada tugas' : ''}"${value === today ? ' aria-current="date"' : ''}>${i + 1}</a>`;
  });
  return `<section class="collection calendar"><div class="calendar-heading"><h2>${date.toLocaleDateString('id-ID', {month:'long', year:'numeric', timeZone:'UTC'})}</h2><div>${monthLink(-1,'Bulan sebelumnya','‹')}${monthLink(1,'Bulan berikutnya','›')}</div></div><div class="days">${['Sn','Sl','Rb','Km','Jm','Sb','Mg'].map(d => `<small>${d}</small>`).join('')}${'<span></span>'.repeat((first.getUTCDay()+6)%7)}${cells.join('')}</div></section>`;
}

function workroomWorkspace(entries, params) {
  const e = escapeWorkroom;
  const editLink = entry => `<a href="${WORKROOM}?edit=${entry.id}#workspace">${e(entry.title)}</a>`;
  const view = params.get('view') === 'board' ? 'board' : 'table';
  const q = (params.get('q') || '').trim().slice(0, 160);
  const filter = params.get('status');
  const selected = entries.find(entry => String(entry.id) === params.get('edit'));
  const tasks = entries.filter(entry => entry.kind === 'task' && (!Object.hasOwn(workroomKinds.task.statuses, filter) || entry.status === filter));
  const statuses = Object.entries(workroomKinds.task.statuses);
  const statusForm = entry => `<form class="task-status" method="post" action="${WORKROOM}">
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
    return `<a href="${WORKROOM}?${e(query)}#workspace"${view === key ? ' aria-current="true"' : ''}>${label}</a>`;
  }).join('');
  const search = q ? `<section class="collection"><h2>Hasil pencarian</h2><ul>
    ${entries.filter(entry => (entry.title + ' ' + entry.body).toLocaleLowerCase('id').includes(q.toLocaleLowerCase('id')))
      .map(entry => `<li>${editLink(entry)} · ${workroomKinds[entry.kind].title}</li>`).join('') || '<li>Tidak ada hasil.</li>'}</ul></section>` : '';
  const editor = selected ? `<section class="collection workspace-editor"><h2>${e(selected.title)}</h2>
    ${workroomForm(selected.kind, selected, entries.filter(entry => entry.kind === 'project'), true)}</section>` : '';
  return `<div class="workspace" id="workspace">${search}${editor}<section class="collection">
    <h2>Daftar tugas</h2><div class="workspace-tools">${views}
    <form method="get" action="${WORKROOM}#workspace"><input type="hidden" name="view" value="${view}">
    <select name="status" aria-label="Filter status"><option value="">Semua status</option>
    ${statuses.map(([value, label]) => `<option value="${value}"${filter === value ? ' selected' : ''}>${label}</option>`).join('')}</select>
    <button>Filter</button></form></div>
    ${view === 'board' ? board : table}
    ${view === 'table' && !tasks.length ? '<p>Belum ada tugas untuk filter ini.</p>' : ''}</section></div>`;
}

async function renderWorkroom(db, notice, addTask, selectedDay, params = new URLSearchParams()) {
  const e = escapeWorkroom;
  const { results: entries } = await db.prepare('SELECT * FROM workroom_entries ORDER BY id DESC').all();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
  const validDay = /^(19|20)\d{2}-\d{2}-\d{2}$/.test(selectedDay) && Number.isFinite(Date.parse(selectedDay)) && new Date(selectedDay).toISOString().startsWith(selectedDay);
  const day = validDay ? selectedDay : today;
  const due = entries.filter(entry => entry.kind === 'task' && entry.status !== 'done' && entry.due && (day === today ? entry.due <= today : entry.due === day))
    .sort((a, b) => a.due.localeCompare(b.due));
  const projects = entries.filter(entry => entry.kind === 'project');
  const openTasks = entries.filter(entry => entry.kind === 'task' && entry.status !== 'done').length;
  const activeProjects = projects.filter(project => project.status === 'active').length;
  const activeGoals = entries.filter(entry => entry.kind === 'goal' && entry.status === 'active').length;
  const dateLabel = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'Asia/Makassar' }).format(new Date());
  const sections = Object.entries(workroomKinds).map(([kind, settings]) => `<section class="collection" id="${kind}">
    <h2>${settings.title}</h2>
    <details class="add-entry" id="add-${kind}"${kind === 'task' && addTask ? ' open' : ''}><summary>Tambah ${settings.title.toLowerCase()}</summary>${workroomForm(kind, null, projects)}</details>
    ${entries.filter(entry => entry.kind === kind).map(entry => `<details id="entry-${entry.id}">
      <summary>${e(entry.title)} <small>${settings.statuses[entry.status]}${entry.due ? ' · ' + e(entry.due) : ''}${entry.priority === 'high' ? ' · Prioritas tinggi' : ''}</small></summary>
      ${workroomForm(kind, entry, projects)}
    </details>`).join('')}</section>`).join('');
  return workroomPage(`<div class="dashboard">
    <aside class="dashboard-sidebar">
      <h1>Workroom</h1>
      <form class="workspace-search" method="get" action="${WORKROOM}#workspace"><label>Cari di Workroom<input name="q" type="search" maxlength="160" value="${e((params.get('q') || '').slice(0,160))}"></label><button>Cari</button></form>
      <nav aria-label="Bagian Workroom"><a href="#hari-ini">Hari ini</a><a href="#workspace">Daftar tugas</a>${Object.entries(workroomKinds).map(([kind, settings]) =>
        `<a href="${kind === 'note' ? WORKROOM + '?notes' : '#' + kind}">${settings.title}</a>`).join('')}</nav>
    </aside>
    <div class="dashboard-content">
      ${notice ? '<p class="save-notice" role="status">Perubahan tersimpan.</p>' : ''}
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
        <a href="#task">Tugas terbuka<strong>${openTasks}</strong></a>
        <a href="#project">Proyek aktif<strong>${activeProjects}</strong></a>
        <a href="${WORKROOM}?notes">Catatan<strong>${entries.filter(entry => entry.kind === 'note').length}</strong></a>
        <a href="#goal">Goals aktif<strong>${activeGoals}</strong></a>
      </div>
      <div class="overview" id="agenda">
        <section class="collection agenda"><h2>${day === today ? 'Hari ini' : new Date(day+'T12:00:00Z').toLocaleDateString('id-ID',{day:'numeric',month:'long',timeZone:'UTC'})}</h2>
          ${due.length ? '<ul class="due-list">' + due.map(entry => `<li><form method="post" action="${WORKROOM}"><input type="hidden" name="kind" value="task"><input type="hidden" name="id" value="${entry.id}"><button name="action" value="complete" aria-label="Tandai selesai: ${e(entry.title)}">✓</button></form><div><a href="#entry-${entry.id}">${e(entry.title)}</a><small>${entry.due < today ? 'Lewat tenggat · ' : ''}${e(entry.due)}</small></div></li>`).join('') + '</ul>' : '<p class="agenda-empty">Tidak ada tugas jatuh tempo.</p>'}
          <a class="quick-add" href="/workroom/?add=task#add-task">+ Tambah tugas</a>
          ${day !== today ? '<a class="reset-day" href="/workroom/#agenda">Kembali ke hari ini</a>' : ''}
        </section>
        ${workroomCalendar(day, entries.filter(entry => entry.kind === 'task' && entry.status !== 'done'), today)}
        <section class="collection recent-notes"><h2>Catatan terbaru</h2>
          ${entries.some(entry => entry.kind === 'note') ? '<ul>' + entries.filter(entry => entry.kind === 'note').slice(0,3).map(note =>
            `<li><a href="${WORKROOM}?notes&edit=${note.id}"><strong>${e(note.title)}</strong>${note.body ? '<small>' + e(note.body.slice(0,120)) + '</small>' : ''}</a></li>`).join('') + '</ul>' : '<p>Catatan pertama bisa kamu tulis lewat kolom di atas.</p>'}
          <a href="${WORKROOM}?notes">Semua catatan</a>
        </section>
      </div>
      ${workroomWorkspace(entries, params)}
      <div class="dashboard-collections">${sections}</div>
    </div></div>`);
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

async function handleWorkroom(request, env, url) {
  if (!env.WORKROOM_ACCESS_AUD || !env.WORKROOM_OWNER_EMAIL ||
      !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.WORKROOM_ACCESS_ISSUER || '') || !env.WORKROOM_DB) {
    return workroomPage('<h1>Workroom</h1><p>Workroom sedang disiapkan.</p>', 503);
  }
  if (!await isWorkroomOwner(request, env)) {
    return workroomPage('<h1>Workroom privat</h1><p>Akses hanya tersedia untuk akun pemilik.</p>', 403);
  }
  if (url.pathname === '/workroom') return Response.redirect(new URL(WORKROOM, url), 308);
  if (url.pathname !== WORKROOM) return workroomPage('<h1>Halaman tidak ditemukan</h1>', 404);
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
  if (url.searchParams.has('notes-data')) return workroomNotesData(request, db);
  if (request.method === 'GET' && url.searchParams.has('notes')) {
    return workroomPage('<div id="view" aria-busy="true">Memuat catatan…</div><p id="note-status" role="status"></p><noscript>Aktifkan JavaScript untuk membuka editor. <a href="/workroom/#note">Buka daftar catatan dasar</a></noscript><script src="/workroom-notes.js" defer></script>');
  }
  if (request.method === 'GET') return renderWorkroom(db, url.searchParams.has('saved'), url.searchParams.get('add') === 'task', url.searchParams.get('day'), url.searchParams);

  const data = await request.formData();
  const get = key => String(data.get(key) ?? '').trim();
  const id = get('id') ? Number(get('id')) : null;
  const kind = get('kind');
  const invalid = () => workroomPage('<h1>Data belum valid</h1><p>Kembali ke formulir untuk memeriksa isian.</p>', 400);
  if (!Object.hasOwn(workroomKinds, kind) || (id !== null && (!Number.isSafeInteger(id) || id < 1))) return invalid();

  if (get('action') === 'status' && kind === 'task' && id) {
    const status = get('status');
    if (!Object.hasOwn(workroomKinds.task.statuses, status)) return invalid();
    await db.prepare("UPDATE workroom_entries SET status = ? WHERE id = ? AND kind = 'task'").bind(status, id).run();
    const query = new URLSearchParams({saved: '', view: get('view') === 'board' ? 'board' : 'table'});
    if (Object.hasOwn(workroomKinds.task.statuses, get('filter'))) query.set('status', get('filter'));
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: WORKROOM + '?' + query + '#workspace' } });
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

  return new Response(null, { status: 303, headers: { ...privateHeaders, Location: get('return') === 'editor' && get('action') === 'save' && id
    ? WORKROOM + '?saved&edit=' + id + '#workspace' : WORKROOM + '?saved#' + kind } });
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
