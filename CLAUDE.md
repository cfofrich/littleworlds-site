# littleworlds.io (notes for Claude)

The website for the Little Worlds: Stickers app (`~/repos/little-worlds`; its `docs/website.md` is the brief and
its CLAUDE.md explains the art). Read README.md first. Chris decides anything public: pushing, Cloudflare Pages,
DNS, money. Design and build details are judgment calls.

## How the stickers work

- `tools/load-app.cjs` runs the app's TypeScript in Node (TypeScript's transpiler, React Native/Reanimated/Expo
  stubbed) with `react-native-svg` mapped to DOM SVG, so `react-dom/server` renders any sticker part or scenery to
  SVG markup. The shared ink outline becomes `class="o"` (styled in site.css and inside each scenery SVG).
- A sticker is nested `<g data-p>` groups, one per animated part. Each part animator `anim(a, i)` is sampled:
  idle (`a = 0`) over a loop length chosen so the loop closes, and the tap (`a` 0 -> 1, the clock from the app's
  still pose, 1.3 s). Frame rates are picked per value to stay within a tolerance (`series()` in export-art.cjs).
  The runtime (`src/js/stickers.js`) restarts a sticker's idle clock at the still pose when it's tapped, so the tap
  plays the app's exact frames and hands back to idle without a jump. Body motion is sampled at two spans so the
  page can pick its own travel distance.
- Effects copied from the app's WorldScreen: spawn (eggs, bubbles, apples; capped at 3 per sticker), become
  (pumpkin -> jack-o'-lantern), wake (nearby tagged stickers react), vanish. Eat/fetch aren't on the web.
- Sound: Web Audio, only after a tap, one voice line at a time; follows the iPhone silent switch.
- Checking poses without animation (hidden tabs and offscreen WebKit pause rAF and CSS animations):
  `const s = [...LW.stickers][n]; const now = performance.now(); s.start = now - a * s.d.dur; s.phase = -s.start / 1000; s.frame(now)`.
  `node tools/build.mjs --lab` writes `dev/lab.html` (every sticker; served at /dev/lab.html).

## Pitfalls

- opentype.js `toPathData()` sometimes writes `NaN`; both tools write path commands themselves (`pathData()`).
- The browser pane is usually hidden, so `requestAnimationFrame` and CSS animations don't run there; a bubble's
  visible state is its resting style (the pop is only an entrance) so it shows even then. For screenshots use
  `swift tools/shot.swift <url> <css width> <out.png> [height] [js] [delay]` and disable animations in the js.
- Scenery is an `<img>`, so its text ("ZOO", "BOO") is converted to paths at export; an `<img>` SVG can't use the
  page's fonts.
- Hero stickers are placed in canvas units with container-query units (`.scene` in site.css), so they stay put
  however the scene is cropped (16:10 desktop, 3:2 phone). Keep them between x 120 and 1480 for the phone crop.
