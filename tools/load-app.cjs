// Loads the app's own TypeScript (worlds, stickers, scenery) in plain Node, so the site uses the real drawings.
// Based on the app's scripts/audio/load-app.cjs, with one difference: react-native-svg is mapped to plain DOM
// SVG elements, so react-dom/server can turn any sticker part or scenery into SVG markup. React Native,
// Reanimated and Expo are stubbed: the art is plain SVG, and animations are sampled from the parts' animators.
const fs = require('fs');
const path = require('path');
const Module = require('module');

const APP = path.resolve(process.env.APP_REPO || path.join(__dirname, '../../little-worlds'));
if (!fs.existsSync(path.join(APP, 'src/worlds.tsx'))) {
  throw new Error(`App repo not found at ${APP} (set APP_REPO)`);
}
const fromApp = (name) => require(require.resolve(name, { paths: [APP] }));
const ts = fromApp('typescript');
const React = fromApp('react');
const { renderToStaticMarkup } = fromApp('react-dom/server');

const STUBBED = /^(react-native($|-)|expo($|-)|@react-native|@react-navigation|@expo)/;

function stub(name) {
  const fn = function () {
    return stub(name);
  };
  return new Proxy(fn, {
    get(_, key) {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === 'then' || key === '__esModule') return undefined;
      if (key === 'default') return stub(name);
      return stub(`${name}.${String(key)}`);
    },
    apply: () => stub(name),
    construct: () => stub(name),
  });
}

// react-native-svg -> DOM SVG. Only the props DOM SVG doesn't understand are dropped (RN style objects, touch
// handlers); everything else (strokeWidth, strokeLinejoin, transform strings...) React DOM writes as attributes.
const DROP = new Set(['style', 'onPress', 'pointerEvents', 'accessibilityLabel', 'testID']);
function svgTag(tag) {
  const C = ({ children, ...props }) => {
    const clean = {};
    for (const [k, v] of Object.entries(props)) {
      if (DROP.has(k) || v === undefined || v === null) continue;
      clean[k] = Array.isArray(v) ? v.join(' ') : v;
    }
    return React.createElement(tag, clean, children);
  };
  C.displayName = tag;
  return C;
}
const SVG = {
  __esModule: true,
  Svg: svgTag('svg'),
  G: svgTag('g'),
  Path: svgTag('path'),
  Circle: svgTag('circle'),
  Ellipse: svgTag('ellipse'),
  Rect: svgTag('rect'),
  Line: svgTag('line'),
  Polygon: svgTag('polygon'),
  Polyline: svgTag('polyline'),
  Text: svgTag('text'),
  TSpan: svgTag('tspan'),
  Defs: svgTag('defs'),
  LinearGradient: svgTag('linearGradient'),
  RadialGradient: svgTag('radialGradient'),
  Stop: svgTag('stop'),
  ClipPath: svgTag('clipPath'),
  Mask: svgTag('mask'),
  Use: svgTag('use'),
};
SVG.default = SVG.Svg;

const load = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'react-native-svg') return SVG;
  if (STUBBED.test(request)) return stub(request);
  return load.call(this, request, parent, isMain);
};

for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = (mod, filename) => {
    const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    mod._compile(out.outputText, filename);
  };
}

module.exports = {
  APP,
  React,
  render: (el) => renderToStaticMarkup(el),
  loadApp: () => require(path.join(APP, 'src/worlds.tsx')),
  loadAppFile: (rel) => require(path.join(APP, rel)),
};
