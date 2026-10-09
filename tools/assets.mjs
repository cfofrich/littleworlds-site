// Fonts, icons and the link-preview image: `npm run assets` (needs the app repo next to this one, or APP_REPO).
//
//   public/fonts/fredoka-{500,600,700}.woff2   Fredoka from the app's node_modules, Latin only (self-hosted:
//                                              no font service sees visitors)
//   public/favicon.svg, favicon.ico, apple-touch-icon.png   the app's logo globe and app icon
//   public/img/og.png                           1200 x 630 link preview: logo and stickers on the home sky
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import subsetFont from 'subset-font';
import opentype from 'opentype.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.resolve(process.env.APP_REPO || path.join(ROOT, '../little-worlds'));
const OUT = path.join(ROOT, 'public');
const UI = JSON.parse(fs.readFileSync(path.join(ROOT, 'art/ui.json'), 'utf8'));
const STICKERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'art/stickers.json'), 'utf8'));
const fontPath = (w, name) => require.resolve(`@expo-google-fonts/fredoka/${w}${name}/Fredoka_${w}${name}.ttf`, { paths: [APP] });

const INK = '#4A3426';
const OUTLINE_CSS = `<style>.o{stroke:${INK};stroke-linejoin:round;stroke-linecap:round}</style>`;

// ---------- fonts ----------
const CHARS =
  Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).join('') +
  Array.from({ length: 0x100 - 0xa0 }, (_, i) => String.fromCharCode(0xa0 + i)).join('') +
  '‘’“”–—…•·→←✓★™©®';
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
for (const [w, name] of [
  [500, 'Medium'],
  [600, 'SemiBold'],
  [700, 'Bold'],
]) {
  const woff2 = await subsetFont(fs.readFileSync(fontPath(w, name)), CHARS, { targetFormat: 'woff2' });
  fs.writeFileSync(path.join(OUT, `fonts/fredoka-${w}.woff2`), woff2);
  console.log(`fonts/fredoka-${w}.woff2 ${(woff2.length / 1024).toFixed(1)} KB`);
}
fs.copyFileSync(path.join(APP, 'node_modules/@expo-google-fonts/fredoka/LICENSE_FONT'), path.join(OUT, 'fonts/OFL.txt'));

// ---------- icons ----------
// The logo globe as a die-cut sticker (white border inside an ink edge), like the app icon, without its sparkles.
const SHAPES = '<circle cx="100" cy="116" r="68"/><rect x="64" y="30" width="34" height="26" rx="3"/><path d="M58 34 L81 14 L104 34 Z"/><circle cx="128" cy="22" r="17"/><rect x="124" y="30" width="9" height="24" rx="3"/>';
const globeArt = UI.globe
  .replace(/^<svg[^>]*>/, '')
  .replace(/<\/svg>$/, '')
  .replace(/<path d="M28 40[^>]*\/>/, '')
  .replace(/<path d="M176 120[^>]*\/>/, '');
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="24 -2 152 196">${OUTLINE_CSS}<g fill="${INK}" stroke="${INK}" stroke-width="22" stroke-linejoin="round">${SHAPES}</g><g fill="#fff" stroke="#fff" stroke-width="14" stroke-linejoin="round">${SHAPES}</g>${globeArt}</svg>`;
fs.writeFileSync(path.join(OUT, 'favicon.svg'), favicon);

// favicon.ico: one 32 px PNG inside an ICO wrapper (every browser takes PNG-in-ICO)
const png32 = await sharp(Buffer.from(favicon), { density: 300 }).resize(32, 32, { fit: 'contain', background: '#0000' }).png().toBuffer();
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt8(32, 6);
ico.writeUInt8(32, 7);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png32.length, 14);
ico.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(OUT, 'favicon.ico'), Buffer.concat([ico, png32]));

// the real app icon for iOS home screens
await sharp(path.join(APP, 'assets/icon.png')).resize(180, 180).png().toFile(path.join(OUT, 'apple-touch-icon.png'));
console.log('favicon.svg, favicon.ico, apple-touch-icon.png');

// ---------- link preview (Open Graph) ----------
// The app's home sky (src/screens/HomeScreen.tsx Backdrop), the logo, and stickers standing on the hill.
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
const bold = opentype.parse(fs.readFileSync(fontPath(700, 'Bold')).buffer);
function words(text, size, x, y, fill, outline) {
  const w = bold.getAdvanceWidth(text, size);
  const d = pathData(bold.getPath(text, x - w / 2, y, size));
  const sw = size * 0.2;
  return (
    `<path d="${d}" transform="translate(0 ${size * 0.07})" fill="${outline}" stroke="${outline}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="${outline}" stroke="${outline}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="${fill}"/>`
  );
}
const sticker = (id, x, y, size, flip = false) =>
  `<svg x="${x - size / 2}" y="${y - size}" width="${size}" height="${size}" viewBox="0 0 200 200" overflow="visible"><g${flip ? ' transform="translate(200 0) scale(-1 1)"' : ''}>${STICKERS[id].svg}</g></svg>`;
const ribbonText = bold.getPath('Stickers', 0, 0, 34);
const rb = ribbonText.getBoundingBox();
const rw = rb.x2 - rb.x1 + 44;
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">${OUTLINE_CSS}
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5DBDFB"/><stop offset="1" stop-color="#D8F2FF"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#sky)"/>
<g opacity="0.3">${[0, 1, 2, 3, 4, 5, 6].map((n) => `<path d="M0 0 L460 -40 L460 40 Z" fill="#FFF6C4" transform="translate(110 110) rotate(${n * 30 - 30})"/>`).join('')}</g>
<g transform="translate(110 110) scale(0.85) translate(-170 -200)"><circle cx="170" cy="200" r="64" fill="#FFD34D" class="o" stroke-width="6"/><circle cx="150" cy="194" r="6" fill="${INK}"/><circle cx="190" cy="194" r="6" fill="${INK}"/><circle cx="138" cy="214" r="8" fill="#FF9F43" opacity="0.6"/><circle cx="202" cy="214" r="8" fill="#FF9F43" opacity="0.6"/><path d="M156 214 Q170 228 184 214" fill="none" class="o" stroke-width="5"/></g>
<path d="M-20 520 C160 450 330 460 500 505 C680 450 860 440 1010 495 C1100 470 1160 470 1220 485 L1220 650 L-20 650 Z" fill="#B7E58E" class="o" stroke-width="6"/>
<path d="M-20 575 C220 545 480 555 680 570 C900 585 1060 555 1220 565 L1220 650 L-20 650 Z" fill="#8BD46A" class="o" stroke-width="6"/>
<g transform="translate(193 36)"><svg width="150" height="150" viewBox="0 0 200 200">${globeArt}</svg></g>
${words('Little Worlds', 112, 670, 150, '#FFD34D', INK)}
<g transform="translate(670 198) rotate(-3)"><rect x="${-rw / 2}" y="-27" width="${rw}" height="54" rx="22" fill="#FF6B8B" stroke="${INK}" stroke-width="4"/><path d="${pathData(bold.getPath('Stickers', -(rb.x2 - rb.x1) / 2 - rb.x1, 12, 34))}" fill="#fff"/></g>
${sticker('farm-chicken', 150, 560, 150)}
${sticker('farm-cow', 300, 548, 200)}
${sticker('halloween-ghost', 470, 520, 180)}
${sticker('halloween-jack', 615, 556, 160)}
${sticker('zoo-lion', 780, 556, 210)}
${sticker('space-rocket', 960, 520, 250)}
${sticker('beach-crab', 1100, 570, 140)}
</svg>`;
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
await sharp(Buffer.from(og)).png({ compressionLevel: 9, palette: false }).toFile(path.join(OUT, 'img/og.png'));
console.log(`img/og.png ${(fs.statSync(path.join(OUT, 'img/og.png')).size / 1024).toFixed(1)} KB`);
