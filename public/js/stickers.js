// Little Worlds stickers on the web: each one breathes and blinks, and a tap plays its real reaction from the app
// (sampled from the app's own part animators by tools/export-art.cjs), with its speech bubble, sound and effects:
// a hen lays an egg that hatches, a pumpkin gets carved, bubbles pop. No libraries, nothing stored, nothing sent.
(() => {
  const dataEl = document.getElementById('sticker-data');
  const DATA = dataEl ? JSON.parse(dataEl.textContent) : {};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const live = document.getElementById('sticker-live');

  // ---------- sound: Web Audio, only ever after a tap; any sound toggle mutes it all ----------
  // (Web Audio, unlike <audio>, can play a cheer a moment after the tap on iPhones, and follows the silent switch.)
  let muted = false;
  let ctx = null;
  const buffers = {};
  const playingNodes = new Set();
  let voiceNode = null;
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  // iOS only lets audio start inside a tap (touchend/click); play() also unlocks from its click
  ['pointerdown', 'touchend', 'keydown'].forEach((t) => addEventListener(t, unlock, { capture: true, passive: true }));
  function load(src) {
    if (!ctx) return Promise.reject(new Error('no audio'));
    return (buffers[src] ||= fetch(src)
      .then((r) => r.arrayBuffer())
      .then((b) => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no))));
  }
  // voice: one line at a time, like the app's narrator
  async function sound(src, { voice = false } = {}) {
    if (muted || !src) return;
    unlock();
    let buf;
    try {
      buf = await load(src);
    } catch {
      return;
    }
    if (muted) return;
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.connect(ctx.destination);
    if (voice) {
      try {
        voiceNode?.stop();
      } catch {}
      voiceNode = node;
    }
    playingNodes.add(node);
    node.onended = () => playingNodes.delete(node);
    node.start();
  }
  const toggles = [...document.querySelectorAll('[data-sound-toggle]')];
  const showSound = () =>
    toggles.forEach((b) => {
      b.setAttribute('aria-pressed', String(!muted));
      const label = b.querySelector('[data-label]');
      if (label) label.textContent = muted ? 'Sound off' : 'Sound on';
    });
  toggles.forEach((b) =>
    b.addEventListener('click', () => {
      muted = !muted;
      if (muted) playingNodes.forEach((n) => n.stop());
      showSound();
    })
  );
  showSound();
  const soundOf = (id) => DATA[id]?.sound && `/audio/${DATA[id].sound}.m4a`;
  window.LW = { sound, preload: (src) => (unlock(), load(src).catch(() => {})) };

  // ---------- sampled tracks ----------

  // a series is one number (it never changes) or samples spread evenly over 0..1
  const at = (s, f) => {
    if (typeof s === 'number') return s;
    const x = f * (s.length - 1);
    if (x <= 0) return s[0];
    if (x >= s.length - 1) return s[s.length - 1];
    const k = Math.floor(x);
    return s[k] + (s[k + 1] - s[k]) * (x - k);
  };
  const OP = {
    x: (v) => `translate(${v} 0)`,
    y: (v) => `translate(0 ${v})`,
    r: (v) => `rotate(${v})`,
    sx: (v) => `scale(${v} 1)`,
    sy: (v) => `scale(1 ${v})`,
    s: (v) => `scale(${v})`,
  };

  // c: the sticker's idle clock in seconds (0 = the app's still pose), a: tap progress 0..1, or -1 when idle.
  // A tap restarts the clock at 0, so the tap frames (sampled from the same start) hand back to idle seamlessly.
  function partTransform(p, c, a) {
    const tap = a >= 0;
    if (tap && p.raw) return p.raw[Math.round(a * (p.raw.length - 1))];
    const f = (c % p.L) / p.L;
    if (!tap && p.idleRaw) return p.idleRaw[Math.round(f * (p.idleRaw.length - 1))];
    const series = tap ? p.t : p.i;
    const types = p.o ? p.o.split(' ') : [];
    const [px, py] = p.pv;
    let out = `translate(${px} ${py})`;
    for (let j = 0; j < types.length; j++) out += ' ' + OP[types[j]](Math.round(at(series[j], tap ? a : f) * 1000) / 1000);
    return `${out} translate(${-px} ${-py})`;
  }

  // ---------- one sticker on the page ----------

  const all = new Set();
  const playing = new Set();
  const visible = new Set();
  let io;

  class Sticker {
    constructor(el) {
      this.el = el;
      this.flip = el.classList.contains('flip') ? -1 : 1;
      this.move = el.querySelector('.mv');
      this.turn = el.querySelector('.tn');
      this.svg = el.querySelector('svg');
      this.phase = Math.random() * 30;
      this.start = 0;
      this.made = [];
      this.timers = [];
      this.setId(el.dataset.s);
      el.addEventListener('click', () => this.play());
      // fetch its sound as the finger lands, so it's ready when the tap ends
      el.addEventListener('pointerdown', () => soundOf(this.id) && window.LW.preload(soundOf(this.id)), { passive: true });
      all.add(this);
      io?.observe(el);
    }
    setId(id) {
      this.id = id;
      this.d = DATA[id];
      this.el.dataset.s = id;
      this.groups = [];
      this.svg.querySelectorAll('g[data-p]').forEach((g) => (this.groups[+g.dataset.p] = g));
    }
    play({ woken = false } = {}) {
      const d = this.d;
      if (!woken) {
        this.el.dispatchEvent(new CustomEvent('sticker:play', { bubbles: true, detail: { id: this.id } }));
        if (live && d.bubble) live.textContent = `${d.name}: ${d.bubble}`;
        this.bubble();
      }
      sound(soundOf(this.id));
      this.timers.forEach(clearTimeout);
      this.timers = [];
      if (!woken) this.effects();
      if (reduced.matches) {
        this.after();
        return;
      }
      // the travel distance that carries a sticker off its stage, like the app's span
      const box = this.el.getBoundingClientRect();
      this.k = box.width / 200 || 1;
      this.span = (this.stage().getBoundingClientRect().width + box.width * 2) / this.k;
      this.start = performance.now();
      this.phase = -this.start / 1000;
      this.el.classList.add('playing');
      playing.add(this);
      loop();
    }
    stage() {
      return this.el.closest('[data-stage]') || document.body;
    }
    bubble() {
      const text = this.d.bubble;
      if (!text) return;
      let b = this.bub;
      if (!b) {
        b = this.bub = document.createElement('span');
        b.className = 'bub';
        b.setAttribute('aria-hidden', 'true');
        (this.move || this.el).append(b);
      }
      b.textContent = text;
      b.classList.remove('on');
      void b.offsetWidth; // restart the pop
      b.classList.add('on');
      clearTimeout(this.bubTimer);
      this.bubTimer = setTimeout(() => b.classList.remove('on'), Math.max(900, this.d.dur * 0.85));
    }
    frame(now) {
      let a = -1;
      if (this.start) {
        a = (now - this.start) / this.d.dur;
        if (a >= 1) {
          a = -1;
          this.start = 0;
          playing.delete(this);
          this.el.classList.remove('playing');
          this.motion(-1);
          if (this.after()) return;
        }
      }
      const parts = this.d.parts;
      const c = Math.max(0, now / 1000 + this.phase);
      for (let n = 0; n < parts.length; n++) {
        const g = this.groups[n];
        if (g) g.setAttribute('transform', partTransform(parts[n], c, a));
      }
      if (a >= 0) this.motion(a);
    }
    motion(a) {
      const m = this.d.motion;
      if (!m || !this.move) return;
      if (a < 0) {
        this.move.style.transform = '';
        this.turn.style.transform = '';
        return;
      }
      const k = this.k;
      const tx = (at(m.tx, a) + this.span * at(m.txK, a)) * k * this.flip;
      const ty = (at(m.ty, a) + this.span * at(m.tyK, a)) * k;
      this.move.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
      this.turn.style.transform = `rotate(${(at(m.r, a) * this.flip).toFixed(2)}deg) scale(${at(m.sx, a).toFixed(3)}, ${at(m.sy, a).toFixed(3)})`;
    }
    // what a tap does to the rest of the scene, like the app's WorldScreen (spawn, wake; become and vanish end the tap)
    effects() {
      const d = this.d;
      for (const e of d.effects || []) {
        if (e.kind === 'spawn' && DATA[e.sticker]) {
          const count = e.count ?? 1;
          for (let n = 0; n < count; n++) this.timers.push(setTimeout(() => this.spawn(e), d.dur * 0.55 + n * 180));
        } else if (e.kind === 'wake') {
          // nearby stickers with the tag play their own reaction (a woken one doesn't wake others)
          const box = this.el.getBoundingClientRect();
          const reach = (e.reach ?? 2.2) * box.width;
          const near = [...all].filter((s) => {
            if (s === this || !s.d.tags?.includes(e.tag) || s.stage() !== this.stage()) return false;
            const b = s.el.getBoundingClientRect();
            return Math.hypot(b.x + b.width / 2 - box.x - box.width / 2, b.y + b.height / 2 - box.y - box.height / 2) < reach;
          });
          this.timers.push(setTimeout(() => near.slice(0, 3).forEach((s) => s.play({ woken: true })), 250));
        }
      }
    }
    // a new sticker drops in behind this one (an egg, apples, bubbles); at the cap the oldest pops away
    spawn(e) {
      const stage = this.stage();
      const sb = stage.getBoundingClientRect();
      const box = this.el.getBoundingClientRect();
      const size = box.width;
      const kid = DATA[e.sticker];
      const w = (size * kid.size) / this.d.size;
      const dir = this.flip < 0 ? 1 : -1; // "behind", whichever way it faces
      const jitter = (Math.random() - 0.5) * (e.jitter ?? 0) * size;
      const lift = (Math.random() - 0.5) * (e.jitter ?? 0) * size * 0.35;
      const cx = box.left + size / 2 + dir * size * (e.dx ?? 0) + jitter - sb.left;
      const cy = box.top + size / 2 + size * (e.dy ?? 0.25) + lift - sb.top;
      this.made = this.made.filter((s) => s.el.isConnected);
      while (this.made.length >= Math.min(e.max ?? 6, 3)) this.made.shift().remove();
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'stk spawned';
      el.dataset.s = e.sticker;
      el.setAttribute('aria-label', kid.name);
      el.style.cssText = `position:absolute;width:${w.toFixed(1)}px;left:${(cx - w / 2).toFixed(1)}px;top:${(cy - w / 2).toFixed(1)}px`;
      el.innerHTML = `<span class="mv"><span class="tn"><svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">${kid.svg}</svg></span></span>`;
      stage.append(el);
      this.made.push(new Sticker(el));
      loop();
    }
    // a pumpkin carved into a jack-o'-lantern, a balloon that changes color; a popped bubble goes away.
    // Returns true when the sticker is gone.
    after() {
      const fx = this.d.effects || [];
      const next = fx.find((e) => e.kind === 'become')?.sticker;
      if (next && DATA[next]?.svg) {
        this.svg.innerHTML = DATA[next].svg;
        this.setId(next);
        this.el.setAttribute('aria-label', DATA[next].name);
      } else if (fx.some((e) => e.kind === 'vanish')) {
        this.remove();
        return true;
      }
      return false;
    }
    remove() {
      all.delete(this);
      playing.delete(this);
      visible.delete(this.el);
      io?.unobserve(this.el);
      this.timers.forEach(clearTimeout);
      this.el.classList.add('leaving');
      setTimeout(() => this.el.remove(), 250);
    }
  }

  // ---------- one animation loop for everything on screen ----------

  let running = false;
  let lastIdle = 0;
  function tick(now) {
    // idle breathing runs at ~30 fps (it's slow); a sticker playing its reaction gets every frame
    const idle = !reduced.matches && now - lastIdle > 30;
    if (idle) lastIdle = now;
    for (const s of all) {
      if (playing.has(s) || (idle && visible.has(s.el))) s.frame(now);
    }
    if (playing.size || (!reduced.matches && visible.size)) requestAnimationFrame(tick);
    else running = false;
  }
  function loop() {
    if (running) return;
    running = true;
    requestAnimationFrame(tick);
  }

  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      loop();
    },
    { rootMargin: '80px' }
  );
  document.querySelectorAll('.stk[data-s]').forEach((el) => {
    if (DATA[el.dataset.s]) new Sticker(el);
  });
  window.LW.stickers = all; // for checking poses by hand: s.start = now - a * s.d.dur; s.frame(now)
  reduced.addEventListener?.('change', loop);
})();
