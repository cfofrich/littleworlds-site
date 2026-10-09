// Exports the app's own vector art for the site: `npm run art` (needs the app repo next to this one, or APP_REPO).
//
//   art/stickers.json        every sticker: its SVG (parts as nested <g>), its idle and tap animations sampled
//                            from the real part animators, body motion, speech bubble and sound
//   art/audio.json           sound file per sound id, voice line file per exact text
//   public/img/worlds/*.svg  each world's scenery (Halloween at night, like its home card), text turned to paths
//
// The output is committed, so building and deploying the site doesn't need the app repo.
const fs = require('fs');
const path = require('path');
const { APP, React, render, loadApp, loadAppFile } = require('./load-app.cjs');
const opentype = require('opentype.js');

const ROOT = path.resolve(__dirname, '..');
const OUT_ART = path.join(ROOT, 'art');
const OUT_WORLDS = path.join(ROOT, 'public/img/worlds');
fs.mkdirSync(OUT_ART, { recursive: true });
fs.mkdirSync(OUT_WORLDS, { recursive: true });

const { WORLDS } = loadApp();
const h = React.createElement;

// ---------- markup clean-up ----------

const round = (v, d = 2) => {
  const k = 10 ** d;
  return Math.round(v * k) / k;
};

// Shorter markup: the shared ink outline becomes a class (stroke-width stays an attribute, so a part that sets
// its own width keeps it), empty elements self-close, long decimals are rounded.
const OUTLINE = /stroke="#4A3426" stroke-width="([\d.]+)" stroke-linejoin="round" stroke-linecap="round"/g;
function tidy(svg) {
  return svg
    .replace(OUTLINE, 'class="o" stroke-width="$1"')
    .replace(/<(path|circle|ellipse|rect|line|polygon|polyline|stop|use)([^>]*)><\/\1>/g, '<$1$2/>')
    .replace(/-?\d+\.\d{3,}/g, (m) => String(round(parseFloat(m), 2)));
}

// ---------- sampling the part animators ----------

const STILL_CLOCK = 1.3; // the app's still pose (src/engine/StickerArt.tsx): nobody blinking
// Frames per second tried for each animated value, lowest first: slow breathing needs few, a flapping wing more.
const IDLE_FPS = [12, 24, 30];
const TAP_FPS = [30, 60];
// how far off a value may be between frames: degrees, viewBox units, scale
const TOLERANCE = { r: 1.2, x: 1, y: 1, s: 0.035, sx: 0.035, sy: 0.035, k: 0.0006 };

// RN transform list -> [[type, value]]; rotations in degrees
function ops(list) {
  return list.map((t) => {
    if ('translateX' in t) return ['x', t.translateX];
    if ('translateY' in t) return ['y', t.translateY];
    if ('rotate' in t) {
      const v = parseFloat(t.rotate);
      return ['r', t.rotate.endsWith('rad') ? (v * 180) / Math.PI : v];
    }
    if ('scaleX' in t) return ['sx', t.scaleX];
    if ('scaleY' in t) return ['sy', t.scaleY];
    return ['s', t.scale];
  });
}
const sig = (o) => o.map((p) => p[0]).join(' ');

// the SVG transform the app's StillPart draws for these ops around the pivot
function svgTransform(o, [px, py]) {
  const body = o
    .map(([k, v]) => {
      v = round(v, 3);
      if (k === 'x') return `translate(${v} 0)`;
      if (k === 'y') return `translate(0 ${v})`;
      if (k === 'r') return `rotate(${v})`;
      if (k === 'sx') return `scale(${v} 1)`;
      if (k === 'sy') return `scale(1 ${v})`;
      return `scale(${v})`;
    })
    .join(' ');
  return `translate(${px} ${py}) ${body} translate(${-px} ${-py})`;
}

// a tenth of a degree or of a viewBox unit is invisible; scales need more
const digits = (type) => (type === 'r' || type === 'x' || type === 'y' ? 1 : 3);

// a series that never changes is stored as one number
const pack = (vals, d = 2) => {
  const r = vals.map((v) => round(v, d));
  return r.every((v) => v === r[0]) ? r[0] : r;
};

// Idle loops forever on the site, so pick a loop length where every idle series comes back close to where it
// started, then spread what's left of the seam over the loop (a slow drift nobody sees, instead of a jump).
function idleLoop(anim) {
  let best = { L: 7.2, err: Infinity };
  for (let L = 6; L <= 12.0001; L += 0.05) {
    const a = ops(anim(0, STILL_CLOCK));
    const b = ops(anim(0, STILL_CLOCK + L));
    if (sig(a) !== sig(b)) continue;
    const err = a.reduce((s, [k, v], n) => s + Math.abs(v - b[n][1]) / (k === 'r' ? 10 : k === 'x' || k === 'y' ? 4 : 0.1), 0) + L * 0.002;
    if (err < best.err) best = { L, err };
  }
  return round(best.L, 2);
}

// The loop's last sample should equal its first; spread a small leftover difference over the whole loop (a slow
// drift nobody sees, instead of a jump each time it wraps). Not for a blink caught mid-way: that stays as is.
function unseam(vals, type) {
  const d = vals[vals.length - 1] - vals[0];
  if (!d || ((type === 's' || type === 'sx' || type === 'sy') && Math.abs(d) > 0.05)) return vals;
  return vals.map((v, k) => v - (d * k) / (vals.length - 1));
}

// One value over time (fn(f) for f in 0..1, `seconds` long) as evenly spaced samples: the fewest frames per second
// whose straight lines between samples stay within tolerance of the real curve. Steps (a hidden layer popping in)
// can't be met and get the most frames, which turns them into a few-millisecond ramp.
function series(fn, seconds, rates, type) {
  const fine = Math.max(200, Math.round(seconds * 480));
  const truth = Array.from({ length: fine + 1 }, (_, k) => fn(k / fine));
  let vals;
  for (const fps of rates) {
    const n = Math.max(2, Math.round(seconds * fps));
    vals = Array.from({ length: n + 1 }, (_, k) => fn(k / n));
    let worst = 0;
    for (let k = 0; k <= fine; k++) {
      const x = (k / fine) * n;
      const j = Math.min(n - 1, Math.floor(x));
      worst = Math.max(worst, Math.abs(vals[j] + (vals[j + 1] - vals[j]) * (x - j) - truth[k]));
    }
    if (worst <= TOLERANCE[type]) break;
  }
  return vals;
}

// a part's op list over time: same shape throughout (op types joined), or null
function shapeOf(fn, steps = 240) {
  const first = sig(fn(0));
  for (let k = 1; k <= steps; k++) if (sig(fn(k / steps)) !== first) return null;
  return first;
}

// One animated part -> what the site's runtime needs.
//   o:  op types, e.g. "r" or "sx sy"
//   i:  idle series per op (a number = constant), looping over L seconds of the idle clock from STILL_CLOCK
//   t:  tap series per op: the app's exact anim(a, STILL_CLOCK + elapsed). The site restarts the idle clock at
//       STILL_CLOCK when a tap starts, so the reaction plays exactly as in the app and hands back to idle seamlessly.
//   idleRaw / raw: full transforms at 60 fps, for a part whose op list changes shape
function exportPart(part, durationMs) {
  const anim = part.anim;
  const dur = durationMs / 1000;
  const L = idleLoop(anim);
  const idleAt = (f) => ops(anim(0, STILL_CLOCK + f * L));
  const tapAt = (a) => ops(anim(a, STILL_CLOCK + a * dur));
  const idleSig = shapeOf(idleAt);
  const tapSig = shapeOf(tapAt);
  const out = { pv: part.pivot, rest: svgTransform(ops(anim(0, STILL_CLOCK)), part.pivot), L };
  const frames = (fn, seconds) => {
    const n = Math.max(2, Math.round(seconds * 60));
    return Array.from({ length: n + 1 }, (_, k) => svgTransform(fn(k / n), part.pivot));
  };

  if (idleSig !== null) {
    out.o = idleSig;
    out.i = idleSig ? idleSig.split(' ').map((ty, j) => pack(unseam(series((f) => idleAt(f)[j][1], L, IDLE_FPS, ty), ty), digits(ty))) : [];
  } else {
    out.idleRaw = frames(idleAt, L);
  }
  if (idleSig !== null && tapSig === idleSig) {
    out.t = tapSig ? tapSig.split(' ').map((ty, j) => pack(series((a) => tapAt(a)[j][1], dur, TAP_FPS, ty), digits(ty))) : [];
    // nothing moves at idle or on tap: no need to animate it at all
    const still = (list) => list.every((v) => typeof v === 'number');
    if (still(out.i) && still(out.t) && out.i.every((v, j) => v === out.t[j])) return null;
  } else {
    out.raw = frames(tapAt, dur);
  }
  return out;
}

// Body motion: the app moves the whole sticker by motion(a, span) (translation, in viewBox units; span = the
// distance that carries it off the stage) and turns/squashes it by motion(a, 0). Translation is sampled at two
// spans so the site can pick its own span: tx = tx0 + span * txK.
function exportMotion(def) {
  const m = def.reaction.motion;
  if (!m) return null;
  const dur = def.reaction.durationMs / 1000;
  const S = 1000;
  let linear = true;
  for (let k = 0; k <= 50; k++) {
    const a = k / 50;
    const z = m(a, 0);
    const s = m(a, S);
    const half = m(a, S / 2);
    if (Math.abs(half.tx - (z.tx + s.tx) / 2) > 0.5 || Math.abs(half.ty - (z.ty + s.ty) / 2) > 0.5) linear = false;
  }
  if (!linear) console.warn(`  ${def.id}: motion isn't linear in span; the site's span is approximate`);
  const one = (fn, type, d) => pack(series(fn, dur, TAP_FPS, type), d);
  return {
    tx: one((a) => m(a, 0).tx, 'x', 1),
    ty: one((a) => m(a, 0).ty, 'y', 1),
    txK: one((a) => (m(a, S).tx - m(a, 0).tx) / S, 'k', 4),
    tyK: one((a) => (m(a, S).ty - m(a, 0).ty) / S, 'k', 4),
    r: one((a) => (m(a, 0).rot * 180) / Math.PI, 'r', 1),
    sx: one((a) => m(a, 0).sx, 's', 3),
    sy: one((a) => m(a, 0).sy, 's', 3),
  };
}

function exportSticker(def) {
  const anims = [];
  const walk = (parts) =>
    parts
      .map((p) => {
        const inner = render(p.el) + (p.parts ? walk(p.parts) : '');
        if (p.anim) {
          const a = exportPart(p, def.reaction.durationMs);
          if (a) {
            anims.push(a);
            return `<g data-p="${anims.length - 1}" transform="${a.rest}">${inner}</g>`;
          }
          // still at rest, but keep its resting pose (a hidden roar mouth is scale 0)
          const rest = ops(p.anim(0, STILL_CLOCK));
          return rest.length ? `<g transform="${svgTransform(rest, p.pivot)}">${inner}</g>` : `<g>${inner}</g>`;
        }
        return p.parts ? `<g>${inner}</g>` : inner;
      })
      .join('');
  const svg = tidy(walk(def.parts));
  anims.forEach((a) => delete a.rest);
  return {
    name: def.name,
    size: def.size ?? 1,
    tags: def.tags ?? [],
    prize: !!def.prize,
    hidden: !!def.hidden,
    dur: def.reaction.durationMs,
    bubble: def.reaction.bubble ?? null,
    effects: (def.reaction.effects ?? []).map(({ kind, stickerId, ...rest }) => ({ kind, sticker: stickerId, ...rest })),
    svg,
    parts: anims,
    motion: exportMotion(def),
  };
}

// ---------- scenery ----------

const fontFile = require.resolve('@expo-google-fonts/fredoka/700Bold/Fredoka_700Bold.ttf', { paths: [APP] });
const fredoka = opentype.parse(fs.readFileSync(fontFile).buffer);

// opentype.js's own toPathData sometimes writes NaN (its path optimizer); write the commands out directly
function pathData(p) {
  const n = (v) => Math.round(v * 100) / 100;
  return p.commands
    .map((c) =>
      c.type === 'Z' ? 'Z'
      : c.type === 'Q' ? `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`
      : c.type === 'C' ? `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`
      : `${c.type}${n(c.x)} ${n(c.y)}`
    )
    .join('');
}

// <text> can't use the page's web font inside an <img>, so the two scenery signs ("ZOO", "BOO") become paths.
function textToPaths(svg) {
  return svg.replace(/<text([^>]*)>([^<]*)<\/text>/g, (_, attrs, text) => {
    const get = (k) => (attrs.match(new RegExp(` ${k}="([^"]*)"`)) || [])[1];
    const size = parseFloat(get('font-size'));
    const x = parseFloat(get('x') ?? '0');
    const y = parseFloat(get('y') ?? '0');
    const width = fredoka.getAdvanceWidth(text, size);
    const anchor = get('text-anchor');
    const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
    const d = pathData(fredoka.getPath(text, left, y, size));
    const keep = attrs.replace(/ (x|y|font-size|font-family|text-anchor|font-weight)="[^"]*"/g, '');
    return `<path d="${d}"${keep}/>`;
  });
}

const sceneryStyle = '<style>.o{stroke:#4A3426;stroke-linejoin:round;stroke-linecap:round}</style>';

function exportScenery(world) {
  let inner = render(h(world.Scenery));
  // The scenery component draws its own full-size <svg>; keep its contents on our own canvas.
  inner = inner.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  if (world.startNight) {
    // the app's NightLayer (src/art/shared/Sky.tsx): a dark shade, stars, then the world's own lights
    const { STARS } = loadAppFile('src/art/shared/Sky.tsx');
    const stars = (world.stars ?? STARS)
      .map(([x, y, s]) => `<path d="M0 -14 L4 -4 L14 0 L4 4 L0 14 L-4 4 L-14 0 L-4 -4 Z" fill="#FFF6C4" transform="translate(${x} ${y}) scale(${s})"/>`)
      .join('');
    const lights = world.nightLights ? render(h(world.nightLights)) : '';
    inner += `<rect width="1600" height="1000" fill="#1B2559" opacity="0.55"/>${stars}${lights}`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">${sceneryStyle}${tidy(textToPaths(inner))}</svg>`;
  fs.writeFileSync(path.join(OUT_WORLDS, `${world.id}.svg`), svg);
  return svg.length;
}

// ---------- audio ----------

// library.generated.ts requires the .m4a files, so read it as text instead of loading it.
function readAudio() {
  const src = fs.readFileSync(path.join(APP, 'src/audio/library.generated.ts'), 'utf8');
  const block = (name) => src.slice(src.indexOf(`export const ${name}`)).split('\n};')[0];
  const clips = (text) =>
    Object.fromEntries([...text.matchAll(/^\s*"((?:[^"\\]|\\.)*)": \{ file: require\('\.\.\/\.\.\/(assets\/audio\/[^']+)'\), ms: (\d+) \}/gm)].map((m) => [JSON.parse(`"${m[1]}"`), { file: m[2], ms: +m[3] }]));
  const stickerSounds = Object.fromEntries([...block('STICKER_SOUNDS').matchAll(/^\s*"([^"]+)": "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
  return { sounds: clips(block('SOUNDS')), voice: clips(block('VOICE')), stickerSounds };
}

// ---------- run ----------

const stickers = {};
for (const w of WORLDS) {
  for (const def of w.stickers) {
    stickers[def.id] = { world: w.id, ...exportSticker(def) };
  }
}
const audio = readAudio();
for (const [id, s] of Object.entries(stickers)) s.sound = audio.stickerSounds[id] ?? null;

const worlds = WORLDS.map((w) => ({
  id: w.id,
  name: w.name,
  color: w.color,
  lip: w.lip,
  night: !!w.startNight,
  preview: w.preview,
  prizes: w.stickers.filter((s) => s.prize).map((s) => s.id),
  tray: w.stickers.filter((s) => !s.prize && !s.hidden).map((s) => s.id),
  scenerySize: exportScenery(w),
}));

// The logo globe, a cloud and the app's button icons, as full <svg> elements.
const { LogoGlobe } = loadAppFile('src/ui/Logo.tsx');
const { Cloud } = loadAppFile('src/art/shared/Sky.tsx');
const Icons = loadAppFile('src/ui/Icons.tsx');
const ui = {
  globe: render(h(LogoGlobe, { size: 200 })),
  cloud: render(h(Cloud, { width: 200 })),
  star: render(h(Icons.StarIcon, { size: 60 })),
  starOff: render(h(Icons.StarIcon, { size: 60, fill: '#FFFFFF' })),
  gear: render(h(Icons.GearIcon, { size: 60 })),
  speaker: render(h(Icons.SpeakerIcon, { size: 60 })),
  home: render(h(Icons.HomeIcon, { size: 60 })),
  broom: render(h(Icons.BroomIcon, { size: 60 })),
};
// sized by CSS: drop the root <svg>'s width and height (only there: rects keep theirs)
for (const k of Object.keys(ui)) ui[k] = tidy(ui[k].replace(/^<svg[^>]*>/, (tag) => tag.replace(/ (width|height)="[\d.]+"/g, '').replace('<svg', '<svg aria-hidden="true"')));
fs.writeFileSync(path.join(OUT_ART, 'ui.json'), JSON.stringify(ui, null, 1));

fs.writeFileSync(path.join(OUT_ART, 'stickers.json'), JSON.stringify(stickers));
fs.writeFileSync(path.join(OUT_ART, 'worlds.json'), JSON.stringify(worlds, null, 1));
fs.writeFileSync(path.join(OUT_ART, 'audio.json'), JSON.stringify(audio, null, 1));

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`${Object.keys(stickers).length} stickers -> art/stickers.json (${kb(fs.statSync(path.join(OUT_ART, 'stickers.json')).size)})`);
for (const w of worlds) console.log(`  scenery ${w.id}: ${kb(w.scenerySize)}`);
