// db-player Level 2 API. Node 20+, no dependencies. Run: node api/server.mjs   (or: docker compose up api)
// Lessons are read from ./media/<file prefix>.meta.json; uploaded captions go to ./api/uploads (never into media/).
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MEDIA = join(ROOT, 'media');
const UPLOADS = process.env.UPLOAD_DIR || join(ROOT, 'api', 'uploads');
const PORT = Number(process.env.API_PORT || 8081);
const MEDIA_BASE = (process.env.MEDIA_BASE_URL || 'http://localhost:8080/media/').replace(/\/?$/, '/');
const MAX_VTT = 512 * 1024;

// .env is optional; real environment variables win.
if (existsSync(join(ROOT, '.env'))) {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

// lesson id -> file prefix in media/
async function lessons() {
  const meta = JSON.parse(await readFile(join(MEDIA, 'lesson.meta.json'), 'utf8'));
  return { [meta.id]: { prefix: 'lesson', meta } };
}

// ---------- WebVTT ----------
const TS = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/;
const secs = (s) => { const m = s.match(TS); return m ? (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : NaN; };
export function parseVTT(text) {
  const src = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(src)) throw new Error('The file must start with the line "WEBVTT".');
  const cues = [];
  const blocks = src.split(/\n{2,}/).slice(1);
  blocks.forEach((block, n) => {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length || /^(NOTE|STYLE|REGION)\b/.test(lines[0])) return;
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0 || i > 1) throw new Error(`Block ${n + 1} has no timing line like "00:00:01.000 --> 00:00:04.000".`);
    const [a, rest = ''] = lines[i].split('-->');
    const start = secs(a.trim()), end = secs(rest.trim().split(/\s+/)[0]);
    if (Number.isNaN(start) || Number.isNaN(end)) throw new Error(`Cue ${cues.length + 1}: the time "${lines[i].trim()}" is not in the form 00:00:01.000.`);
    if (end <= start) throw new Error(`Cue ${cues.length + 1}: the end time must be after the start time.`);
    const body = lines.slice(i + 1).join('\n');
    if (!body.trim()) throw new Error(`Cue ${cues.length + 1} (at ${a.trim()}) has no text.`);
    cues.push({ start, end, text: body.replace(/<[^>]+>/g, '') });
  });
  if (!cues.length) throw new Error('The file has no captions in it.');
  return cues;
}
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------- helpers ----------
const LANG = /^[a-z]{2,3}$/;
function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', ...extra });
  res.end(type.startsWith('application/json') ? JSON.stringify(body, null, 2) : body);
}
const fail = (res, status, message) => send(res, status, { error: message, status });
async function exists(p) { try { return (await stat(p)).isFile(); } catch { return false; } }
async function captionFile(prefix, lang) {
  const up = join(UPLOADS, `${prefix}.${lang}.vtt`);
  if (await exists(up)) return up;
  const m = join(MEDIA, `${prefix}.${lang}.vtt`);
  return (await exists(m)) ? m : null;
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too big'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function webhook(event) {
  const url = process.env.CAPTION_WEBHOOK_URL;
  if (!url) return { sent: false };
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'db-player-api' },
      body: JSON.stringify(event), signal: AbortSignal.timeout(5000) });
    console.log(`webhook ${url} -> ${r.status}`);
    return { sent: true, status: r.status };
  } catch (e) {
    console.log(`webhook ${url} failed: ${e.message}`);
    return { sent: false, error: e.message };
  }
}

// ---------- routes ----------
const DOCS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>db-player API</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css"></head>
<body><div id="ui"></div><script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/openapi.yaml', dom_id: '#ui' });</script></body></html>`;

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain', { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' });
  if (path === '/docs' && req.method === 'GET') return send(res, 200, DOCS, 'text/html; charset=utf-8');
  if (path === '/openapi.yaml' && req.method === 'GET') return send(res, 200, await readFile(join(ROOT, 'openapi.yaml'), 'utf8'), 'application/yaml; charset=utf-8');
  if (path === '/health') return send(res, 200, { ok: true });

  const m = path.match(/^\/api\/v1\/lessons\/([^/]+)(?:\/(transcript|offline-pack|captions))?$/);
  if (!m) return fail(res, 404, `There is no API route at ${path}. See /docs.`);
  const [, id, sub] = m;
  const all = await lessons();
  const lesson = all[decodeURIComponent(id)];
  if (!lesson) return fail(res, 404, `No lesson with the id "${decodeURIComponent(id)}". Known ids: ${Object.keys(all).join(', ')}.`);
  const { prefix, meta } = lesson;
  const allowed = sub === 'captions' ? 'POST' : 'GET';
  if (req.method !== allowed) return send(res, 405, { error: `Use ${allowed} for this address.`, status: 405 }, 'application/json; charset=utf-8', { Allow: allowed });

  if (!sub) {
    const tracks = [];
    for (const lang of ['am', 'en', 'om', 'ti', 'so']) {
      const f = await captionFile(prefix, lang);
      if (f) tracks.push({ kind: 'captions', lang, url: f.startsWith(UPLOADS) ? `/api/v1/lessons/${meta.id}/transcript?lang=${lang}&format=vtt` : `${MEDIA_BASE}${prefix}.${lang}.vtt` });
      if (await exists(join(MEDIA, `${prefix}.ad.${lang}.vtt`))) tracks.push({ kind: 'descriptions', lang, url: `${MEDIA_BASE}${prefix}.ad.${lang}.vtt` });
    }
    return send(res, 200, {
      id: meta.id, title: { am: meta.title_am, en: meta.title_en }, durationSeconds: meta.seconds, narration: meta.tts,
      video: `${MEDIA_BASE}${prefix}.mp4`, poster: `${MEDIA_BASE}poster.png`, offlineAudio: `${MEDIA_BASE}${prefix}-low.mp3`,
      signLanguageVideo: null, tracks,
    });
  }

  if (sub === 'transcript') {
    const lang = url.searchParams.get('lang') || 'am';
    if (!LANG.test(lang)) return fail(res, 400, 'The lang parameter must be a 2- or 3-letter language code, for example am or en.');
    const f = await captionFile(prefix, lang);
    if (!f) return fail(res, 404, `This lesson has no transcript in "${lang}" yet.`);
    const vtt = await readFile(f, 'utf8');
    if (url.searchParams.get('format') === 'vtt') return send(res, 200, vtt, 'text/vtt; charset=utf-8');
    const text = parseVTT(vtt).map((c) => `[${mmss(c.start)}] ${c.text}`).join('\n') + '\n';
    return send(res, 200, text, 'text/plain; charset=utf-8', { 'Content-Language': lang });
  }

  if (sub === 'offline-pack') {
    const f = join(MEDIA, `${prefix}-low.mp3`);
    if (!(await exists(f))) return fail(res, 404, 'This lesson has no offline audio yet.');
    const { size } = await stat(f);
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': size, 'Access-Control-Allow-Origin': '*',
      'Content-Disposition': `attachment; filename="${meta.id}.mp3"` });
    return createReadStream(f).pipe(res);
  }

  // POST captions
  const lang = url.searchParams.get('lang');
  if (!lang || !LANG.test(lang)) return fail(res, 400, 'Add ?lang= with a 2- or 3-letter language code, for example ?lang=om.');
  const ctype = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!['text/vtt', 'text/plain'].includes(ctype)) return fail(res, 415, 'Send the caption file as the request body with Content-Type: text/vtt.');
  let body;
  try { body = await readBody(req, MAX_VTT); } catch (e) { return fail(res, e.code === 413 ? 413 : 400, e.code === 413 ? 'The caption file is larger than 512 KB.' : 'The upload was interrupted.'); }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(body); } catch { return fail(res, 400, 'The caption file must be saved as UTF-8 text.'); }
  let cues;
  try { cues = parseVTT(text); } catch (e) { return fail(res, 400, e.message); }
  await mkdir(UPLOADS, { recursive: true });
  await writeFile(join(UPLOADS, `${prefix}.${lang}.vtt`), text, 'utf8');
  const event = { event: 'captions.uploaded', lesson: meta.id, lang, cues: cues.length, at: new Date().toISOString() };
  const hook = await webhook(event);
  return send(res, 201, { ...event, transcript: `/api/v1/lessons/${meta.id}/transcript?lang=${lang}`, webhook: hook },
    'application/json; charset=utf-8', { Location: `/api/v1/lessons/${meta.id}/transcript?lang=${lang}&format=vtt` });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer((req, res) => handle(req, res).catch((e) => { console.error(e); fail(res, 500, 'Something went wrong on the server.'); }))
    .listen(PORT, () => console.log(`db-player API on http://localhost:${PORT}  (docs: /docs)`));
}
