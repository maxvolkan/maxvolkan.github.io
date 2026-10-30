// The journal CMS: write, preview, publish and crosspost posts from a browser.
//   node tools/cms.mjs          → http://localhost:4321 (this machine only; PORT=… to change)
// It edits posts/ like any editor would, so saves from neovim show up in it live. The preview is the real
// post page, rendered as you type. [publish…] builds, commits and pushes main, then says when it's live.
//
// Setup on the lab PC (Windows, once), so the phone can use it too:
//  1. Install Node.js LTS, Git for Windows and Tailscale; sign in to Tailscale on the PC and the phone.
//  2. git clone https://github.com/maxvolkan/maxvolkan.github.io, then in its tools/ folder:
//     npm ci --omit=dev
//     git config --global user.name "…" and user.email "…" (commits need them)
//     Push once by hand (any small commit, or `git push` when there's one) so Git remembers your login.
//  3. Copy tools/.secrets.json over from this PC (the LinkedIn app keys).
//  4. tailscale serve --bg 4321   → https://<pc name>.<tailnet>.ts.net, reachable only by your own devices.
//     Never `tailscale funnel`: that would put this on the public internet.
//  5. Start it with Windows: Task Scheduler → Create Task → trigger "At log on" → action
//     node.exe with argument C:\path\to\maxvolkan.github.io\tools\cms.mjs
//  6. Add https://<pc name>.<tailnet>.ts.net/api/linkedin/callback to the LinkedIn app's redirect URLs.
//  7. On the phone open that address, then Share → Add to Home Screen.
// Keep using one CMS (the lab PC's) for everything, so posts only ever change in one place.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  ROOT, POSTS, SITE, SUBSTACK, parseFrontMatter, stringifyFrontMatter, slugify, readPost, renderPostPage, ditherCover,
  coverSource, build, newPost, isLive, crossposted, markCrossposted, linkedinToken, linkedinAuthUrl, linkedinFinish,
  linkedinPayload, linkedinVersion, sendLinkedin, substackHtml,
} from './publish.mjs';

const PORT = Number(process.env.PORT) || 4321;
const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const UI = path.join(TOOLS, 'cms');
const CACHE = path.join(TOOLS, 'out', 'cache');
const PUBLISHED = ['posts', 'journal', 'feed.xml', 'index.html'];  // all that [publish] ever commits
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', json: 'application/json', xml: 'application/xml', txt: 'text/plain; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2', pdf: 'application/pdf' };
const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;

// ───────── helpers ─────────
class Http extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new Http(status, msg); };
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const run = promisify(execFile);
// git in the repo; never waits on a password prompt, and its own message is the error
const git = (...args) => run('git', args, { cwd: ROOT, maxBuffer: 1 << 26, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  .then((r) => r.stdout, (e) => { throw new Error(e.stderr?.trim() || e.message); });

const send = (res, status, body, type = TYPES.json) => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === TYPES.json ? JSON.stringify(body) : body);
};
function serveFile(res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(404, 'not found');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}
// a path under base from a URL; never outside it, never a dotfile (.git, .secrets.json) or tools/
function inside(base, rel) {
  const file = path.resolve(base, decodeURIComponent(rel));
  const parts = path.relative(ROOT, file).split(path.sep);
  if (!file.startsWith(base + path.sep) || parts.some((s) => s.startsWith('.')) || parts[0] === 'tools') fail(403, 'not allowed');
  return file;
}
const readBody = (req, limit) => new Promise((ok, no) => {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => { size += c.length; if (size > limit) { no(new Http(413, 'too big')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => ok(Buffer.concat(chunks)));
  req.on('error', no);
});
const readJSON = async (req) => { try { return JSON.parse((await readBody(req, 1 << 20)).toString() || '{}'); } catch (e) { throw e instanceof Http ? e : new Http(400, 'bad JSON'); } };
const mdFile = (slug) => path.join(POSTS, slug + '.md');
const slugArg = (s) => SLUG.test(s ?? '') ? s : fail(400, `bad post name "${s}"`);
const existing = (s) => fs.existsSync(mdFile(slugArg(s))) ? s : fail(404, `no post "${s}"`);

// ───────── what's on GitHub ─────────
// live = posts whose page is on origin/main; changed = post files that differ from it (edited, new or untracked)
let fetchedAt = 0;
async function remote() {
  if (Date.now() - fetchedAt > 60_000) { fetchedAt = Date.now(); await git('fetch', '-q', 'origin').catch(() => {}); }
  const tree = await git('ls-tree', '-r', '--name-only', 'origin/main', '--', 'journal').catch(() => '');
  const live = new Set(tree.split('\n').map((f) => f.split('/')[1]).filter((s) => s && s !== 'index.html'));
  const changed = ((await git('diff', '--name-only', 'origin/main', '--', 'posts').catch(() => '')) + (await git('ls-files', '--others', '--exclude-standard', '--', 'posts'))).split('\n').filter(Boolean);
  return { live, changed };
}

async function listPosts() {
  const { live, changed } = await remote();
  const done = crossposted();
  return fs.readdirSync(POSTS).filter((f) => f.endsWith('.md')).map((f) => {
    const slug = f.slice(0, -3), { meta } = parseFrontMatter(fs.readFileSync(path.join(POSTS, f), 'utf8'));
    const draft = meta.draft === 'true', pushed = live.has(slug);
    const edited = changed.some((c) => c === `posts/${f}` || c.startsWith(`posts/${slug}/`));
    const state = draft ? (pushed ? 'coming down' : 'draft') : !pushed ? 'ready' : edited ? 'edited' : 'live';
    return { slug, title: meta.title || slug, date: meta.date || '', state, pushed, crossposted: done[slug] ?? {} };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function getPost(slug) {
  const dir = path.join(POSTS, slug);
  return { ...parseFrontMatter(fs.readFileSync(mdFile(slug), 'utf8')), images: fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => IMAGE.test(f)) : [] };
}

// ───────── preview: /site/… is the repo, except journal/<slug>/ which is rendered from posts/ right now ─────────
async function preview(res, rel) {
  const m = rel.match(/^journal\/([a-z0-9-]+)\/(.*)$/);
  if (!m || !fs.existsSync(mdFile(m[1]))) return serveFile(res, inside(ROOT, rel));
  const [, slug, file] = m;
  if (file === '' || file === 'index.html') {
    try { return send(res, 200, renderPostPage(readPost(slug)), TYPES.html); }
    catch (e) { return send(res, 200, `<body style="background:#121211;color:#d9d3c5;font:16px monospace;padding:32px">${esc(e.message)}</body>`, TYPES.html); }
  }
  if (file === 'cover.png') return serveFile(res, await cachedCover(slug));
  serveFile(res, inside(path.join(POSTS, slug), file));
}

// the dithered cover, made once per source picture (the dither takes a moment, the preview reloads a lot)
async function cachedCover(slug) {
  const p = readPost(slug);
  const src = p.meta.cover ? path.join(p.dir, p.meta.cover) : '';
  if (src && !fs.existsSync(src)) fail(404, `cover ${p.meta.cover} isn't in posts/${slug}/`);
  const key = crypto.createHash('sha1').update(`${slug}|${src}|${src && fs.statSync(src).mtimeMs}`).digest('hex').slice(0, 16);
  const file = path.join(CACHE, key + '.png');
  if (!fs.existsSync(file)) { fs.mkdirSync(CACHE, { recursive: true }); await ditherCover(coverSource(p), file); }
  return file;
}

// ───────── live updates: every change under posts/ (from here or neovim) → the open pages ─────────
const clients = new Set();
const pending = new Set();
let timer;
fs.watch(POSTS, { recursive: true }, (_, file) => {
  if (!file) return;
  pending.add(file.split(/[\\/]/)[0].replace(/\.md$/, ''));
  clearTimeout(timer);
  timer = setTimeout(() => {
    for (const c of clients) c.write(`data: ${JSON.stringify([...pending])}\n\n`);
    pending.clear();
  }, 150);
});

// ───────── uploads: phone photos come in big, rotated and with GPS in them ─────────
async function upload(slug, req) {
  const buf = await readBody(req, 25 << 20);
  let name = 'image';
  try { name = decodeURIComponent(req.headers['x-name'] ?? name); } catch {}
  const base = path.basename(name).toLowerCase().replace(/\.[^.]*$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image';
  const info = await sharp(buf, { animated: true }).metadata().catch(() => fail(400, 'that file isn\'t an image this can read (try a JPEG or PNG)'));
  const ext = { png: 'png', webp: 'webp', gif: 'gif' }[info.format] ?? 'jpg';
  const dir = path.join(POSTS, slug);
  fs.mkdirSync(dir, { recursive: true });
  name = `${base}.${ext}`;
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${base}-${i}.${ext}`;
  // re-encoding upright and at most 2000px drops the EXIF block, GPS location included; animations stay as they are
  if ((info.pages ?? 1) > 1) fs.writeFileSync(path.join(dir, name), buf);
  else {
    const img = sharp(buf).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true });
    await { jpg: () => img.jpeg({ quality: 85 }), png: () => img.png(), webp: () => img.webp({ quality: 85 }), gif: () => img.gif() }[ext]().toFile(path.join(dir, name));
  }
  return { name, markdown: `![](${slug}/${name})` };
}

// ───────── publishing ─────────
// build, then list what would be committed and which posts go live, change or come down
async function publishPlan() {
  const branch = (await git('branch', '--show-current')).trim();
  if (branch !== 'main') fail(409, `the CMS publishes from main, and this copy of the site is on "${branch}"`);
  await git('pull', '-q', '--rebase', '--autostash').catch((e) => fail(409, 'git pull failed: ' + e.message));
  fetchedAt = Date.now();
  const built = new Set((await build()).map((p) => p.slug));
  const files = (await git('status', '--porcelain', '--untracked-files=all', '--', ...PUBLISHED)).split('\n').filter(Boolean);
  const { live } = await remote();
  const touched = new Set(files.map((l) => l.slice(3).split('/')).filter((f) => f[0] === 'journal' && f.length > 2).map((f) => f[1]));
  return {
    files,
    new: [...built].filter((s) => !live.has(s)),
    updated: [...touched].filter((s) => built.has(s) && live.has(s)),
    removed: [...live].filter((s) => !built.has(s)),
  };
}

async function publishGo(confirmed) {
  const plan = await publishPlan();
  if (!plan.files.length) fail(409, 'nothing to publish');
  if (JSON.stringify(plan.files) !== JSON.stringify(confirmed)) fail(409, 'something changed since you looked; look again');
  const title = (s) => `"${readPost(s).meta.title}"`;
  const what = [...plan.new.map((s) => 'publish ' + title(s)), ...plan.updated.map((s) => 'update ' + title(s)), ...plan.removed.map((s) => 'take down ' + s)];
  await git('add', '-A', '--', ...PUBLISHED);
  await git('commit', '-q', '-m', 'journal: ' + (what.join(', ') || 'rebuild'));
  await git('push', '-q', 'origin', 'HEAD');
  fetchedAt = 0;
  return { ...plan, commit: (await git('rev-parse', '--short', 'HEAD')).trim() };
}

// is GitHub Pages serving this post's page as just built (or, for a taken-down post, not at all)?
async function upToDate(slug) {
  const local = path.join(ROOT, 'journal', slug, 'index.html');
  const res = await fetch(`${SITE}/journal/${slug}/?t=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
  if (!res) return false;
  if (!fs.existsSync(local)) return res.status === 404;
  return res.ok && (await res.text()) === fs.readFileSync(local, 'utf8');
}

// ───────── crossposting ─────────
const logins = new Map();  // LinkedIn login state → the redirect URL it was started with
async function crosspost(slug, { target, send: really, origin }) {
  const p = readPost(slug);
  const guard = async () => {
    if (crossposted()[slug]?.[target]) fail(409, `already on ${target}`);
    if (!(await isLive(slug))) fail(409, 'the post isn\'t live yet; publish it first');
  };
  if (target === 'linkedin') {
    if (!really) return { request: `POST https://api.linkedin.com/rest/posts (LinkedIn-Version ${linkedinVersion()})`, payload: linkedinPayload(p) };
    await guard();
    const li = linkedinToken();
    if (!li) {
      if (!/^https?:\/\/[^/]+$/.test(origin ?? '')) fail(400, 'bad origin');
      const state = crypto.randomUUID();
      logins.set(state, `${origin}/api/linkedin/callback`);
      return { login: linkedinAuthUrl(logins.get(state), state) };
    }
    const id = await sendLinkedin(p, li);
    markCrossposted(slug, 'linkedin');
    return { posted: id };
  }
  if (target === 'substack') {
    if (!really) return { html: substackHtml(p), editor: SUBSTACK };
    await guard();
    markCrossposted(slug, 'substack');  // "really" here means: it's pasted into Substack
    return { ok: true };
  }
  fail(400, `unknown target "${target}"`);
}

async function linkedinCallback(url, res) {
  const redirect = logins.get(url.searchParams.get('state')) ?? fail(400, 'that LinkedIn login expired; try again from the CMS');
  logins.delete(url.searchParams.get('state'));
  if (!url.searchParams.get('code')) fail(400, 'LinkedIn: ' + url.searchParams.get('error_description'));
  await linkedinFinish(url.searchParams.get('code'), redirect);
  res.writeHead(302, { Location: '/?linkedin=connected' }).end();
}

// ───────── posts: new, save, rename, delete ─────────
function savePost(slug, { meta, body }) {
  if (!meta || typeof meta !== 'object' || typeof body !== 'string') fail(400, 'needs meta and body');
  const text = stringifyFrontMatter(Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, String(v)])), body);
  if (text !== fs.readFileSync(mdFile(slug), 'utf8')) fs.writeFileSync(mdFile(slug), text);
  return { ok: true };
}

// renaming or deleting a post that's on the site would break its link (and any crossposts); to take one down, make it a draft
async function notPushed(slug) {
  if ((await remote()).live.has(slug)) fail(409, 'this post is on the site, so its link has to stay; tick draft to take it down instead');
}

async function rename({ from, to }) {
  from = existing(from);
  to = slugArg(slugify(to ?? ''));
  await notPushed(from);
  if (fs.existsSync(mdFile(to)) || fs.existsSync(path.join(POSTS, to))) fail(409, `"${to}" already exists`);
  fs.writeFileSync(mdFile(to), fs.readFileSync(mdFile(from), 'utf8').replaceAll(`](${from}/`, `](${to}/`));
  fs.rmSync(mdFile(from));
  if (fs.existsSync(path.join(POSTS, from))) fs.renameSync(path.join(POSTS, from), path.join(POSTS, to));
  return { slug: to };
}

async function remove(slug) {
  await notPushed(slug);
  fs.rmSync(mdFile(slug));
  fs.rmSync(path.join(POSTS, slug), { recursive: true, force: true });
  return { ok: true };
}

// ───────── server ─────────
// Only this machine can connect (Tailscale serve forwards your devices in). Anything that changes something must
// carry an X-CMS header, which a page on another site can't add without a CORS preflight this server never allows.
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://cms');
    const p = url.pathname;
    let m;
    if (req.method === 'GET') {
      if (p === '/') return serveFile(res, path.join(UI, 'index.html'));
      if (p === '/editor.js') return serveFile(res, path.join(UI, 'editor.js'));
      if (p.startsWith('/site/')) return await preview(res, p.slice(6));
      if (p === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
        res.write(': hi\n\n');
        clients.add(res);
        return req.on('close', () => clients.delete(res));
      }
      if (p === '/api/posts') return send(res, 200, await listPosts());
      if ((m = p.match(/^\/api\/post\/([^/]+)$/))) return send(res, 200, getPost(existing(m[1])));
      if ((m = p.match(/^\/api\/live\/([^/]+)$/))) return send(res, 200, { live: await upToDate(slugArg(m[1])) });
      if (p === '/api/linkedin/callback') return await linkedinCallback(url, res);
      fail(404, 'not found');
    }
    if (req.headers['x-cms'] !== '1') fail(403, 'missing X-CMS header');
    if (req.method === 'PUT' && (m = p.match(/^\/api\/post\/([^/]+)$/))) return send(res, 200, savePost(existing(m[1]), await readJSON(req)));
    if (req.method === 'DELETE' && (m = p.match(/^\/api\/post\/([^/]+)$/))) return send(res, 200, await remove(existing(m[1])));
    if (req.method === 'POST') {
      if (p === '/api/new') { const { title } = await readJSON(req); try { return send(res, 200, { slug: newPost(title) }); } catch (e) { fail(400, e.message); } }
      if (p === '/api/rename') return send(res, 200, await rename(await readJSON(req)));
      if ((m = p.match(/^\/api\/upload\/([^/]+)$/))) return send(res, 200, await upload(existing(m[1]), req));
      if (p === '/api/publish/plan') return send(res, 200, await publishPlan());
      if (p === '/api/publish/go') return send(res, 200, await publishGo((await readJSON(req)).files));
      if ((m = p.match(/^\/api\/crosspost\/([^/]+)$/))) return send(res, 200, await crosspost(existing(m[1]), await readJSON(req)));
    }
    fail(404, 'not found');
  } catch (e) {
    if (!(e instanceof Http)) console.error(e);
    if (!res.headersSent) send(res, e instanceof Http ? e.status : 500, { error: e.message });
    else res.end();
  }
});

await git('pull', '-q', '--rebase', '--autostash').catch((e) => console.log('(git pull skipped: ' + e.message.split('\n')[0] + ')'));
server.listen(PORT, '127.0.0.1', () => console.log(`journal CMS on http://localhost:${PORT}`));
