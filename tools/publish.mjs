// Journal: write posts as posts/<slug>.md (images next to it in posts/<slug>/), then from the repo root:
//   node tools/publish.mjs new "My title"          start posts/<slug>.md from a template (as a draft)
//   node tools/publish.mjs                         build journal/, feed.xml and the journal rows on index.html
//   node tools/publish.mjs --drafts                ...including draft posts, to preview at localhost
//                                                  (run it again without --drafts before committing)
//   node tools/publish.mjs crosspost <slug> [--dry-run]
//       after the post is pushed and live: posts it to the targets in its `crosspost:` line, once each
//       (posts/.crossposted.json remembers). --dry-run shows what would be sent and sends nothing.
//
// journal/ and feed.xml are generated: every build wipes and rewrites them, so edit posts/, not those.
//
// LinkedIn setup (once): create an app at https://www.linkedin.com/developers/apps (LinkedIn makes you link
// it to a Page; a placeholder Page is fine), add the products "Share on LinkedIn" and "Sign In with LinkedIn
// using OpenID Connect", add the redirect URL http://localhost:8787/callback, then put its keys in
// tools/.secrets.json (gitignored): {"linkedin": {"client_id": "…", "client_secret": "…"}}
// The first crosspost opens a LinkedIn login in your browser; the token lasts ~60 days, then it asks again.
// Substack has no API, so its crosspost copies a paste-ready version and opens the Substack editor.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';
import sharp from 'sharp';

const SITE = 'https://maxvolkan.github.io';
const SUBSTACK = 'https://maxreformed.substack.com/publish/post';
const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(TOOLS, '..');
const POSTS = path.join(ROOT, 'posts');
const OUT = path.join(ROOT, 'journal');
const SECRETS = path.join(TOOLS, '.secrets.json');
const CROSSPOSTED = path.join(POSTS, '.crossposted.json');
const PORT = 8787, REDIRECT = `http://localhost:${PORT}/callback`;

// ───────── small helpers ─────────
const die = (msg) => { console.error(msg); process.exit(1); };
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const readJSON = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
const writeJSON = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');
const dotDate = (d) => d.replaceAll('-', '.');

export const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-');

// "---\nkey: value\n---\nbody" → { meta, body }. Only flat `key: value` lines; the value is everything after the first colon.
export function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

// relative src/href → absolute (feeds and Substack need full URLs)
export const absolutize = (html, base) => html.replace(/\b(src|href)="(?![a-z][\w+.-]*:|#)([^"]*)"/gi, (_, attr, url) => `${attr}="${new URL(url, base)}"`);

// LinkedIn post text is "little text": these characters mean markup and must be backslash-escaped
export const little = (s) => s.replace(/[\\|{}@[\]()<>#*_~]/g, '\\$&');

// ───────── posts ─────────
function readPosts({ drafts }) {
  if (!fs.existsSync(POSTS)) return [];
  return fs.readdirSync(POSTS).filter((f) => f.endsWith('.md')).map((f) => {
    const slug = f.slice(0, -3);
    const { meta, body } = parseFrontMatter(fs.readFileSync(path.join(POSTS, f), 'utf8'));
    if (!meta.title || !/^\d{4}-\d{2}-\d{2}$/.test(meta.date ?? '')) die(`posts/${f}: needs a title and a date like 2026-10-30`);
    return { slug, meta, html: marked.parse(body), dir: path.join(POSTS, slug) };
  }).filter((p) => drafts || p.meta.draft !== 'true').sort((a, b) => b.meta.date.localeCompare(a.meta.date));
}

// The site's own look for covers: grey → 4x4 Bayer dither → the concrete palette from styles.css, at 2px pixels.
const PALETTE = [...fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').matchAll(/--c(\d):\s*#([0-9a-f]{6})/gi)]
  .sort((a, b) => a[1] - b[1]).map((m) => m[2].match(/../g).map((h) => parseInt(h, 16)));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
async function ditherCover(input, dest) {
  const { data, info } = await input.resize({ width: 480 }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const n = PALETTE.length, out = Buffer.alloc(info.width * info.height * 3);
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = y * info.width + x;
    const v = data[i * info.channels] / 255 + (BAYER[(y % 4) * 4 + (x % 4)] / 16 + 1 / 32 - 0.5) / (n - 1);
    out.set(PALETTE[Math.min(n - 1, Math.max(0, Math.round(v * (n - 1))))], i * 3);
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } })
    .resize({ width: info.width * 2, kernel: 'nearest' }).png({ palette: true }).toFile(dest);
}

// No cover? Use a frame of the brain turntable, a different angle per post.
function brainFrame(slug) {
  const k = [...slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 64;
  return sharp(path.join(ROOT, 'assets/brain/brain.jpg')).extract({ left: (k % 8) * 448, top: Math.floor(k / 8) * 336, width: 448, height: 336 });
}

// ───────── pages ─────────
const head = (title, desc, image, url, depth) => `<!DOCTYPE html>
<html lang="en">

<head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${esc(title)}</title>
        <meta name="description" content="${esc(desc)}">
        <meta property="og:title" content="${esc(title)}">
        <meta property="og:description" content="${esc(desc)}">
        <meta property="og:url" content="${url}">
        ${image ? `<meta property="og:image" content="${image}">` : ''}
        <link rel="alternate" type="application/atom+xml" title="Maxwell Volkan · journal" href="${SITE}/feed.xml">
        <link rel="stylesheet" href="${depth}styles.css">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=M+PLUS+1+Code:wght@400;700&display=swap" rel="stylesheet">
</head>
`;

const foot = (depth) => `
        <div id="cursor"></div>
        <script src="${depth}script.js"></script>
</body>

</html>
`;

const postPage = (p, cover) => head(`${p.meta.title} · Maxwell Volkan`, p.meta.summary, `${SITE}/journal/${p.slug}/${cover}`, `${SITE}/journal/${p.slug}/`, '../../') + `
<body class="journal">
        <button class="corner-btn top-left" id="homebtn">[ * ]</button>
        <a class="corner-btn top-right" href="../">[ journal ]</a>

        <article class="post">
                <header class="zine">
                        <img class="zine-cover" src="${cover}" alt="">
                        <h1 class="zine-title">${esc(p.meta.title)}</h1>
                        ${p.meta.title_ja ? `<p class="zine-ja" lang="ja">${esc(p.meta.title_ja)}</p>` : ''}
                </header>
                <p class="post-meta"><span class="mini-meta">${dotDate(p.meta.date)}</span> ${esc(p.meta.summary)}</p>
                <div class="post-body">
${p.html}
                </div>
                <footer class="post-foot"><a href="../">← journal</a></footer>
        </article>
` + foot('../../');

const indexPage = (posts) => head('journal · Maxwell Volkan', 'Notes on research, games and things in between.', '', `${SITE}/journal/`, '../') + `
<body class="journal">
        <button class="corner-btn top-left" id="homebtn">[ * ]</button>

        <main class="journal-index">
                <h1 class="name">journal/</h1>
                <p class="role">notes on research, games and things in between · <a href="../feed.xml">[rss]</a></p>
                <div class="zines">
${posts.map((p) => `                        <a class="zine-card" href="${p.slug}/">
                                <img src="${p.slug}/${p.cover}" alt="">
                                <span class="zine-card-title">${esc(p.meta.title)}</span>
                                <span class="mini-meta">${dotDate(p.meta.date)}</span>
                                <span class="card-desc">${esc(p.meta.summary)}</span>
                        </a>`).join('\n') || '                        <p class="role">nothing here yet.</p>'}
                </div>
        </main>
` + foot('../');

const feed = (posts) => `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Maxwell Volkan · journal</title>
  <link href="${SITE}/journal/"/>
  <link rel="self" href="${SITE}/feed.xml"/>
  <id>${SITE}/journal/</id>
  <updated>${posts[0]?.meta.date ?? '2026-01-01'}T00:00:00Z</updated>
  <author><name>Maxwell Volkan</name></author>
${posts.map((p) => {
  const url = `${SITE}/journal/${p.slug}/`;
  return `  <entry>
    <title>${esc(p.meta.title)}</title>
    <link href="${url}"/>
    <id>${url}</id>
    <updated>${p.meta.date}T00:00:00Z</updated>
    <summary>${esc(p.meta.summary)}</summary>
    <content type="html">${esc(absolutize(p.html, url))}</content>
  </entry>`;
}).join('\n')}
</feed>
`;

// index.html keeps two generated regions between marker comments: the newest posts at the top of the news
// panel, and a journal/ row in the folder list (only once there's a post)
const between = (html, name, content) => {
  const re = new RegExp(`(<!-- journal:${name}:start -->)[\\s\\S]*?(<!-- journal:${name}:end -->)`);
  if (!re.test(html)) die(`index.html lost its <!-- journal:${name}:start/end --> markers`);
  return html.replace(re, (_, a, b) => a + content + b);
};
function updateIndex(posts) {
  const file = path.join(ROOT, 'index.html');
  let html = between(fs.readFileSync(file, 'utf8'), 'news', posts.slice(0, 3).map((p) =>
    `\n                                <li><span class="mini-meta">${dotDate(p.meta.date).slice(0, 7)}</span><a href="journal/${p.slug}/"${p.meta.title_ja ? ` data-ja="${esc(p.meta.title_ja)}"` : ''}>${esc(p.meta.title)}</a></li>`).join('') + (posts.length ? '\n                                ' : ''));
  const latest = posts[0];
  html = between(html, 'folder', latest ? `
                        <a class="icon" href="journal/" style="--i:4">
                                <canvas width="24" height="24" data-src="journal/${latest.slug}/${latest.cover}"></canvas>
                                <span class="icon-label" data-ja="日誌/">journal/</span>
                                <span class="icon-meta" data-ja="${posts.length}件" data-peek="latest: ${esc(latest.meta.title)}" data-peek-ja="最新: ${esc(latest.meta.title_ja || latest.meta.title)}">${posts.length} post${posts.length > 1 ? 's' : ''}</span>
                        </a>
                        ` : '');
  fs.writeFileSync(file, html);
}

async function build({ drafts }) {
  const posts = readPosts({ drafts });
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const p of posts) {
    const dir = path.join(OUT, p.slug);
    fs.mkdirSync(dir, { recursive: true });
    // a hand-made cover_art is used as is; a cover photo (or the brain) gets dithered
    if (p.meta.cover_art) p.cover = p.meta.cover_art;
    else {
      p.cover = 'cover.png';
      await ditherCover(p.meta.cover ? sharp(path.join(p.dir, p.meta.cover)) : brainFrame(p.slug), path.join(dir, p.cover));
    }
    if (fs.existsSync(p.dir)) fs.cpSync(p.dir, dir, { recursive: true, filter: (src) => path.basename(src) !== p.meta.cover });  // the post's images (not the undithered cover)
    fs.writeFileSync(path.join(dir, 'index.html'), postPage(p, p.cover));
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'index.html'), indexPage(posts));
  fs.writeFileSync(path.join(ROOT, 'feed.xml'), feed(posts));
  updateIndex(posts);
  console.log(`built ${posts.length} post${posts.length === 1 ? '' : 's'}${drafts ? ' (drafts included: rebuild without --drafts before committing)' : ''}`);
}

function newPost(title) {
  if (!title) die('usage: node tools/publish.mjs new "My title"');
  const slug = slugify(title), file = path.join(POSTS, slug + '.md');
  if (fs.existsSync(file)) die(`posts/${slug}.md already exists`);
  fs.mkdirSync(path.join(POSTS, slug), { recursive: true });
  fs.writeFileSync(file, `---
title: ${title}
title_ja:
date: ${new Date().toISOString().slice(0, 10)}
summary: one line for the cards, the feed and LinkedIn
cover:
draft: true
crosspost: linkedin, substack
---

Write in Markdown. Images go in posts/${slug}/ and are linked like ![what it shows](photo.jpg).
Set \`cover: photo.jpg\` for a dithered cover (empty = a frame of the brain), or \`cover_art: art.png\`
for a cover you designed yourself (used as is). Delete \`draft: true\` when it's ready.
`);
  console.log(`wrote posts/${slug}.md (put its images in posts/${slug}/)`);
}

// ───────── crossposting ─────────
function openInBrowser(url) {
  try { execFileSync('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${url.replaceAll("'", "''")}'`]); }
  catch { console.log('open this in your browser:', url); }
}

async function linkedinLogin() {
  const secrets = readJSON(SECRETS, {});
  const li = secrets.linkedin;
  if (!li?.client_id || !li?.client_secret) die('add {"linkedin": {"client_id": "…", "client_secret": "…"}} to tools/.secrets.json (setup notes at the top of tools/publish.mjs)');
  if (li.token && li.expires > Date.now() + 60_000) return li;
  // OAuth authorization-code flow: LinkedIn sends the browser back to a one-shot server here with a code
  const state = crypto.randomUUID();
  const code = await new Promise((ok, fail) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, REDIRECT);
      if (u.pathname !== '/callback') return res.end();
      res.end('LinkedIn connected, you can close this tab.');
      server.close();
      if (u.searchParams.get('state') !== state) fail(new Error('LinkedIn login: state mismatch'));
      else if (u.searchParams.get('code')) ok(u.searchParams.get('code'));
      else fail(new Error('LinkedIn login: ' + u.searchParams.get('error_description')));
    }).listen(PORT);  // all interfaces, so the Windows browser reaches it through WSL's localhost forwarding
    openInBrowser('https://www.linkedin.com/oauth/v2/authorization?' + new URLSearchParams({ response_type: 'code', client_id: li.client_id, redirect_uri: REDIRECT, scope: 'openid profile w_member_social', state }));
  });
  const tok = await (await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: li.client_id, client_secret: li.client_secret }),
  })).json();
  if (!tok.access_token) die('LinkedIn token: ' + JSON.stringify(tok));
  const me = await (await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: 'Bearer ' + tok.access_token } })).json();
  Object.assign(li, { token: tok.access_token, expires: Date.now() + tok.expires_in * 1000, author: 'urn:li:person:' + me.sub });
  writeJSON(SECRETS, { ...secrets, linkedin: li });
  return li;
}

// ponytail: LinkedIn wants a monthly API version (YYYYMM) it still supports (~12 months); two months back is safe
const linkedinVersion = () => { const d = new Date(); d.setMonth(d.getMonth() - 2); return d.toISOString().slice(0, 7).replace('-', ''); };

async function toLinkedin(p, url, dryRun) {
  const post = {
    author: 'urn:li:person:<you>',
    commentary: little(`${p.meta.title}\n\n${p.meta.summary}`),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { article: { source: url, title: p.meta.title, description: p.meta.summary } },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
  if (dryRun) return console.log(`LinkedIn: would POST https://api.linkedin.com/rest/posts (LinkedIn-Version ${linkedinVersion()})\n${JSON.stringify(post, null, 2)}`);
  const li = await linkedinLogin();
  post.author = li.author;
  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + li.token, 'LinkedIn-Version': linkedinVersion(), 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' },
    body: JSON.stringify(post),
  });
  if (res.status !== 201) die(`LinkedIn said ${res.status}: ${await res.text()}`);
  console.log('LinkedIn: posted', res.headers.get('x-restli-id'));
}

async function toSubstack(p, url, dryRun) {
  const html = `<h1>${esc(p.meta.title)}</h1>\n<p><em>${esc(p.meta.summary)}</em></p>\n${absolutize(p.html, url)}\n<p>Originally published at <a href="${url}">${url}</a></p>\n`;
  const file = path.join(TOOLS, 'out', `substack-${p.slug}.html`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `<!DOCTYPE html>\n<meta charset="utf-8">\n${html}`);
  if (dryRun) return console.log('Substack: wrote', path.relative(ROOT, file), '(nothing copied or opened)');
  // rich-text clipboard, so pasting into Substack's editor keeps headings, links and images
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Set-Clipboard -AsHtml -Value (Get-Content -Raw -Encoding UTF8 '${execFileSync('wslpath', ['-w', file]).toString().trim()}')`]);
    console.log('Substack: the post is on your clipboard; paste it into the editor that just opened, check it, publish.');
  } catch {
    console.log(`Substack: couldn't reach the Windows clipboard; open ${file} in a browser, select all, copy, paste into the editor.`);
  }
  openInBrowser(SUBSTACK);
}

async function crosspost(slug, dryRun) {
  // a dry run can look at drafts too, so you can check a post before publishing it
  const p = readPosts({ drafts: dryRun }).find((x) => x.slug === slug) ?? die(`no published post "${slug}" (drafts can only be --dry-run)`);
  const url = `${SITE}/journal/${slug}/`;
  if (!dryRun) {
    const res = await fetch(url, { method: 'HEAD' }).catch(() => ({ ok: false, status: 'offline' }));
    if (!res.ok) die(`${url} isn't live (${res.status}). Build, commit and push first, then crosspost.`);
  }
  const done = readJSON(CROSSPOSTED, {});
  for (const target of (p.meta.crosspost ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (done[slug]?.[target]) { console.log(`${target}: already posted ${done[slug][target]}, skipping`); continue; }
    if (target === 'linkedin') await toLinkedin(p, url, dryRun);
    else if (target === 'substack') await toSubstack(p, url, dryRun);
    else { console.log(`unknown crosspost target "${target}"`); continue; }
    if (!dryRun) { (done[slug] ??= {})[target] = new Date().toISOString().slice(0, 10); writeJSON(CROSSPOSTED, done); }
  }
}

// ───────── cli ─────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {  // run as a CLI, not when imported by the test
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'new') newPost(rest.join(' '));
  else if (cmd === 'crosspost') await crosspost(rest.find((a) => !a.startsWith('--')) ?? die('usage: node tools/publish.mjs crosspost <slug> [--dry-run]'), rest.includes('--dry-run'));
  else if (!cmd || cmd === '--drafts') await build({ drafts: cmd === '--drafts' });
  else die(`unknown command "${cmd}" (see the top of tools/publish.mjs)`);
}
