const WORKROOM = '/workroom/';
const workroomKinds = {
  task: { title: 'Tugas', statuses: { active: 'Belum selesai', done: 'Selesai' } },
  project: { title: 'Proyek', statuses: { active: 'Aktif', done: 'Selesai' } },
  note: { title: 'Catatan', statuses: { active: 'Tersimpan' } },
  goal: { title: 'Goals', statuses: { active: 'Sedang berjalan', done: 'Tercapai' } },
};
const privateHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
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

function workroomForm(kind, entry, projects) {
  const e = escapeWorkroom;
  const fields = workroomKinds[kind];
  const statuses = Object.entries(fields.statuses).map(([key, label]) =>
    `<option value="${key}"${entry?.status === key ? ' selected' : ''}>${label}</option>`).join('');
  const projectOptions = projects.map(project =>
    `<option value="${project.id}"${entry?.project_id === project.id ? ' selected' : ''}>${e(project.title)}</option>`).join('');
  return `<form method="post" action="${WORKROOM}">
    <input type="hidden" name="kind" value="${kind}">
    <input type="hidden" name="id" value="${entry?.id ?? ''}">
    <label>Judul<input name="title" required maxlength="160" value="${e(entry?.title)}"></label>
    <label>${kind === 'note' ? 'Isi catatan' : 'Detail'}<textarea name="body" rows="3" maxlength="10000">${e(entry?.body)}</textarea></label>
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

async function renderWorkroom(db, notice, addTask) {
  const e = escapeWorkroom;
  const { results: entries } = await db.prepare('SELECT * FROM workroom_entries ORDER BY id DESC').all();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
  const due = entries.filter(entry => entry.kind === 'task' && entry.status === 'active' && entry.due && entry.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due));
  const projects = entries.filter(entry => entry.kind === 'project');
  const openTasks = entries.filter(entry => entry.kind === 'task' && entry.status === 'active').length;
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
      <nav aria-label="Bagian Workroom"><a href="#hari-ini">Hari ini</a>${Object.entries(workroomKinds).map(([kind, settings]) =>
        `<a href="#${kind}">${settings.title}</a>`).join('')}</nav>
    </aside>
    <div class="dashboard-content">
      ${notice ? '<p class="save-notice" role="status">Perubahan tersimpan.</p>' : ''}
      <section class="today-panel" id="hari-ini">
        <div class="today-heading"><div><p>${e(dateLabel)}</p><h2>Hari ini</h2></div>
          <a class="quick-add" href="/workroom/?add=task#add-task">+ Tambah tugas</a>
        </div>
        ${due.length ? '<ul class="due-list">' + due.map(entry =>
          `<li><a href="#entry-${entry.id}">${e(entry.title)}</a> <time datetime="${e(entry.due)}">${e(entry.due)}</time></li>`).join('') + '</ul>'
          : '<p class="agenda-empty">Tidak ada tugas yang jatuh tempo hari ini atau sudah lewat.</p>'}
      </section>
      <div class="dashboard-stats">
        <a href="#task"><strong>${openTasks}</strong> Tugas terbuka</a>
        <a href="#project"><strong>${activeProjects}</strong> Proyek aktif</a>
        <a href="#goal"><strong>${activeGoals}</strong> Goals aktif</a>
      </div>
      <div class="dashboard-collections">${sections}</div>
    </div></div>`);
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
    project_id INTEGER REFERENCES workroom_entries(id) ON DELETE SET NULL
  )`).run();
  if (request.method === 'GET') return renderWorkroom(db, url.searchParams.has('saved'), url.searchParams.get('add') === 'task');

  const data = await request.formData();
  const get = key => String(data.get(key) ?? '').trim();
  const id = get('id') ? Number(get('id')) : null;
  const kind = get('kind');
  const invalid = () => workroomPage('<h1>Data belum valid</h1><p>Kembali ke formulir untuk memeriksa isian.</p>', 400);
  if (!Object.hasOwn(workroomKinds, kind) || (id !== null && (!Number.isSafeInteger(id) || id < 1))) return invalid();

  if (get('action') === 'delete' && id) {
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

  return new Response(null, { status: 303, headers: { ...privateHeaders, Location: WORKROOM + '?saved#' + kind } });
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
