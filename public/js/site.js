// The page's small extras: the hero's "tap the ghost" hint, and the challenge demo (the last three challenges of a
// round, read aloud, with confetti and the prize at the end, like the app).
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const sound = (src, voice) => window.LW?.sound(src, { voice });

  // the hint goes away after the first tap in the scene
  const hint = document.querySelector('[data-hint]');
  hint?.parentElement.addEventListener('sticker:play', () => hint.classList.add('gone'), { once: true });

  function confetti(host) {
    if (reduced.matches) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['#FFD34D', '#FF6B8B', '#4FD1B5', '#9C7CF4', '#8FD3FF', '#FF9F43'];
    for (let n = 0; n < 36; n++) {
      const i = document.createElement('i');
      i.style.left = `${Math.random() * 100}%`;
      i.style.background = colors[n % colors.length];
      i.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
      i.style.setProperty('--r', `${(Math.random() - 0.5) * 900}deg`);
      i.style.setProperty('--t', `${0.9 + Math.random() * 0.9}s`);
      i.style.animationDelay = `${Math.random() * 0.25}s`;
      box.append(i);
    }
    host.append(box);
    setTimeout(() => box.remove(), 2200);
  }

  const demo = document.getElementById('demo');
  const cfgEl = document.getElementById('demo-data');
  if (!demo || !cfgEl) return;
  const cfg = JSON.parse(cfgEl.textContent);
  const stage = demo.querySelector('[data-stage]');
  const bar = demo.querySelector('.mission');
  const text = demo.querySelector('[data-m-text]');
  const count = demo.querySelector('[data-m-count]');
  const say = demo.querySelector('[data-m-say]');
  const prize = demo.querySelector('[data-prize]');
  const again = document.querySelector('[data-demo-reset]');
  const FIRST = 10 - cfg.steps.length + 1; // the round's 8th, 9th and 10th
  let step = 0;
  let busy = false;
  let line = cfg.steps[0].voice;

  function show() {
    const s = cfg.steps[step];
    bar.classList.remove('done', 'won');
    text.textContent = s.text;
    count.textContent = FIRST + step;
    line = s.voice;
    stage.querySelectorAll('.stk').forEach((el) => el.classList.toggle('want', el.dataset.s === s.id));
  }

  stage.addEventListener('sticker:play', (e) => {
    if (busy || step >= cfg.steps.length || e.detail.id !== cfg.steps[step].id) return;
    busy = true;
    stage.querySelectorAll('.stk.want').forEach((el) => el.classList.remove('want'));
    // celebrate once the sticker has done its thing, like the app
    setTimeout(() => {
      step++;
      const cheer = cfg.cheers[(step - 1) % cfg.cheers.length];
      bar.classList.add('done');
      text.textContent = cheer.text;
      line = cheer.voice;
      confetti(stage);
      sound(cfg.success);
      setTimeout(() => sound(cheer.voice, true), 300);
      setTimeout(() => {
        if (step < cfg.steps.length) {
          show();
          sound(line, true);
          busy = false;
          return;
        }
        bar.classList.remove('done');
        bar.classList.add('won');
        text.textContent = cfg.prize.text;
        line = cfg.prize.voice;
        prize.hidden = false;
        prize.classList.add('show');
        confetti(stage);
        sound(cfg.won);
        setTimeout(() => sound(cfg.prize.voice, true), 700);
        again.hidden = false;
        busy = false;
      }, 1900);
    }, 900);
  });

  say.addEventListener('click', () => sound(line, true));
  again.addEventListener('click', () => {
    step = 0;
    prize.hidden = true;
    prize.classList.remove('show');
    again.hidden = true;
    show();
    sound(line, true);
  });
  show();
})();
