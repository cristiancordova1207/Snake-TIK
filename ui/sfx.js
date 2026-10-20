// Snake Tik · sonidos. Efectos sintetizados (sin archivos, sin licencias) + teclas mecánicas (Mechvibes)
// + archivos propios que el usuario importe desde el panel.
(function (root) {
  'use strict';
  let ac = null, master = null;
  function ctx() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.8; master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function osc(type, f0, f1, dur, vol, delay = 0, out) {
    const c = ctx(), t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.005, vol, dur); o.connect(g).connect(out || master); o.start(t); o.stop(t + dur + 0.05);
  }
  let noiseBuf = null;
  function noise(dur, vol, freq, q = 1, delay = 0, type = 'lowpass', out) {
    const c = ctx(), t = c.currentTime + delay;
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    env(g, t, 0.004, vol, dur); s.connect(f).connect(g).connect(out || master); s.start(t); s.stop(t + dur + 0.05);
  }
  const notes = (arr, type, dur, vol, gap) => arr.forEach((f, i) => osc(type, f, 0, dur, vol, i * gap));

  // presets por evento: [id, nombre, función]
  const PRESETS = {
    eat: [['pop', 'Pop', (v) => { osc('sine', 500, 1300, 0.09, 0.5 * v); noise(0.03, 0.15 * v, 3000); }],
          ['crunch', 'Crunch', (v) => { noise(0.07, 0.5 * v, 1800, 2, 0, 'bandpass'); noise(0.05, 0.4 * v, 900, 2, 0.05, 'bandpass'); }],
          ['coin', 'Moneda', (v) => { osc('square', 988, 0, 0.06, 0.18 * v); osc('square', 1319, 0, 0.18, 0.18 * v, 0.06); }],
          ['bubble', 'Burbuja', (v) => osc('sine', 300, 900, 0.12, 0.45 * v)]],
    gold: [['chime', 'Campanita', (v) => notes([1047, 1319, 1568, 2093], 'triangle', 0.25, 0.25 * v, 0.06)],
           ['sparkle', 'Brillo', (v) => { for (let i = 0; i < 6; i++) osc('sine', 1500 + i * 300, 0, 0.12, 0.12 * v, i * 0.04); }]],
    bomb: [['thud', 'Golpe', (v) => { osc('sine', 160, 45, 0.25, 0.7 * v); noise(0.12, 0.3 * v, 500); }],
           ['clank', 'Metal', (v) => { osc('square', 220, 180, 0.15, 0.15 * v); noise(0.1, 0.25 * v, 2500, 3, 0, 'bandpass'); }],
           ['fuse', 'Mecha', (v) => noise(0.35, 0.25 * v, 4000, 1, 0, 'highpass')]],
    blast: [['boom', 'Explosión', (v) => { noise(0.9, 0.9 * v, 400); osc('sine', 90, 30, 0.6, 0.6 * v); }],
            ['crack', 'Estallido', (v) => { noise(0.4, 0.8 * v, 1500); noise(0.6, 0.5 * v, 300, 1, 0.05); }]],
    lose: [['wahwah', 'Wah wah', (v) => { osc('sawtooth', 392, 370, 0.35, 0.2 * v); osc('sawtooth', 370, 349, 0.35, 0.2 * v, 0.38); osc('sawtooth', 349, 233, 0.9, 0.2 * v, 0.76); }],
           ['buzzer', 'Buzzer', (v) => { osc('square', 130, 0, 0.7, 0.25 * v); osc('square', 136, 0, 0.7, 0.2 * v); }],
           ['fall', 'Caída', (v) => osc('triangle', 900, 120, 1.0, 0.35 * v)]],
    win: [['fanfare', 'Fanfarria', (v) => { notes([523, 659, 784], 'square', 0.14, 0.14 * v, 0.12); osc('square', 1047, 0, 0.6, 0.16 * v, 0.38); osc('triangle', 523, 0, 0.6, 0.2 * v, 0.38); }],
          ['arcade', 'Arcade', (v) => notes([523, 784, 1047, 784, 1047, 1319, 1568], 'square', 0.1, 0.13 * v, 0.08)],
          ['harp', 'Arpa', (v) => notes([523, 659, 784, 988, 1175, 1319, 1568, 1976], 'triangle', 0.4, 0.18 * v, 0.06)]],
    tick: [['wood', 'Madera', (v) => { osc('square', 1200, 0, 0.03, 0.18 * v); noise(0.02, 0.2 * v, 3000, 4, 0, 'bandpass'); }],
           ['beep', 'Pitido', (v) => osc('sine', 880, 0, 0.12, 0.3 * v)],
           ['clock', 'Reloj', (v) => noise(0.03, 0.35 * v, 5000, 6, 0, 'bandpass')]],
    airdrop: [['plane', 'Avión', (v) => { const c = ctx(); for (let i = 0; i < 6; i++) osc('sawtooth', 70 + (i % 2) * 3, 0, 0.5, 0.06 * v, i * 0.45); noise(3, 0.12 * v, 700); }],
              ['whoosh', 'Whoosh', (v) => noise(1.6, 0.4 * v, 1200, 0.7, 0, 'bandpass')]],
    drop: [['tick', 'Tic', (v) => osc('sine', 1400 + Math.random() * 600, 0, 0.04, 0.08 * v)],
           ['plop', 'Plop', (v) => osc('sine', 700, 300, 0.07, 0.15 * v)]],
    rescue: [['magic', 'Magia', (v) => { for (let i = 0; i < 8; i++) osc('sine', 800 + i * 180, 0, 0.15, 0.1 * v, i * 0.035); }],
             ['zap', 'Zap', (v) => osc('sawtooth', 1800, 200, 0.25, 0.15 * v)]],
  };
  const EVENTS = Object.keys(PRESETS);

  // ---- teclas mecánicas ----
  const keyBufs = {};
  async function loadKeys(pack) {
    if (!pack || keyBufs[pack]) return;
    keyBufs[pack] = {};
    const c = ctx();
    for (const k of ['up', 'down', 'left', 'right']) {
      try { const r = await fetch(`/ui/sfx/keys/${pack}/${k}.mp3`); keyBufs[pack][k] = await c.decodeAudioData(await r.arrayBuffer()); } catch {}
    }
  }
  function playBuf(buf, vol) {
    const c = ctx(), s = c.createBufferSource(), g = c.createGain();
    s.buffer = buf; s.playbackRate.value = 0.96 + Math.random() * 0.08; g.gain.value = vol;
    s.connect(g).connect(master); s.start();
  }

  // ---- archivos propios ----
  const custom = {};
  async function loadCustom(url) {
    if (custom[url]) return custom[url];
    try { const r = await fetch(url); custom[url] = await ctx().decodeAudioData(await r.arrayBuffer()); } catch { custom[url] = null; }
    return custom[url];
  }

  let cfg = { master: 0.8, keys: { pack: 'cherrymx-black-abs', vol: 0.8, on: true }, events: {} };
  const SFX = {
    PRESETS, EVENTS,
    configure(c) {
      cfg = Object.assign(cfg, c || {});
      ctx(); master.gain.value = cfg.master ?? 0.8;
      if (cfg.keys && cfg.keys.on) loadKeys(cfg.keys.pack);
      for (const e of EVENTS) { const s = cfg.events[e]; if (s && s.file) loadCustom(s.file); }
    },
    play(ev, opts = {}) {
      const s = cfg.events[ev] || {};
      if (s.off) return;
      const vol = (s.vol ?? 1) * (opts.vol ?? 1);
      if (s.file) { const b = custom[s.file]; if (b) playBuf(b, vol); return; }
      const list = PRESETS[ev]; if (!list) return;
      const p = list.find((x) => x[0] === s.preset) || list[0];
      try { p[2](vol); } catch {}
    },
    key(dir) {
      const k = cfg.keys; if (!k || !k.on) return;
      const b = keyBufs[k.pack] && keyBufs[k.pack][dir];
      if (b) playBuf(b, k.vol ?? 0.8); else loadKeys(k.pack);
    },
    preview(ev, preset, vol = 1) { const p = (PRESETS[ev] || []).find((x) => x[0] === preset); if (p) p[2](vol); },
    async previewFile(url, vol = 1) { const b = await loadCustom(url); if (b) playBuf(b, vol); },
    async previewKey(pack, vol = 0.8) { await loadKeys(pack); const b = keyBufs[pack] && keyBufs[pack].right; if (b) playBuf(b, vol); },
    unlock() { ctx(); },
  };
  root.SFX = SFX;
})(this);
