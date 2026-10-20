// Snake Tik · dibujo del juego en 9:16 (1080x1920). Lo usan la ventana del juego y la demo de la web.
(function (root) {
  'use strict';
  const W = 1080, H = 1920, BOARD = 1000, BX = 40, BY = 470;
  const FONT_T = 'Lilita, "Arial Black", sans-serif', FONT = 'Fredoka, "Segoe UI", sans-serif';
  const DIR_NAMES = ['right', 'left', 'down', 'up'];

  // ---------- pistas ----------
  const BOARDS = {
    grass: { a: '#86cf4f', b: '#7cc546', frame: '#2a1546', light: 'rgba(255,255,220,.14)', shade: 'rgba(0,40,0,.22)' },
    dirt: { a: '#b98656', b: '#ad7b4c', frame: '#3b2414', light: 'rgba(255,230,190,.12)', shade: 'rgba(40,20,0,.25)' },
    mines: { a: '#c6ccd5', b: '#c6ccd5', frame: '#4b5262', bevel: true, light: 'rgba(255,255,255,.05)', shade: 'rgba(0,0,0,.08)' },
    sand: { a: '#f3dca4', b: '#ecd194', frame: '#7a5a2e', light: 'rgba(255,255,255,.15)', shade: 'rgba(120,80,0,.15)' },
    snow: { a: '#eef6ff', b: '#e1ecfa', frame: '#2b4a6e', light: 'rgba(255,255,255,.2)', shade: 'rgba(40,80,140,.12)' },
    night: { a: '#1f2547', b: '#1a1f3d', frame: '#0b0f22', neon: true, light: 'rgba(120,140,255,.10)', shade: 'rgba(0,0,0,.3)' },
    candy: { a: '#ffd3e8', b: '#ffc2de', frame: '#7a2e59', light: 'rgba(255,255,255,.18)', shade: 'rgba(160,40,100,.12)' },
  };
  // ---------- animales ----------
  const ANIMALS = {
    snake: { color: '#8b5cf6', kind: 'pipe' },
    croc: { color: '#4f9a3a', kind: 'pipe', scales: true, snout: true, width: 0.94 },
    dragon: { color: '#e5484d', kind: 'pipe', spikes: true, horns: true },
    neon: { color: '#22d3ee', kind: 'pipe', glow: true },
    worm: { color: '#f49ac1', kind: 'seg', rings: true },
    caterpillar: { color: '#7bd34a', kind: 'seg', legs: true, antennae: true },
  };

  function mix(hex, to, a) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = to === 'white' ? 255 : 0;
    const f = (c) => Math.round(c + (t - c) * a);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  function palette(hex) { return { main: hex, light: mix(hex, 'white', 0.4), dark: mix(hex, 'black', 0.62), line: mix(hex, 'black', 0.25) }; }

  function sprite(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); return c; }
  const SPR = 128;
  const appleSpr = (gold) => sprite(SPR, (g, s) => {
    const r = s * 0.36, cx = s / 2, cy = s * 0.56;
    const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.1);
    gr.addColorStop(0, gold ? '#fff6b0' : '#ff8a80'); gr.addColorStop(0.45, gold ? '#ffd23f' : '#ef3b36'); gr.addColorStop(1, gold ? '#c98a00' : '#a3121a');
    g.fillStyle = gr; g.beginPath(); g.moveTo(cx, cy - r * 0.7);
    g.bezierCurveTo(cx + r * 1.25, cy - r * 1.35, cx + r * 1.35, cy + r * 0.9, cx, cy + r);
    g.bezierCurveTo(cx - r * 1.35, cy + r * 0.9, cx - r * 1.25, cy - r * 1.35, cx, cy - r * 0.7); g.fill();
    g.strokeStyle = gold ? '#8a5a00' : '#6d0b12'; g.lineWidth = s * 0.03; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(cx - r * 0.42, cy - r * 0.25, r * 0.16, r * 0.3, -0.5, 0, 7); g.fill();
    g.strokeStyle = '#6b4226'; g.lineWidth = s * 0.05; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, cy - r * 0.65); g.quadraticCurveTo(cx + 2, cy - r * 1.2, cx + r * 0.25, cy - r * 1.35); g.stroke();
    g.fillStyle = '#4caf50'; g.beginPath(); g.ellipse(cx + r * 0.55, cy - r * 1.1, r * 0.42, r * 0.2, -0.5, 0, 7); g.fill();
    g.strokeStyle = '#2e7d32'; g.lineWidth = s * 0.02; g.stroke();
  });
  const BOMB_TIP = [0.5 + 0.34 * 1.05, 0.58 - 0.34 * 1.3];

  function create(cv, opts = {}) {
    const ctx = cv.getContext('2d');
    const SFX = opts.sfx || { play() {}, key() {}, configure() {}, unlock() {} };
    const T = (k) => (opts.i18n ? opts.i18n.t(k) : k);
    const APPLE = appleSpr(false), GOLD = appleSpr(true);
    const BOMB = sprite(SPR, (g, s) => {
      const r = s * 0.34, cx = s / 2, cy = s * 0.58;
      const gr = g.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r * 1.1);
      gr.addColorStop(0, '#6b6b80'); gr.addColorStop(0.5, '#25222e'); gr.addColorStop(1, '#07060a');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = s * 0.03; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(cx - r * 0.4, cy - r * 0.38, r * 0.2, r * 0.12, -0.7, 0, 7); g.fill();
      g.fillStyle = '#8d8d9a'; g.fillRect(cx + r * 0.2, cy - r * 1.15, r * 0.5, r * 0.36);
      g.strokeStyle = '#c9a36a'; g.lineWidth = s * 0.035; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx + r * 0.45, cy - r * 1.12); g.quadraticCurveTo(cx + r * 0.9, cy - r * 1.6, cx + r * 1.05, cy - r * 1.3); g.stroke();
    });

    let S = { speed: 12, grid: 20, toasts: true, stats: { wins: 0, losses: 0 }, board: 'grass', animal: 'snake', color: null,
      speedup: false, countdown: 10, lang: 'es', discord: '', sound: null, title: 'SNAKE TIK', demo: false };
    let game = new SnakeCore.Game(20);
    let prevSnake = game.snake.slice();
    let acc = 0, last = performance.now(), endAt = 0, shake = 0, locked = false, paused = false;
    const born = new Map();      // casilla -> {t, fx, fy} animación de caída
    const particles = [], toasts = [], airdrops = [];
    let banner = null, fullT0 = 0, lastTickSec = -1, pops = { w: 0, l: 0 }, lastSnd = {};

    function snd(ev, gap = 60) { const t = performance.now(); if (t - (lastSnd[ev] || 0) < gap) return; lastSnd[ev] = t; SFX.play(ev); }
    function newGame(n) {
      const st = { w: game.wins, l: game.losses };
      game = new SnakeCore.Game(n); game.wins = st.w; game.losses = st.l; game.stallSteps = 15 * S.speed;
      prevSnake = game.snake.slice(); born.clear(); fullT0 = 0;
    }
    function applySettings(s, first) {
      const gridChanged = s.grid && s.grid !== game.n;
      S = Object.assign(S, s);
      if (opts.i18n && s.lang) opts.i18n.set(s.lang);
      if (s.sound) SFX.configure(s.sound);
      if (first || gridChanged) newGame(S.grid);
      if (first && S.stats) { game.wins = S.stats.wins; game.losses = S.stats.losses; }
      game.stallSteps = 15 * S.speed;
    }

    // ---------- utilidades ----------
    function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
    function text(str, x, y, size, fill, o = {}) {
      ctx.font = `${o.weight || ''} ${size}px ${o.font || FONT_T}`;
      ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
      if (o.stroke !== 0) { ctx.lineWidth = o.stroke || size * 0.16; ctx.strokeStyle = o.strokeColor || '#1b0b33'; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
      ctx.fillStyle = fill; ctx.fillText(str, x, y);
    }
    function pill(x, y, w, h, color, label, size) {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
      rrect(x, y, w, h, h / 2); const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, mix(color, 'white', 0.25)); g.addColorStop(1, color); ctx.fillStyle = g; ctx.fill(); ctx.restore();
      ctx.lineWidth = 6; ctx.strokeStyle = '#1b0b33'; rrect(x, y, w, h, h / 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.22)'; rrect(x + 10, y + 6, w - 20, h * 0.35, h * 0.2); ctx.fill();
      text(label, x + w / 2, y + h / 2 + 2, size || h * 0.55, '#fff');
    }
    const cell = () => BOARD / game.n;
    const cellC = (i) => { const n = game.n, s = BOARD / n; return [BX + (i % n + 0.5) * s, BY + (((i / n) | 0) + 0.5) * s]; };

    // ---------- fondo y cabecera ----------
    const motes = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 2 + Math.random() * 5, s: 10 + Math.random() * 30, p: Math.random() * 6 }));
    function drawBackground(t) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2b1458'); g.addColorStop(0.45, '#3a1a6e'); g.addColorStop(1, '#0f2b3d');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (const [x, y, r, c] of [[160, 260, 420, 'rgba(255,120,200,.16)'], [920, 520, 480, 'rgba(120,200,255,.14)'], [540, 1700, 600, 'rgba(120,255,180,.12)']]) {
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      for (const m of motes) {
        const y = (m.y - t * m.s / 1000) % H, yy = y < 0 ? y + H : y;
        ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t / 900 + m.p);
        ctx.beginPath(); ctx.arc(m.x + Math.sin(t / 1500 + m.p) * 20, yy, m.r, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    function drawHeader(t) {
      const bob = Math.sin(t / 600) * 6;
      ctx.save(); ctx.translate(W / 2, 205 + bob); ctx.rotate(Math.sin(t / 1400) * 0.015);
      ctx.font = `150px ${FONT_T}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = 34; ctx.strokeStyle = '#1b0b33'; ctx.strokeText(S.title, 0, 8);
      ctx.lineWidth = 22; ctx.strokeStyle = '#ffffff'; ctx.strokeText(S.title, 0, 0);
      const lg = ctx.createLinearGradient(0, -70, 0, 70); lg.addColorStop(0, '#d9ff6b'); lg.addColorStop(0.55, '#7be04a'); lg.addColorStop(1, '#2fb35a');
      ctx.fillStyle = lg; ctx.fillText(S.title, 0, 0); ctx.restore();
      const sw = 1 + 0.25 * Math.max(0, 1 - (t - pops.w) / 500), sl = 1 + 0.25 * Math.max(0, 1 - (t - pops.l) / 500);
      ctx.save(); ctx.translate(330, 345); ctx.scale(sw, sw); pill(-130, -42, 260, 84, '#2fbf5b', `🏆 ${game.wins}`, 50); ctx.restore();
      ctx.save(); ctx.translate(750, 345); ctx.scale(sl, sl); pill(-130, -42, 260, 84, '#e5484d', `💀 ${game.losses}`, 50); ctx.restore();
      const keys = [[540, 315, 3], [490, 365, 1], [540, 365, 2], [590, 365, 0]], arrows = ['→', '←', '↓', '↑'];
      for (const [x, y, d] of keys) {
        const on = game.dir === d && game.state === 'play';
        const press = on && (t - (game._turnT || 0)) < 120 ? 4 : 0;
        rrect(x - 22, y - 22 + press, 44, 44, 10); ctx.fillStyle = on ? '#ffd23f' : 'rgba(255,255,255,.14)'; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = on ? '#1b0b33' : 'rgba(255,255,255,.25)'; ctx.stroke();
        text(arrows[d], x, y + 2 + press, 30, on ? '#1b0b33' : 'rgba(255,255,255,.6)', { stroke: 0, font: FONT, weight: 700 });
      }
      const p = Math.min(1, game.progress()), x = BX, y = 412, w = BOARD, h = 38;
      rrect(x, y, w, h, h / 2); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
      if (p > 0) {
        rrect(x + 4, y + 4, Math.max(h - 8, (w - 8) * p), h - 8, (h - 8) / 2);
        const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#a78bfa'); g.addColorStop(1, '#f472b6');
        ctx.fillStyle = g; ctx.fill();
      }
      text(`🐍 ${game.snake.length + game.filled.size}  ·  ${Math.floor(p * 100)}%`, x + w / 2, y + h / 2 + 1, 28, '#fff', { font: FONT, weight: 700, stroke: 6 });
    }

    // ---------- tablero ----------
    function drawBoard(t, alpha) {
      const B = BOARDS[S.board] || BOARDS.grass;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
      rrect(BX - 22, BY - 22, BOARD + 44, BOARD + 44, 46); ctx.fillStyle = B.frame; ctx.fill(); ctx.restore();
      rrect(BX - 22, BY - 22, BOARD + 44, BOARD + 44, 46); ctx.lineWidth = 8; ctx.strokeStyle = '#1b0b33'; ctx.stroke();
      rrect(BX - 12, BY - 12, BOARD + 24, BOARD + 24, 38); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.stroke();
      ctx.save(); rrect(BX, BY, BOARD, BOARD, 28); ctx.clip();
      const n = game.n, s = BOARD / n;
      ctx.fillStyle = B.a; ctx.fillRect(BX, BY, BOARD, BOARD);
      if (B.bevel) { // estilo buscaminas: casillas en relieve
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          const px = BX + x * s, py = BY + y * s, b = Math.max(2, s * 0.09);
          ctx.fillStyle = '#eef1f5'; ctx.fillRect(px, py, s, b); ctx.fillRect(px, py, b, s);
          ctx.fillStyle = '#8b93a1'; ctx.fillRect(px, py + s - b, s, b); ctx.fillRect(px + s - b, py, b, s);
        }
      } else {
        ctx.fillStyle = B.b;
        for (let y = 0; y < n; y++) for (let x = (y & 1); x < n; x += 2) ctx.fillRect(BX + x * s, BY + y * s, s, s);
      }
      if (B.neon) {
        ctx.strokeStyle = 'rgba(120,140,255,.25)'; ctx.lineWidth = 2;
        for (let i = 1; i < n; i++) { ctx.beginPath(); ctx.moveTo(BX + i * s, BY); ctx.lineTo(BX + i * s, BY + BOARD); ctx.moveTo(BX, BY + i * s); ctx.lineTo(BX + BOARD, BY + i * s); ctx.stroke(); }
      }
      const rg = ctx.createRadialGradient(W / 2, BY + BOARD * 0.35, 100, W / 2, BY + BOARD / 2, BOARD * 0.75);
      rg.addColorStop(0, B.light); rg.addColorStop(1, B.shade); ctx.fillStyle = rg; ctx.fillRect(BX, BY, BOARD, BOARD);
      drawFilled(s);
      drawItems(t, s);
      drawSnake(t, s, alpha);
      drawPlanes(t, s);
      drawParticles(true);
      ctx.restore();
    }

    function dropAnim(c, t) {
      const b = born.get(c); if (!b) return [1, 0, 0];
      const dur = b.fy !== undefined ? 520 : 380, a = Math.min(1, (t - b.t) / dur);
      if (a >= 1) { born.delete(c); return [1, 0, 0]; }
      const e = 1 - Math.pow(1 - a, 3);
      if (b.fy !== undefined) { const [cx, cy] = cellC(c); return [0.6 + 0.4 * e, (b.fy - cy) * (1 - e), ((b.fx ?? cx) - cx) * (1 - e)]; }
      return [0.4 + 0.6 * e + Math.sin(a * Math.PI) * 0.25, -(1 - e) * 120, 0];
    }
    function drawItems(t, s) {
      const size = s * 1.12;
      for (const [c, v] of game.apples) {
        const [cx, cy] = cellC(c); const [sc, dy, dx] = dropAnim(c, t);
        const z = size * sc, sway = Math.sin(t / 600 + c * 0.7) * 0.16; // balanceo suave de izquierda a derecha
        ctx.save(); ctx.translate(cx + dx, cy + dy + s * 0.25); ctx.rotate(sway);
        ctx.drawImage(v > 1 ? GOLD : APPLE, -z / 2, -z / 2 - s * 0.3, z, z); ctx.restore();
        if (v > 1 && Math.sin(t / 200 + c) > 0.6) sparkle(cx + s * 0.3, cy - s * 0.35, s * 0.18, '#fff6b0');
      }
      for (const c of game.bombs) {
        const [cx, cy] = cellC(c); const [sc, dy] = dropAnim(c, t);
        const z = size * sc * (1 + Math.sin(t / 160 + c) * 0.04);
        ctx.drawImage(BOMB, cx - z / 2, cy - z / 2 + dy - s * 0.05, z, z);
        const fx = cx - z / 2 + BOMB_TIP[0] * z, fy = cy - z / 2 + dy - s * 0.05 + BOMB_TIP[1] * z, f = 0.6 + Math.random() * 0.6;
        ctx.fillStyle = `rgba(255,${150 + (Math.random() * 90 | 0)},40,.95)`; ctx.beginPath(); ctx.arc(fx, fy, s * 0.1 * f, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff7c2'; ctx.beginPath(); ctx.arc(fx, fy, s * 0.045 * f, 0, 7); ctx.fill();
      }
    }
    function sparkle(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.35 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.fill(); }

    function animalPalette() {
      const A = ANIMALS[S.animal] || ANIMALS.snake;
      let p = palette(S.color || A.color);
      if (game.state === 'lose') p = palette('#6b6b78');
      return { A, p };
    }
    function drawFilled(s) { // huecos rellenados por el rescate: bloques del color del animal
      if (!game.filled.size) return;
      const { p } = animalPalette();
      for (const c of game.filled) {
        const [cx, cy] = cellC(c);
        rrect(cx - s * 0.42, cy - s * 0.42, s * 0.84, s * 0.84, s * 0.3); ctx.fillStyle = p.dark; ctx.fill();
        rrect(cx - s * 0.34, cy - s * 0.34, s * 0.68, s * 0.68, s * 0.24); ctx.fillStyle = p.main; ctx.fill();
      }
    }

    // trazo del cuerpo por el centro de las casillas (esquinas en ángulo recto, sin cortar en diagonal)
    function pipePoints(alpha) {
      const cur = game.snake, prev = prevSnake.length ? prevSnake : cur;
      const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      const pts = [lerp(cellC(prev[0]), cellC(cur[0]), alpha)];
      const grew = cur.length > prev.length;
      for (let i = 0; i < prev.length - 1; i++) pts.push(cellC(prev[i]));
      const lastP = cellC(prev[prev.length - 1]);
      pts.push(grew || prev.length < 2 ? lastP : lerp(lastP, cellC(prev[prev.length - 2]), alpha));
      return pts;
    }
    // animales de segmentos: cada bolita avanza en línea recta de su casilla a la siguiente
    function segPoints(alpha) {
      const cur = game.snake, prev = prevSnake.length ? prevSnake : cur, pts = [];
      for (let i = 0; i < cur.length; i++) {
        const a = cellC(cur[i]), b = cellC(prev[Math.min(i, prev.length - 1)]);
        pts.push([b[0] + (a[0] - b[0]) * alpha, b[1] + (a[1] - b[1]) * alpha]);
      }
      return pts;
    }

    function drawSnake(t, s, alpha) {
      const { A, p } = animalPalette();
      const dead = game.state === 'lose', won = game.state === 'win';
      if (won) { const h = (t / 8) % 360; p.main = `hsl(${h},80%,62%)`; p.light = `hsl(${h},90%,78%)`; p.line = `hsl(${h},70%,45%)`; }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (A.kind === 'seg') {
        const pts = segPoints(alpha);
        for (let i = pts.length - 1; i >= 1; i--) {
          const [x, y] = pts[i], r = s * (0.42 - 0.08 * (i / pts.length));
          ctx.fillStyle = 'rgba(0,30,0,.2)'; ctx.beginPath(); ctx.arc(x, y + s * 0.1, r, 0, 7); ctx.fill();
          ctx.fillStyle = p.dark; ctx.beginPath(); ctx.arc(x, y, r + s * 0.05, 0, 7); ctx.fill();
          ctx.fillStyle = A.legs && i % 2 ? p.light : p.main; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
          if (A.rings) { ctx.strokeStyle = p.line; ctx.lineWidth = s * 0.05; ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, 7); ctx.stroke(); }
          if (A.legs && i % 2 === 0) { ctx.fillStyle = p.dark; ctx.fillRect(x - r * 0.9, y + r * 0.6, r * 0.25, r * 0.4); ctx.fillRect(x + r * 0.65, y + r * 0.6, r * 0.25, r * 0.4); }
        }
        drawHead(pts[0], t, s, dead, p, A);
        return;
      }
      const pts = pipePoints(alpha);
      const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); };
      const wmul = A.width || 0.9;
      ctx.save(); ctx.translate(0, s * 0.12); path(); ctx.lineWidth = s * wmul; ctx.strokeStyle = 'rgba(0,30,0,.25)'; ctx.stroke(); ctx.restore();
      if (A.glow) { ctx.save(); ctx.shadowColor = p.main; ctx.shadowBlur = 30; path(); ctx.lineWidth = s * 0.7; ctx.strokeStyle = p.main; ctx.stroke(); ctx.restore(); }
      path(); ctx.lineWidth = s * wmul; ctx.strokeStyle = p.dark; ctx.stroke();
      path(); ctx.lineWidth = s * (wmul - 0.16); ctx.strokeStyle = p.main; ctx.stroke();
      path(); ctx.lineWidth = s * 0.36; ctx.strokeStyle = p.light; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
      path(); ctx.lineWidth = s * 0.1; ctx.strokeStyle = p.line; ctx.stroke();
      if (A.scales || A.spikes) {
        for (let i = 2; i < pts.length - 1; i++) {
          const [x, y] = pts[i];
          if (A.scales) { ctx.fillStyle = p.dark; ctx.beginPath(); ctx.arc(x, y, s * 0.09, 0, 7); ctx.fill(); }
          if (A.spikes && i % 2 === 0) { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(x - s * 0.12, y + s * 0.05); ctx.lineTo(x, y - s * 0.22); ctx.lineTo(x + s * 0.12, y + s * 0.05); ctx.fill(); }
        }
      }
      drawHead(pts[0], t, s, dead, p, A);
    }

    function drawHead([hx, hy], t, s, dead, p, A) {
      const ang = [0, Math.PI, Math.PI / 2, -Math.PI / 2][game.dir];
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
      if (!dead && !A.snout && Math.sin(t / 140) > 0.3) {
        ctx.strokeStyle = '#ff3b6b'; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(s * 0.45, 0); ctx.lineTo(s * 0.72, 0); ctx.lineTo(s * 0.84, -s * 0.08); ctx.moveTo(s * 0.72, 0); ctx.lineTo(s * 0.84, s * 0.08); ctx.stroke();
      }
      ctx.fillStyle = p.dark; ctx.beginPath(); ctx.ellipse(s * 0.06, 0, s * 0.58, s * 0.52, 0, 0, 7); ctx.fill();
      ctx.fillStyle = p.main; ctx.beginPath(); ctx.ellipse(s * 0.06, 0, s * 0.5, s * 0.44, 0, 0, 7); ctx.fill();
      if (A.snout) { // cocodrilo: hocico largo con dientes
        ctx.fillStyle = p.dark; rrect(-s * 0.1, -s * 0.36, s * 0.95, s * 0.72, s * 0.28); ctx.fill();
        ctx.fillStyle = p.main; rrect(-s * 0.05, -s * 0.3, s * 0.85, s * 0.6, s * 0.24); ctx.fill();
        ctx.fillStyle = '#fff';
        for (let k = 0; k < 4; k++) for (const side of [-1, 1]) { const x = s * (0.2 + k * 0.15); ctx.beginPath(); ctx.moveTo(x, side * s * 0.3); ctx.lineTo(x + s * 0.06, side * s * 0.18); ctx.lineTo(x + s * 0.12, side * s * 0.3); ctx.fill(); }
        ctx.fillStyle = p.dark; for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 0.68, side * s * 0.1, s * 0.035, 0, 7); ctx.fill(); }
      }
      if (A.horns) { ctx.fillStyle = '#ffd23f'; for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-s * 0.2, side * s * 0.3); ctx.lineTo(-s * 0.5, side * s * 0.62); ctx.lineTo(-s * 0.02, side * s * 0.42); ctx.fill(); } }
      if (A.antennae) { ctx.strokeStyle = p.dark; ctx.lineWidth = s * 0.05; for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 0.1, side * s * 0.3); ctx.lineTo(s * 0.35, side * s * 0.62); ctx.stroke(); ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(s * 0.35, side * s * 0.62, s * 0.07, 0, 7); ctx.fill(); } }
      const blink = !dead && (t % 3200) < 140;
      for (const side of [-1, 1]) {
        const ex = s * 0.2, ey = side * s * 0.22;
        ctx.fillStyle = A.snout ? '#ffe680' : '#fff'; ctx.beginPath(); ctx.ellipse(ex, ey, s * 0.17, blink ? s * 0.03 : s * 0.17, 0, 0, 7); ctx.fill();
        if (dead) {
          ctx.strokeStyle = '#1b0b33'; ctx.lineWidth = s * 0.05;
          ctx.beginPath(); ctx.moveTo(ex - s * 0.08, ey - s * 0.08); ctx.lineTo(ex + s * 0.08, ey + s * 0.08); ctx.moveTo(ex + s * 0.08, ey - s * 0.08); ctx.lineTo(ex - s * 0.08, ey + s * 0.08); ctx.stroke();
        } else if (!blink) {
          ctx.fillStyle = '#140826'; ctx.beginPath(); ctx.arc(ex + s * 0.06, ey, s * 0.09, 0, 7); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + s * 0.09, ey - s * 0.04, s * 0.03, 0, 7); ctx.fill();
        }
      }
      ctx.fillStyle = 'rgba(255,120,170,.45)';
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(-s * 0.05, side * s * 0.33, s * 0.09, s * 0.06, 0, 0, 7); ctx.fill(); }
      ctx.restore();
    }

    // ---------- airdrop (avión que cruza por el medio soltando manzanas por columnas) ----------
    function startAirdrop(amount) { airdrops.push({ amount, t0: null, done: new Set(), left: amount }); }
    function updatePlanes(t) {
      const a = airdrops[0]; if (!a || game.state !== 'play') return;
      if (a.t0 === null) { a.t0 = t; SFX.play('airdrop'); banner2(T('airdrop'), '#7dd3fc', t); }
      const dur = 3600, k = (t - a.t0) / dur;
      a.x = W + 260 - (W + 520) * k; a.y = BY + BOARD / 2;
      const n = game.n, s = BOARD / n;
      for (let col = n - 1; col >= 0; col--) {
        if (a.done.has(col)) continue;
        const cx = BX + (col + 0.5) * s;
        if (a.x > cx) break;
        a.done.add(col);
        const per = Math.ceil(a.left / (n - a.done.size + 1));
        const placed = game.dropColumn(col, per);
        a.left -= placed;
        for (const e of game.events) if (e.type === 'apple' && e.drop && !born.has(e.cell)) born.set(e.cell, { t, fx: cx, fy: a.y });
      }
      if (k >= 1) { if (a.left > 0) game.add('apples', a.left); airdrops.shift(); }
    }
    function drawPlanes(t, s) {
      const a = airdrops[0]; if (!a || a.t0 === null || a.x === undefined) return;
      const { x, y } = a, sc = 1.25;
      // sombra en el tablero
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x + 30, y + 140, 170 * sc, 40 * sc, 0, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(x, y + Math.sin(t / 250) * 8); ctx.scale(sc, sc);
      ctx.fillStyle = '#e2e8f0'; ctx.strokeStyle = '#1b0b33'; ctx.lineWidth = 6;
      rrect(-150, -34, 300, 68, 34); ctx.fill(); ctx.stroke();                               // fuselaje
      ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.moveTo(-30, -20); ctx.lineTo(40, -140); ctx.lineTo(80, -140); ctx.lineTo(50, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-30, 20); ctx.lineTo(40, 140); ctx.lineTo(80, 140); ctx.lineTo(50, 20); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(110, -20); ctx.lineTo(150, -70); ctx.lineTo(160, -70); ctx.lineTo(150, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#38bdf8'; rrect(-130, -16, 40, 32, 12); ctx.fill();                  // cabina
      ctx.fillStyle = '#ef4444'; rrect(-60, -30, 120, 14, 7); ctx.fill();
      ctx.save(); ctx.translate(-160, 0); ctx.rotate(t / 30); ctx.fillStyle = '#334155'; rrect(-6, -60, 12, 120, 6); ctx.fill(); ctx.restore();
      ctx.restore();
    }

    // ---------- partículas / avisos ----------
    function burst(x, y, color, n, speed = 8, size = 10) {
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random()); particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, g: 0.35, life: 1, decay: 0.02 + Math.random() * 0.02, color, size: size * (0.5 + Math.random()), board: true }); }
    }
    function floatText(x, y, str, color) { particles.push({ x, y, vx: 0, vy: -2.2, g: 0, life: 1, decay: 0.018, text: str, color, board: true }); }
    function confetti() {
      const cols = ['#ffd23f', '#f472b6', '#a78bfa', '#4ade80', '#60a5fa', '#fb7185'];
      for (let i = 0; i < 220; i++) particles.push({ x: Math.random() * W, y: -40 - Math.random() * 400, vx: (Math.random() - 0.5) * 4, vy: 3 + Math.random() * 5, g: 0.06, life: 1, decay: 0.004, color: cols[i % cols.length], size: 10 + Math.random() * 10, rot: Math.random() * 6, conf: true, board: false });
    }
    function drawParticles(board) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; if (p.board !== board) continue;
        p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, p.life * 1.5);
        if (p.text) text(p.text, p.x, p.y, 46, p.color, { stroke: 10 });
        else if (p.conf) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot += 0.1); ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); }
        else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, 7); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }
    function addToast(nick, what, amount, source) {
      if (!S.toasts || !nick) return;
      const emo = what === 'bombs' ? '💣' : what === 'gold' ? '🍏' : what === 'airdrop' ? '✈️🍎' : '🍎';
      toasts.unshift({ str: `${nick} · ${source}`, sub: `+${amount} ${emo}`, t0: performance.now(), bomb: what === 'bombs' });
      toasts.length = Math.min(toasts.length, 3);
    }
    function drawToasts(t) {
      toasts.forEach((o, i) => {
        const age = t - o.t0; if (age > 3500) { toasts.splice(i, 1); return; }
        const slide = Math.min(1, age / 250), out = Math.max(0, (age - 3100) / 400);
        const x = BX + 20 - (1 - slide) * 600 - out * 600, y = BY + 24 + i * 92;
        ctx.globalAlpha = 1 - out;
        rrect(x, y, 640, 78, 39); ctx.fillStyle = o.bomb ? 'rgba(40,10,20,.82)' : 'rgba(27,11,51,.82)'; ctx.fill();
        ctx.lineWidth = 5; ctx.strokeStyle = o.bomb ? '#ff6b6b' : '#ffd23f'; ctx.stroke();
        ctx.font = `600 30px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
        let s = o.str; while (ctx.measureText(s).width > 430 && s.length > 4) s = s.slice(0, -2);
        ctx.fillText(s === o.str ? s : s + '…', x + 26, y + 40);
        text(o.sub, x + 560, y + 41, 40, o.bomb ? '#ff8a8a' : '#ffe680', { stroke: 8 });
        ctx.globalAlpha = 1;
      });
    }
    let banner2Obj = null;
    function banner2(str, color, t) { banner2Obj = { str, color, t0: t }; }
    function drawBanner(t) {
      if (banner2Obj) {
        const age = t - banner2Obj.t0;
        if (age > 1800) banner2Obj = null;
        else { const k = Math.min(1, age / 300), out = Math.max(0, (age - 1400) / 400); ctx.globalAlpha = 1 - out; text(banner2Obj.str, W / 2, BY - 0, 90 * (0.6 + 0.4 * k), banner2Obj.color, { stroke: 18 }); ctx.globalAlpha = 1; }
      }
      if (fullT0 && game.state === 'play') { // cuenta atrás de victoria
        const left = Math.max(0, S.countdown - (t - fullT0) / 1000), sec = Math.ceil(left);
        const pulse = 1 + 0.12 * (1 - (left % 1));
        ctx.save(); ctx.translate(W / 2, BY + BOARD / 2); ctx.scale(pulse, pulse);
        ctx.fillStyle = 'rgba(20,8,40,.78)'; ctx.beginPath(); ctx.arc(0, 0, 190, 0, 7); ctx.fill();
        ctx.lineWidth = 14; ctx.strokeStyle = '#7be04a'; ctx.beginPath(); ctx.arc(0, 0, 190, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (left / S.countdown)); ctx.stroke();
        text(String(sec), 0, 10, 170, '#7be04a', { stroke: 22 });
        ctx.restore();
        text(T('fullTitle'), W / 2, BY + BOARD / 2 - 250, 60, '#fff', { stroke: 14 });
        text(T('fullHint'), W / 2, BY + BOARD / 2 + 250, 38, '#ffd2d2', { font: FONT, weight: 700, stroke: 9 });
      }
      if (!banner) return;
      const age = t - banner.t0, k = Math.min(1, age / 350);
      const sc = k < 1 ? 0.3 + 0.7 * (1 - Math.pow(1 - k, 3)) + Math.sin(k * Math.PI) * 0.15 : 1 + Math.sin(t / 250) * 0.03;
      ctx.save(); ctx.translate(W / 2, BY + BOARD / 2 - 40); ctx.scale(sc, sc);
      rrect(-440, -120, 880, 240, 60); ctx.fillStyle = 'rgba(20,8,40,.85)'; ctx.fill();
      ctx.lineWidth = 10; ctx.strokeStyle = banner.color; ctx.stroke();
      text(banner.text, 0, -25, 120, banner.color, { stroke: 26 });
      const left = Math.max(0, Math.ceil((endAt - t) / 1000));
      text(`${banner.sub} · ${T('newGame')} ${left}`, 0, 72, 36, '#fff', { font: FONT, weight: 700, stroke: 8 });
      ctx.restore();
    }
    const DISCORD = new Path2D('M60.1 4.9A58.5 58.5 0 0 0 45.6.4a40 40 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A39 39 0 0 0 25.8.4 58.4 58.4 0 0 0 11.3 4.9C2.1 18.6-.4 32 .8 45.2a58.8 58.8 0 0 0 17.9 9 43 43 0 0 0 3.8-6.2 38 38 0 0 1-6-2.9l1.5-1.1a42 42 0 0 0 35.9 0l1.5 1.1a38 38 0 0 1-6 2.9 43 43 0 0 0 3.8 6.2 58.6 58.6 0 0 0 17.9-9C72.6 29.9 68.6 16.6 60.1 4.9ZM24 37.1c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.4 3.2 6.4 7.2-2.8 7.2-6.4 7.2Zm23.4 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.4 3.2 6.4 7.2-2.8 7.2-6.4 7.2Z');
    function drawFooter() {
      const qa = game.queueApples + game.queueGold + (airdrops[0] ? airdrops[0].left : 0), qb = game.queueBombs;
      if (qa > 0) pill(BX + 30, BY + BOARD + 44, 450, 76, '#ef3b36', `🍎 +${qa} ${T('incoming')}`, 34);
      if (qb > 0) pill(BX + BOARD - 480, BY + BOARD + 44, 450, 76, '#3b3946', `💣 +${qb} ${T('incoming')}`, 34);
      if (S.discord) {
        const label = S.discord.replace(/^https?:\/\//, ''), y = BY + BOARD + 150;
        ctx.font = `700 40px ${FONT}`; const w = ctx.measureText(label).width + 140;
        const x = W / 2 - w / 2;
        rrect(x, y, w, 84, 42); ctx.fillStyle = '#5865f2'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = '#1b0b33'; ctx.stroke();
        ctx.save(); ctx.translate(x + 30, y + 20); ctx.scale(0.62, 0.62); ctx.fillStyle = '#fff'; ctx.fill(DISCORD); ctx.restore();
        text(label, x + 90 + (w - 120) / 2, y + 44, 40, '#fff', { font: FONT, weight: 700, stroke: 0 });
      }
    }
    function drawLocked() {
      ctx.fillStyle = 'rgba(10,5,25,.82)'; ctx.fillRect(0, 0, W, H);
      text('🔒', W / 2, H / 2 - 120, 160, '#fff', { stroke: 0 });
      text('SNAKE TIK', W / 2, H / 2 + 40, 90, '#7be04a', { stroke: 18 });
      text(locked === true ? 'Inicia sesión en el programa' : locked, W / 2, H / 2 + 150, 40, '#fff', { font: FONT, weight: 700, stroke: 8 });
    }

    // ---------- eventos ----------
    function handleGameEvents(t) {
      for (const e of game.events) {
        if (e.type === 'apple') { if (!born.has(e.cell) && !e.drop) born.set(e.cell, { t }); if (e.drop) snd('drop', 30); }
        else if (e.type === 'bomb') { born.set(e.cell, { t }); snd('bomb', 90); }
        else if (e.type === 'eat') {
          const [x, y] = cellC(e.cell); burst(x, y, e.value > 1 ? '#ffd23f' : '#ff5a5a', 10, 7, 9);
          floatText(x, y - 20, `+${e.value}`, e.value > 1 ? '#ffe680' : '#ffffff'); snd(e.value > 1 ? 'gold' : 'eat', 40);
        } else if (e.type === 'turn') { game._turnT = t; SFX.key(DIR_NAMES[e.dir]); }
        else if (e.type === 'rescue') {
          const [x, y] = cellC(e.cell); born.set(e.cell, e.from >= 0 ? { t, fx: cellC(e.from)[0], fy: cellC(e.from)[1] } : { t });
          burst(x, y, '#c4b5fd', 16, 6, 8); snd('rescue', 300);
        } else if (e.type === 'absorb') { const [x, y] = cellC(e.cell); burst(x, y, '#e9d5ff', 8, 5, 7); snd('rescue', 300); }
        else if (e.type === 'blast') { const [x, y] = cellC(e.cell); burst(x, y, '#ffb020', 8, 9, 10); burst(x, y, '#555', 5, 6, 12); }
        else if (e.type === 'blasted') { shake = 26; snd('blast', 200); banner2(T('blasted'), '#ff8a8a', t); prevSnake = game.snake.slice(); fullT0 = 0; }
        else if (e.type === 'win') { banner = { text: T('win'), sub: T('winSub'), color: '#7be04a', t0: t }; endAt = t + 6000; pops.w = t; confetti(); SFX.play('win'); saveStats(); }
        else if (e.type === 'lose') {
          const [x, y] = cellC(e.cell); burst(x, y, '#ffb020', 40, 14, 16); burst(x, y, '#555', 30, 10, 18); shake = 28;
          banner = { text: T('lose'), sub: e.reason === 'bomb' ? T('loseBomb') : T('loseCrash'), color: '#ff5a5f', t0: t };
          endAt = t + 5000; pops.l = t; SFX.play('blast'); setTimeout(() => SFX.play('lose'), 350); saveStats();
        }
      }
      game.events.length = 0;
    }
    function saveStats() { if (opts.onStats) opts.onStats(game.wins, game.losses); else fetch('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wins: game.wins, losses: game.losses }) }).catch(() => {}); }

    function currentSpeed() { return S.speed * (S.speedup ? 1 + Math.min(1, game.progress()) * 0.8 : 1); }

    // ---------- bucle ----------
    function frame(t) {
      const dt = Math.min(100, t - last); last = t;
      if (!locked && !paused) {
        const tick = 1000 / currentSpeed();
        updatePlanes(t);
        if (game.state === 'play') {
          acc += dt;
          while (acc >= tick) {
            prevSnake = game.snake.slice();
            game.spawnTick(4); game.step(); acc -= tick;
            handleGameEvents(t);
            if (game.state !== 'play') { acc = 0; break; }
          }
          // 100 %: cuenta atrás; una bomba (o dejar de estar lleno) la reinicia
          if (game.state === 'play' && game.isFull() && game.queueBombs === 0) {
            if (!fullT0) { fullT0 = t; lastTickSec = -1; }
            const left = S.countdown - (t - fullT0) / 1000, sec = Math.ceil(left);
            if (sec !== lastTickSec && left > 0) { lastTickSec = sec; SFX.play('tick'); }
            if (left <= 0) { fullT0 = 0; game.win(); }
          } else fullT0 = 0;
        } else if (t > endAt) { game.reset(); game.stallSteps = 15 * S.speed; prevSnake = game.snake.slice(); born.clear(); banner = null; airdrops.length = 0; }
        handleGameEvents(t);
      }
      const alpha = game.state === 'play' ? Math.min(1, acc / (1000 / currentSpeed())) : 1;
      ctx.save();
      if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.9; if (shake < 0.5) shake = 0; }
      drawBackground(t); drawHeader(t); drawBoard(t, alpha); drawToasts(t); drawFooter(); drawBanner(t); drawParticles(false);
      ctx.restore();
      if (locked) drawLocked();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      applySettings,
      gift(what, amount, nick, source) {
        if (what === 'airdrop') startAirdrop(amount); else game.add(what, amount);
        if (what === 'bombs') fullT0 = 0;
        addToast(nick, what, amount, source);
      },
      fail() { game.scheduleFail(Math.round(5 * currentSpeed())); },
      reset() { game.reset(); game.stallSteps = 15 * S.speed; prevSnake = game.snake.slice(); born.clear(); banner = null; airdrops.length = 0; fullT0 = 0; },
      setLocked(v) { locked = v; },
      setPaused(v) { paused = !!v; last = performance.now(); },
      get game() { return game; },
      BOARDS, ANIMALS,
    };
  }

  root.SnakeRender = { create, BOARDS, ANIMALS, W, H };
})(this);
