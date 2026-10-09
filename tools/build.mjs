// Builds the site into public/ from src/ and the art exported from the app (art/, see tools/export-art.cjs).
//
//   src/*.html       pages; tags: {{> partial}}, {{ui name}}, {{sticker id [flip] [class]}}, {{worlds}},
//                    {{scene name}}, {{badge}}, {{sticker-data}}, {{v path}} (a cache-busting ?v= hash)
//   src/partials/    shared bits (head, footer)
//   src/scenes.json  the hero scene (stickers placed on a world's 1600 x 1000 canvas)
//   src/css, src/js  copied as they are
//
// No dependencies; the output is plain HTML/CSS/JS that any static host can serve.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'public');
const json = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const STICKERS = json('art/stickers.json');
const WORLDS = json('art/worlds.json');
const UI = json('art/ui.json');
const AUDIO = json('art/audio.json');
const SCENES = json('src/scenes.json');
const SITE = json('src/site.json');
// sounds are copied from the app repo when it's there (public/audio is committed, so a build works without it)
const APP = path.resolve(process.env.APP_REPO || path.join(ROOT, '../little-worlds'));

// The season, like the app's seasonal() (src/worlds.tsx): in October Halloween is the hero and the first world
// ("New!" in 2026); the rest of the year the Farm is the hero and Halloween is the last world, without the badge.
// The site is static, so it changes when it's rebuilt: rebuild and deploy on Nov 1 and Oct 1.
// SITE_DATE=2026-11-02 npm run build previews another date.
const TODAY = process.env.SITE_DATE ? new Date(`${process.env.SITE_DATE}T12:00:00`) : new Date();
const OCTOBER = TODAY.getMonth() === 9;
const NEW_HALLOWEEN = OCTOBER && TODAY.getFullYear() === 2026;
const HERO = OCTOBER ? 'halloween' : 'farm';
const ORDERED = [...WORLDS].sort((a, b) => (a.id === 'halloween' ? (OCTOBER ? -1 : 1) : 0) - (b.id === 'halloween' ? (OCTOBER ? -1 : 1) : 0));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- stickers ----------

let used = new Set();

function becomeOf(id) {
  return STICKERS[id]?.effects.find((e) => e.kind === 'become')?.sticker ?? null;
}

// stickers this one can turn into or make (a pumpkin's jack-o'-lantern, a hen's egg and the chick in it)
function family(id, seen = new Set()) {
  for (const e of STICKERS[id]?.effects ?? []) {
    if ((e.kind === 'become' || e.kind === 'spawn') && !seen.has(e.sticker)) {
      seen.add(e.sticker);
      family(e.sticker, seen);
    }
  }
  return seen;
}

// A sticker is a button: the art in two wrappers (travel, then turn/squash) so the tap motion matches the app.
function sticker(id, { flip = false, cls = '', style = '', label } = {}) {
  const s = STICKERS[id];
  if (!s) throw new Error(`unknown sticker ${id}`);
  used.add(id);
  for (const f of family(id)) used.add(f);
  const classes = ['stk', flip && 'flip', cls].filter(Boolean).join(' ');
  return (
    `<button type="button" class="${classes}" data-s="${id}" aria-label="${esc(label ?? s.name)}" style="--sz:${s.size}${style ? ';' + style : ''}">` +
    `<span class="mv"><span class="tn"><svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">${s.svg}</svg></span></span>` +
    `</button>`
  );
}

// Only what the runtime needs, for the stickers on this page. A sticker that only appears through another one
// (a jack-o'-lantern, an egg) also carries its drawing.
function stickerData() {
  const out = {};
  const targets = new Set([...used].flatMap((id) => [...family(id)]));
  for (const id of used) {
    const s = STICKERS[id];
    out[id] = {
      name: s.name,
      dur: s.dur,
      bubble: s.bubble,
      sound: s.sound,
      parts: s.parts,
      motion: s.motion,
      size: s.size,
      tags: s.tags,
      effects: s.effects.filter((e) => e.kind !== 'eat' && e.kind !== 'fetch'),
      ...(targets.has(id) ? { svg: s.svg } : {}),
    };
  }
  return `<script type="application/json" id="sticker-data">${JSON.stringify(out).replace(/</g, '\\u003c')}</script>`;
}

// ---------- sections built from the app's data ----------

const PEEL =
  '<svg class="peel" viewBox="0 0 60 60" aria-hidden="true"><path d="M8 4 C30 8 50 28 56 52 C44 40 30 34 14 34 C10 24 8 14 8 4 Z" fill="#FFFFFF" class="o" stroke-width="3"/><path d="M16 12 C28 16 40 26 46 38" fill="none" stroke="#E3EEF6" stroke-width="3" stroke-linecap="round"/></svg>';

// The home screen's world cards: scenery, three stickers standing on it, the name tag, prize stars.
function worlds() {
  return ORDERED.map((w, n) => {
    const about = SITE.worlds[w.id];
    const badgeText = w.id === 'halloween' && NEW_HALLOWEEN ? 'New!' : '';
    const stickers = w.preview
      .map((id, k) => sticker(id, { cls: k === 1 ? 'main' : 'side', label: `${STICKERS[id].name} (${w.name})` }))
      .join('');
    const stars = w.prizes.map(() => UI.star).join('');
    return `
      <li class="world" style="--c:${w.color};--lip:${w.lip};--tilt:${n % 2 ? 1.5 : -1.5}deg">
        <div class="card">
          <div class="card-in" data-stage>
            <img class="scenery" src="/img/worlds/${w.id}.svg" alt="" width="1600" height="1000" loading="lazy" decoding="async">
            <div class="card-stickers">${stickers}</div>
            <h3 class="tag"><span>${esc(w.name)}</span><span class="stars" aria-hidden="true">${stars}</span></h3>
          </div>
          ${PEEL}
          ${badgeText ? `<span class="badge">${badgeText}</span>` : ''}
        </div>
        <p class="about">${esc(about.text)}</p>
      </li>`;
  }).join('');
}

// A world with stickers placed on its 1600 x 1000 canvas; CSS keeps them in place however the scene is cropped.
function scene(name) {
  const sc = SCENES[name];
  const BASE = sc.base ?? 180;
  // the moon is the app's MoonArt (src/art/shared/Sky.tsx), the cloud its Cloud
  const PROPS = {
    moon: '<svg viewBox="0 0 120 120"><path d="M76 18 A44 44 0 1 0 98 86 A36 36 0 1 1 76 18 Z" fill="#FFF3B0" class="o" stroke-width="4"/><circle cx="52" cy="66" r="3.4" fill="#4A3426"/><path d="M44 78 Q50 84 58 80" fill="none" class="o" stroke-width="3"/><circle cx="44" cy="72" r="4" fill="#FF9AA8" opacity="0.6"/></svg>',
    cloud: UI.cloud,
  };
  const props = (sc.props ?? [])
    .map((p) => `<span class="prop ${p.kind}" style="--x:${p.x};--y:${p.y};--w:${p.w}" aria-hidden="true">${PROPS[p.kind]}</span>`)
    .join('');
  const items = sc.stickers
    .map((p) => {
      const w = Math.round(BASE * STICKERS[p.id].size * (p.s ?? 1));
      return sticker(p.id, { flip: p.flip, style: `--x:${p.x};--y:${p.y};--w:${w}` });
    })
    .join('');
  return `<img class="scenery" src="/img/worlds/${sc.world}.svg" alt="" width="1600" height="1000" fetchpriority="high">${props}${items}`;
}

function badge(where) {
  const href = SITE.appStore + (SITE.campaign ? `${SITE.appStore.includes('?') ? '&' : '?'}${SITE.campaign}&ct=${where}` : '');
  return `<a class="badge-link" href="${esc(href)}"><img src="/img/app-store-badge.svg" width="160" height="53" alt="Download on the App Store"></a>`;
}

// ---------- pages ----------

const hashes = {};
function version(rel) {
  const file = path.join(OUT, rel.replace(/^\//, ''));
  hashes[rel] ??= crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
  return `${rel}?v=${hashes[rel]}`;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from, { withFileTypes: true })) {
    if (f.isDirectory()) copyDir(path.join(from, f.name), path.join(to, f.name));
    else fs.copyFileSync(path.join(from, f.name), path.join(to, f.name));
  }
}

function render(file) {
  used = new Set();
  let html = fs.readFileSync(path.join(SRC, file), 'utf8');
  for (let n = 0; n < 4; n++) html = html.replace(/\{\{> ([\w-]+)\}\}/g, (_, p) => fs.readFileSync(path.join(SRC, 'partials', `${p}.html`), 'utf8'));
  html = html
    .replace(/\{\{ui (\w+)\}\}/g, (_, k) => UI[k])
    .replace(/\{\{worlds\}\}/g, () => worlds())
    .replace(/\{\{scene (\w+)\}\}/g, (_, k) => scene(k))
    .replace(/\{\{hero scene\}\}/g, () => scene(HERO))
    .replace(/\{\{hero (label|hint)\}\}/g, (_, k) => esc(SCENES[HERO][k]))
    .replace(/\{\{hero badge\}\}/g, () => {
      const text = SCENES[HERO].badge && (HERO === 'halloween' && NEW_HALLOWEEN ? `New! ${SCENES[HERO].badge}` : SCENES[HERO].badge);
      return text ? `<span class="badge">${esc(text)}</span>` : '';
    })
    .replace(/\{\{badge (\w+)\}\}/g, (_, k) => badge(k))
    .replace(/\{\{sticker ([\w-]+)((?: [\w-]+)*)\}\}/g, (_, id, flags) => {
      const f = flags.trim().split(/\s+/).filter(Boolean);
      return sticker(id, { flip: f.includes('flip'), cls: f.filter((x) => x !== 'flip').join(' ') });
    })
    .replace(/\{\{voice "([^"]+)"\}\}/g, (_, text) => voiceFile(text))
    .replace(/\{\{sfx ([\w-]+)\}\}/g, (_, name) => sfxFile(name))
    .replace(/\{\{site (\w+)\}\}/g, (_, k) => esc(SITE[k]));
  html = html.replace(/\{\{sticker-data\}\}/g, () => (used.size ? stickerData() : ''));
  html = html.replace(/\{\{v ([^}]+)\}\}/g, (_, rel) => version(rel.trim()));
  return { html, used: [...used] };
}

// sounds for the stickers on the page, and any voice lines it plays, copied from the app repo when it's there
const audioNeeded = new Set();
function voiceFile(text) {
  const clip = AUDIO.voice[text];
  if (!clip) throw new Error(`no recording for "${text}"`);
  audioNeeded.add(clip.file);
  return `/audio/${path.basename(clip.file)}`;
}

function sfxFile(name) {
  const clip = AUDIO.sounds[name];
  if (!clip) throw new Error(`no sound "${name}"`);
  audioNeeded.add(clip.file);
  return `/audio/${path.basename(clip.file)}`;
}

function copyAudio() {
  const dir = path.join(OUT, 'audio');
  fs.mkdirSync(dir, { recursive: true });
  for (const rel of audioNeeded) {
    const to = path.join(dir, path.basename(rel));
    const from = path.join(APP, rel);
    if (fs.existsSync(from)) fs.copyFileSync(from, to);
    else if (!fs.existsSync(to)) console.warn(`missing audio ${rel} (app repo not found)`);
  }
  // drop sounds the pages no longer use
  const keep = new Set([...audioNeeded].map((r) => path.basename(r)));
  for (const f of fs.readdirSync(dir)) if (!keep.has(f)) fs.rmSync(path.join(dir, f));
}

// static files first, so {{v}} can hash them
copyDir(path.join(SRC, 'css'), path.join(OUT, 'css'));
copyDir(path.join(SRC, 'js'), path.join(OUT, 'js'));
if (fs.existsSync(path.join(SRC, 'static'))) copyDir(path.join(SRC, 'static'), OUT);

// Cloudflare Pages serves privacy.html at /privacy, and 404.html for anything missing
const PAGES = { 'index.html': 'index.html', 'privacy.html': 'privacy.html', '404.html': '404.html' };
console.log(`season: ${TODAY.toDateString()}, hero ${HERO}, Halloween ${OCTOBER ? 'first' : 'last'}${NEW_HALLOWEEN ? ' with New!' : ''}`);
let total = 0;
for (const [src, out] of Object.entries(PAGES)) {
  if (!fs.existsSync(path.join(SRC, src))) continue;
  const { html, used: ids } = render(src);
  for (const id of ids) if (STICKERS[id].sound) audioNeeded.add(`assets/audio/sfx/${STICKERS[id].sound}.m4a`);
  const file = path.join(OUT, out);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  total += html.length;
  console.log(`${out}: ${(html.length / 1024).toFixed(1)} KB, ${ids.length} stickers`);
}
copyAudio();

// a dev-only sheet of every sticker (not deployed): node tools/build.mjs --lab, then /dev/lab.html
if (process.argv.includes('--lab')) {
  used = new Set();
  const cells = Object.entries(STICKERS)
    .map(([id, s]) => `<figure>${sticker(id)}<figcaption>${id}<br>${s.dur} ms ${esc(s.bubble ?? '')}</figcaption></figure>`)
    .join('');
  const page = fs
    .readFileSync(path.join(SRC, 'lab.html'), 'utf8')
    .replace('{{cells}}', cells)
    .replace('{{sticker-data}}', stickerData());
  fs.mkdirSync(path.join(ROOT, 'dev'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'dev/lab.html'), page);
  console.log('dev/lab.html written');
}
