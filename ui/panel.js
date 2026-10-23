// Snake Tik · panel de control (no sale en el directo).
'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const t = (k, v) => I18N.t(k, v);
const api = (p, b) => fetch(p, b ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}).then((r) => r.json());
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let S = null, ACC = null, gifts = [], selectedTT = '';

const BOARDS = {
  grass: ['#86cf4f', '#7cc546', 'Pasto'], dirt: ['#b98656', '#ad7b4c', 'Tierra'], mines: ['#c6ccd5', '#9aa3b1', 'Buscaminas'],
  sand: ['#f3dca4', '#ecd194', 'Arena'], snow: ['#eef6ff', '#d6e4f7', 'Nieve'], night: ['#1f2547', '#323b70', 'Noche neón'], candy: ['#ffd3e8', '#ffb3d6', 'Caramelo'],
};
const ANIMALS = { snake: ['🐍', 'Serpiente'], croc: ['🐊', 'Cocodrilo'], dragon: ['🐉', 'Dragón'], neon: ['⚡', 'Neón'], worm: ['🪱', 'Gusano'], caterpillar: ['🐛', 'Oruga'] };
const COLORS = [null, '#8b5cf6', '#22c55e', '#3b82f6', '#ef4444', '#f97316', '#eab308', '#ec4899', '#14b8a6', '#64748b', '#111827'];

function toast(msg) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; document.body.append(d); setTimeout(() => d.remove(), 2600); }
// "jelly" de los botones (como la web de Fluxy)
document.addEventListener('click', (e) => {
  const b = e.target.closest('.btn'); if (!b) return;
  b.classList.remove('wobble'); void b.offsetWidth; b.classList.add('wobble');
  const r = b.getBoundingClientRect(), g = document.createElement('span');
  g.className = 'goo'; g.style.left = (e.clientX - r.left) + 'px'; g.style.top = (e.clientY - r.top) + 'px';
  b.append(g); setTimeout(() => g.remove(), 700);
});
const save = (o) => api('/api/config', o).then(() => Object.assign(S.cfg, o));

// ---------------- idioma ----------------
function setLang(l) { I18N.set(l); I18N.apply(); $('#langSel').value = l; renderAll(); }
function langScreen() {
  const det = I18N.detect();
  $('#langs').innerHTML = Object.entries(I18N.LANGS).map(([k, n]) => `<button class="btn ${k === det ? 'btn-primary' : 'btn-ghost'} jelly" data-l="${k}">${n}</button>`).join('');
  $('#sLang').hidden = false;
  $('#langs').onclick = (e) => { const b = e.target.closest('[data-l]'); if (!b) return; save({ lang: b.dataset.l }); $('#sLang').hidden = true; setLang(b.dataset.l); route(); };
}

// ---------------- cuenta ----------------
let mode = 'login';
$$('#sLogin .tabs2 button').forEach((b) => b.onclick = () => {
  mode = b.dataset.mode;
  $$('#sLogin .tabs2 button').forEach((x) => x.classList.toggle('on', x === b));
  $('#lConf').hidden = mode !== 'register';
  $('#lGo').textContent = t(mode === 'register' ? 'register' : 'login');
  $('#lErr').textContent = '';
});
async function doLogin() {
  const body = { username: $('#lUser').value.trim(), password: $('#lPass').value, confirm: $('#lConf').value };
  if (mode === 'register' && body.password !== body.confirm) { $('#lErr').textContent = t('err_password_mismatch'); return; }
  $('#lGo').disabled = true;
  const r = await api('/api/account/' + mode, body);
  $('#lGo').disabled = false;
  if (r.error) { $('#lErr').textContent = I18N.has('err_' + r.error) ? t('err_' + r.error) : r.error; return; }
  ACC = r; $('#lPass').value = $('#lConf').value = ''; route();
}
$('#lGo').onclick = doLogin;
$('#lPass').onkeydown = $('#lConf').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };

function plansScreen() {
  const p = ACC.prices;
  if (p) {
    $('#pMonthly').innerHTML = `$${p.monthly.amount}<small>${t('perMonth')}</small>` + (p.monthly.launch ? `<span class="strike">$${p.monthly.regular}</span>` : '');
    $('#pLaunch').textContent = p.monthly.launch ? t('launchLeft', { n: p.monthly.launchLeft }) : t('monthly');
    $('#pLife').innerHTML = `$${p.lifetime.amount}`;
  }
  const pr = ACC.profile || {};
  $('#pEnded').hidden = !pr.trialEnded;
  $('#pErr').textContent = pr.banned ? t('err_banned') : (pr.onTrial ? t('trialLeft', { m: Math.floor((pr.trialSeconds || 0) / 60) }) : '');
  $('#sPlans').hidden = false;
}
$$('[data-buy]').forEach((b) => b.onclick = async () => {
  const r = await api('/api/account/checkout', { plan: b.dataset.buy });
  if (r.error) $('#pErr').textContent = r.error; else toast('Stripe ✓');
});
// prueba de acceso: abre el canal de tickets del Discord de Wylo en el navegador normal
$('#pTrial').onclick = () => { api('/api/open-trial', {}); toast('🎁 Discord'); };
$('#pCheck').onclick = async () => { ACC = await api('/api/account?refresh=1'); route(); if (!ACC.allowed) toast('⏳'); };
$('#pLogout').onclick = async () => { ACC = await api('/api/account/logout', {}); route(); };

function route() {
  if (!S.cfg.lang) return langScreen();
  $('#sLang').hidden = true;
  const logged = ACC && ACC.logged;
  $('#sLogin').hidden = !!logged;
  $('#sPlans').hidden = true;
  $('#app').hidden = !logged;
  if (logged && !ACC.allowed) plansScreen();
  if (logged) renderAll();
}

// ---------------- jugar ----------------
function renderTT() {
  const list = (ACC.profile && ACC.profile.tiktoks) || [];
  if (!selectedTT || !list.includes(selectedTT)) selectedTT = list.includes(S.cfg.tiktok_user) ? S.cfg.tiktok_user : list[0] || '';
  $('#ttList').innerHTML = list.map((u) => `<button class="${u === selectedTT ? 'on' : ''}" data-u="${esc(u)}">@${esc(u)}</button>`).join('') || `<span class="hint">—</span>`;
  $('#slots').textContent = `${list.length}/${ACC.profile ? ACC.profile.maxTiktok : 3}`;
  const full = list.length >= (ACC.profile ? ACC.profile.maxTiktok : 3);
  $('#ttNew').hidden = $('#ttAdd').hidden = full;
  $('#ttErr').textContent = full ? t('tiktokLimit') : '';
}
$('#ttList').onclick = (e) => { const b = e.target.closest('[data-u]'); if (b) { selectedTT = b.dataset.u; renderTT(); } };
$('#ttAdd').onclick = async () => {
  const u = $('#ttNew').value.trim(); if (!u) return;
  const r = await api('/api/account/tiktok_add', { username: u });
  if (r.error) { $('#ttErr').textContent = r.error === 'tiktok_limit' ? t('tiktokLimit') : r.error; return; }
  ACC = r; selectedTT = u.replace(/^@/, '').toLowerCase(); $('#ttNew').value = ''; renderTT();
};
$('#connect').onclick = async () => {
  if (!selectedTT) { $('#ttErr').textContent = t('tiktokUser'); return; }
  const r = await api('/api/connect', { user: selectedTT });
  if (r.error) $('#ttErr').textContent = r.error === 'tiktok_limit' ? t('tiktokLimit') : (I18N.has('err_' + r.error) ? t('err_' + r.error) : r.error);
};
$('#disconnect').onclick = () => api('/api/disconnect', {});
$('#openGame').onclick = () => api('/api/open-game', {});
$('#lose').onclick = () => { api('/api/command', { cmd: 'lose' }); toast('💀 ' + t('loseBtn') + '…'); };
$('#reset').onclick = () => api('/api/command', { cmd: 'reset' });
$('#start').onclick = () => { api('/api/command', { cmd: 'start' }); $('#start').hidden = true; $('#playCtl').hidden = false; };
$('#pause').onclick = () => api('/api/command', { cmd: 'pause' });
$('#stop').onclick = () => { if (!confirm(t('stopQ'))) return; api('/api/command', { cmd: 'stop' }); $('#start').hidden = false; $('#playCtl').hidden = true; };
$('#resetStats').onclick = () => { save({ stats: { wins: 0, losses: 0 } }); toast('🏆 0 · 💀 0'); };
$('#nolose').onclick = () => save({ nolose: !S.cfg.nolose }).then(() => $('#nolose').classList.toggle('on', !!S.cfg.nolose));
$('#fillholes').onclick = () => save({ fillholes: !S.cfg.fillholes }).then(() => $('#fillholes').classList.toggle('on', !!S.cfg.fillholes));
$$('[data-add]').forEach((b) => b.onclick = () => { const [what, amount] = b.dataset.add.split(','); api('/api/command', { cmd: 'add', what, amount: +amount }); });

// ---------------- regalos ----------------
const giftOf = (r) => gifts.find((g) => g.id === r.gift_id) || gifts.find((g) => g.name.toLowerCase() === (r.gift_name || '').toLowerCase());
function renderRules() {
  const acts = ['apples', 'gold', 'bombs', 'airdrop'], names = { apples: '🍎 ' + t('apples'), gold: '🍏 ' + t('gold'), bombs: '💣 ' + t('bombs'), airdrop: '✈️ ' + t('airdropAct') };
  $('#rules').innerHTML = S.cfg.rules.map((r, i) => {
    const g = r.kind === 'gift' ? giftOf(r) : null;
    const icon = r.kind === 'likes' ? '<span style="font-size:26px">❤️</span>' : r.kind === 'follow' ? '<span style="font-size:26px">➕</span>' : (g && g.img ? `<img src="${esc(g.img)}">` : '<span style="font-size:26px">🎁</span>');
    const label = r.kind === 'likes' ? `${t('every')} <input type="number" data-likes="${i}" value="${r.likes}" min="1" style="width:90px"> ${t('likes')}`
      : r.kind === 'follow' ? `<b>${t('newFollower')}</b>` : `<b>${esc(r.gift_name)}</b>${g ? ` <span class="hint">${g.coins} 🪙</span>` : ''}`;
    return `<div class="rule">${icon}<span>${label}</span><input type="number" min="1" data-amount="${i}" value="${r.amount}"><select data-action="${i}">${acts.map((a) => `<option value="${a}" ${a === r.action ? 'selected' : ''}>${names[a]}</option>`).join('')}</select><button class="x" data-del="${i}">✕</button></div>`;
  }).join('');
}
$('#rules').addEventListener('change', (e) => {
  const x = e.target, r = S.cfg.rules;
  if (x.dataset.amount) r[+x.dataset.amount].amount = Math.max(1, +x.value);
  if (x.dataset.likes) r[+x.dataset.likes].likes = Math.max(1, +x.value);
  if (x.dataset.action) r[+x.dataset.action].action = x.value;
  save({ rules: r });
});
$('#rules').addEventListener('click', (e) => { const d = e.target.dataset.del; if (d !== undefined) { S.cfg.rules.splice(+d, 1); save({ rules: S.cfg.rules }); renderRules(); } });
$('#addLikes').onclick = () => { S.cfg.rules.push({ kind: 'likes', likes: 100, action: 'apples', amount: 1 }); save({ rules: S.cfg.rules }); renderRules(); };
$('#addFollow').onclick = () => { S.cfg.rules.push({ kind: 'follow', action: 'bombs', amount: 10 }); save({ rules: S.cfg.rules }); renderRules(); };
$('#testFollow').onclick = () => api('/api/command', { cmd: 'follow', nick: 'Prueba' });

// overlays para TikTok LIVE Studio: lo que da cada regalo (con vista previa)
const OVS = [['gifts', '🎁', 'ovGifts'], ['social', '❤️', 'ovSocial'], ['all', '✨', 'ovAll']];
function ovUrl(show) { const sc = +$('#ovScale').value; return `${location.origin}/overlay?show=${show}${sc !== 1 ? '&scale=' + sc : ''}`; }
function renderOverlays() {
  $('#ovScaleV').textContent = $('#ovScale').value;
  $('#ovs').innerHTML = OVS.map(([k, e, label]) => `<div class="ov">
    <div class="row"><b>${e} ${t(label)}</b></div>
    <div class="row"><input readonly value="${ovUrl(k)}" style="flex:1;font-size:12px"><button class="btn btn-primary btn-sm jelly" data-copy="${k}">📋 ${t('copyLink')}</button></div>
    <div class="ovprev"><iframe src="${ovUrl(k)}" loading="lazy"></iframe></div></div>`).join('');
}
$('#ovScale').onchange = renderOverlays;
$('#ovScale').oninput = () => ($('#ovScaleV').textContent = $('#ovScale').value);
$('#ovs').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  try { await navigator.clipboard.writeText(ovUrl(b.dataset.copy)); } catch { b.previousElementSibling.select(); document.execCommand('copy'); }
  toast('📋 ' + t('copied'));
});
async function loadGifts(refresh) { const r = await api('/api/gifts' + (refresh ? '?refresh=1' : '')); gifts = r.gifts || []; }
function renderGifts() { const q = $('#gq').value.toLowerCase(); $('#gifts').innerHTML = gifts.filter((g) => g.name.toLowerCase().includes(q)).map((g) => `<button class="gift" data-id="${g.id}"><img loading="lazy" src="${esc(g.img)}">${esc(g.name)}<br><span class="hint">${g.coins} 🪙</span></button>`).join(''); }
function assign(id, name) {
  S.cfg.rules = S.cfg.rules.filter((r) => !(r.kind === 'gift' && ((id && r.gift_id === id) || r.gift_name.toLowerCase() === name.toLowerCase())));
  S.cfg.rules.push({ kind: 'gift', gift_id: id, gift_name: name, action: 'apples', amount: 5 });
  save({ rules: S.cfg.rules }); renderRules(); $('#modal').classList.remove('open');
}
$('#addGift').onclick = async () => { $('#modal').classList.add('open'); if (!gifts.length) await loadGifts(); renderGifts(); $('#gq').focus(); };
$('#gq').oninput = renderGifts;
$('#gref').onclick = async () => { await loadGifts(true); renderGifts(); };
$('#gclose').onclick = () => $('#modal').classList.remove('open');
$('#modal').onclick = (e) => { if (e.target.id === 'modal') $('#modal').classList.remove('open'); };
$('#gifts').onclick = (e) => { const b = e.target.closest('.gift'); if (b) { const g = gifts.find((x) => x.id === +b.dataset.id); assign(g.id, g.name); } };
$('#gadd').onclick = () => { const n = $('#gmanual').value.trim(); if (n) assign(0, n); };

// ---------------- apariencia ----------------
function renderLook() {
  const c = S.cfg;
  $('#boards').innerHTML = Object.entries(BOARDS).map(([k, [a, b, n]]) =>
    `<button class="choice ${c.board === k ? 'on' : ''}" data-board="${k}"><span class="sw">${Array.from({ length: 16 }, (_, i) => `<i style="background:${((i >> 2) + i) % 2 ? b : a}"></i>`).join('')}</span>${n}</button>`).join('');
  $('#animals').innerHTML = Object.entries(ANIMALS).map(([k, [e, n]]) => `<button class="choice ${c.animal === k ? 'on' : ''}" data-animal="${k}"><span class="emo">${e}</span>${n}</button>`).join('');
  $('#colors').innerHTML = COLORS.map((col) => `<button class="swatch ${c.color === col ? 'on' : ''}" data-color="${col || ''}" style="background:${col || 'conic-gradient(#8b5cf6,#22c55e,#ef4444,#eab308,#8b5cf6)'}" title="${col || 'auto'}"></button>`).join('') +
    `<input type="color" id="colorPick" value="${c.color || '#8b5cf6'}">`;
  $('#grids').innerHTML = [10, 12, 14, 16, 18, 20, 22, 24, 26].map((n) => `<button class="${c.grid === n ? 'on' : ''}" data-grid="${n}">${n}×${n}</button>`).join('');
  $('#speed').value = c.speed; $('#speedV').textContent = c.speed;
  $('#speedup').classList.toggle('on', !!c.speedup); $('#toasts').classList.toggle('on', !!c.toasts);
  $('#showTitle').classList.toggle('on', !c.notitle);
  $('#toastScale').value = c.toastScale ?? 0.8; $('#toastScaleV').textContent = Math.round((c.toastScale ?? 0.8) * 100) + '%';
  $('#countdown').value = c.countdown; $('#wins').value = c.stats.wins; $('#losses').value = c.stats.losses;
}
$('#v-look').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.board) save({ board: b.dataset.board }).then(renderLook);
  if (b.dataset.animal) save({ animal: b.dataset.animal }).then(renderLook);
  if (b.dataset.color !== undefined) save({ color: b.dataset.color || null }).then(renderLook);
  if (b.dataset.grid) save({ grid: +b.dataset.grid }).then(renderLook);
  if (b.id === 'speedup') save({ speedup: !S.cfg.speedup }).then(renderLook);
  if (b.id === 'toasts') save({ toasts: !S.cfg.toasts }).then(renderLook);
  if (b.id === 'showTitle') save({ notitle: !S.cfg.notitle }).then(renderLook);
  if (b.id === 'resetLayout') save({ layout: {} }).then(() => toast('↺ ' + t('resetLayout')));
});
$('#v-look').addEventListener('change', (e) => {
  const x = e.target;
  if (x.id === 'colorPick') save({ color: x.value }).then(renderLook);
  if (x.id === 'speed') save({ speed: +x.value });
  if (x.id === 'toastScale') save({ toastScale: +x.value }).then(renderLook);
  if (x.id === 'countdown') save({ countdown: Math.max(3, +x.value || 10) });
  if (x.id === 'wins' || x.id === 'losses') save({ stats: { wins: +$('#wins').value, losses: +$('#losses').value } });
});
$('#speed').oninput = (e) => { $('#speedV').textContent = e.target.value; };

// ---------------- sonidos ----------------
let packs = [], pickFor = null;
function keycap(color) {
  return `<svg viewBox="0 0 64 64"><rect x="4" y="10" width="56" height="50" rx="12" fill="#0f0c16"/><rect x="4" y="6" width="56" height="48" rx="12" fill="#2a2338"/>
  <rect x="11" y="10" width="42" height="36" rx="9" fill="#3a3150"/><path d="M28 18h8v8h8v8h-8v8h-8v-8h-8v-8h8z" fill="${color}" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/></svg>`;
}
function renderSounds() {
  const snd = S.cfg.sound;
  $('#master').value = snd.master ?? 0.8;
  $('#keysOn').classList.toggle('on', snd.keys.on !== false);
  $('#keyVol').value = snd.keys.vol ?? 0.8;
  $('#keys').innerHTML = packs.map((p) => `<button class="key ${snd.keys.pack === p.id ? 'on' : ''}" data-pack="${p.id}">${keycap(p.color)}<span>${esc(p.name)}</span></button>`).join('');
  $('#sfxList').innerHTML = SFX.EVENTS.map((ev) => {
    const cur = snd.events[ev] || {};
    const val = cur.off ? 'off' : cur.file ? 'file' : (cur.preset || SFX.PRESETS[ev][0][0]);
    const opts = SFX.PRESETS[ev].map(([id, name]) => `<option value="${id}" ${val === id ? 'selected' : ''}>${name}</option>`).join('') +
      (cur.file ? `<option value="file" selected>📁 ${esc(cur.fileName || 'archivo')}</option>` : '') +
      `<option value="import">📁 ${t('importFile')}</option><option value="off" ${val === 'off' ? 'selected' : ''}>🔇 ${t('none')}</option>`;
    return `<div class="sfx"><b>${t('ev_' + ev)}</b><select data-ev="${ev}">${opts}</select><input type="range" min="0" max="1.5" step="0.05" value="${cur.vol ?? 1}" data-vol="${ev}"><button class="icon-btn" data-play="${ev}">▶</button><span></span></div>`;
  }).join('');
}
function saveSound() { save({ sound: S.cfg.sound }); SFX.configure(S.cfg.sound); }
$('#master').onchange = (e) => { S.cfg.sound.master = +e.target.value; saveSound(); };
$('#keyVol').onchange = (e) => { S.cfg.sound.keys.vol = +e.target.value; saveSound(); };
$('#keysOn').onclick = () => { S.cfg.sound.keys.on = !(S.cfg.sound.keys.on !== false); saveSound(); renderSounds(); };
$('#keys').onclick = (e) => {
  const b = e.target.closest('[data-pack]'); if (!b) return;
  S.cfg.sound.keys.pack = b.dataset.pack; saveSound(); renderSounds();
  SFX.previewKey(b.dataset.pack, S.cfg.sound.keys.vol ?? 0.8);
};
$('#sfxList').addEventListener('change', (e) => {
  const x = e.target, ev = x.dataset.ev || x.dataset.vol, evs = S.cfg.sound.events;
  evs[ev] = evs[ev] || {};
  if (x.dataset.vol) { evs[ev].vol = +x.value; return saveSound(); }
  if (x.value === 'import') { pickFor = ev; $('#sfxFile').click(); renderSounds(); return; }
  if (x.value === 'off') evs[ev] = { off: true, vol: evs[ev].vol };
  else if (x.value !== 'file') evs[ev] = { preset: x.value, vol: evs[ev].vol };
  saveSound(); SFX.play(ev);
});
$('#sfxList').addEventListener('click', (e) => { const b = e.target.closest('[data-play]'); if (b) SFX.play(b.dataset.play); });
$('#sfxFile').onchange = async () => {
  const f = $('#sfxFile').files[0]; if (!f || !pickFor) return;
  const fd = new FormData(); fd.append('file', f);
  const r = await fetch('/api/sound-upload', { method: 'POST', body: fd }).then((x) => x.json());
  if (!r.ok) { toast(r.error || 'Error'); return; }
  S.cfg.sound.events[pickFor] = { file: r.url, fileName: r.name, vol: (S.cfg.sound.events[pickFor] || {}).vol };
  saveSound(); renderSounds(); SFX.previewFile(r.url); $('#sfxFile').value = '';
};

// ---------------- cuenta / admin ----------------
function renderAccount() {
  const p = ACC.profile || {};
  $('#uName').textContent = p.username || ''; $('#uAv').textContent = (p.username || '?')[0].toUpperCase();
  const planTxt = p.role === 'admin' ? 'ADMIN' : p.plan === 'lifetime' ? t('lifetime') : p.plan === 'monthly' ? t('monthly') : p.role === 'trial' ? t('trialLeft', { m: Math.floor((p.trialSeconds || 0) / 60) }) : '—';
  $('#uPlan').textContent = planTxt; $('#uPlan').className = 'badge ' + (p.role === 'trial' ? 'amber' : ACC.allowed ? 'green' : 'red');
  $('#navAdmin').hidden = !ACC.admin;
  $('#accSub').textContent = '@' + (p.username || '');
  $('#accCard').innerHTML = `<h3><span class="ic">💳</span>${planTxt}</h3>` +
    (p.plan === 'monthly' && p.planUntil ? `<p class="hint">${t('renews')} ${new Date(p.planUntil).toLocaleDateString()}</p>` : '') +
    `<div class="row">${p.plan === 'monthly' ? `<button class="btn btn-ghost btn-sm jelly" id="accPortal">${t('manageSub')}</button>` : ''}<button class="btn btn-ghost btn-sm jelly" id="accOut">${t('logout')}</button></div>`;
  $('#accDiscord').textContent = p.discord || '';
  const portal = $('#accPortal'); if (portal) portal.onclick = () => api('/api/account/portal', {});
  $('#accOut').onclick = async () => { ACC = await api('/api/account/logout', {}); route(); };
  if (ACC.admin) $('#adDiscord').value = p.discord || '';
  $('#ver').textContent = 'v' + ACC.version;
}
$('#adDiscordSave').onclick = async () => { const r = await api('/api/admin', { action: 'set_discord', discord: $('#adDiscord').value }); toast(r.ok ? '✓ ' + r.discord : r.error); ACC = await api('/api/account?refresh=1'); renderAccount(); };
$('#adTrial').onclick = async () => {
  const r = await api('/api/admin', { action: 'trial_create', username: $('#adTU').value.trim(), password: $('#adTP').value, minutes: +$('#adTM').value || 30 });
  $('#adTrialMsg').textContent = r.user ? `✓ ${r.user.username} · ${Math.round(r.user.trial_seconds / 60)} min · ${new Date(r.user.expires_at).toLocaleString()}` : (r.error || 'Error');
};
// prueba gratuita a una cuenta existente (o cambiar sus minutos; 0 = quitarla)
$('#adGrant').onclick = async () => {
  const r = await api('/api/admin', { action: 'trial_set', username: $('#adGU').value.trim(), minutes: Math.max(0, +$('#adGM').value || 0) });
  $('#adGrantMsg').textContent = r.user ? `✓ ${r.user.username} · ${Math.round(r.user.trial_seconds / 60)} min` : (r.error === 'user_not_found' ? '✕ Ese usuario no existe' : (r.error || 'Error'));
};

// ---------------- navegación / estado ----------------
$('#nav').onclick = (e) => {
  const b = e.target.closest('button[data-v]'); if (!b) return;
  $$('#nav button').forEach((x) => x.classList.toggle('on', x === b));
  $$('main .view').forEach((v) => v.hidden = v.id !== 'v-' + b.dataset.v);
};
$('#langSel').innerHTML = Object.entries(I18N.LANGS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
$('#langSel').onchange = (e) => { save({ lang: e.target.value }); setLang(e.target.value); };

function renderAll() {
  if (!ACC || !ACC.logged) return;
  $('#nolose').classList.toggle('on', !!S.cfg.nolose);
  $('#fillholes').classList.toggle('on', !!S.cfg.fillholes);
  renderTT(); renderRules(); renderOverlays(); renderLook(); renderSounds(); renderAccount();
}
async function poll() {
  try {
    const s = await api('/api/state');
    const st = s.status;
    $('#dTT').className = 'dot ' + (st === 'live' ? 'on' : st === 'connecting' ? 'wait' : '');
    $('#sTT').textContent = st === 'live' ? t('live') : st === 'connecting' ? t('connecting') : t('offline');
    $('#dG').className = 'dot ' + (s.game ? 'on' : ''); $('#sG').textContent = s.game ? t('gameOpen') : t('gameClosed');
    $('#start').hidden = !!s.started;
    $('#playCtl').hidden = !s.started;
    $('#pause').textContent = s.paused ? '▶ ' + t('resumeBtn') : '⏸ ' + t('pauseBtn');
    if (document.activeElement !== $('#wins') && document.activeElement !== $('#losses')) { $('#wins').value = s.cfg.stats.wins; $('#losses').value = s.cfg.stats.losses; }
    if (s.error) $('#ttErr').textContent = s.error.includes('no está en directo') ? t('err_offlineLive') : s.error;
    $('#log').innerHTML = s.log.map((l) => `<div><time>${new Date(l.t * 1000).toLocaleTimeString()}</time>${esc(l.text)}</div>`).join('') || '<div class="hint">—</div>';
    $('#playSub').textContent = ACC && ACC.profile && ACC.profile.role === 'trial' ? t('trialLeft', { m: Math.floor((ACC.profile.trialSeconds || 0) / 60) }) : '';
  } catch {}
}
async function pollAccount() { // cada 30 s: plan, minutos de prueba, Discord
  if (!ACC || !ACC.logged) return;
  const a = await api('/api/account?refresh=1').catch(() => null);
  if (!a) return;
  const was = ACC.allowed; ACC = a;
  if (was !== a.allowed || !a.logged) route(); else renderAccount();
}
async function checkUpdate() {
  const u = await api('/api/update').catch(() => null);
  if (!u || !u.available) return;
  $('#upVer').textContent = `v${u.current} → v${u.latest}`;
  $('#upNotes').textContent = u.notes || '';
  $('#sUpdate').hidden = false;
  $('#upLater').onclick = () => { $('#sUpdate').hidden = true; };
  $('#upGo').onclick = async () => { $('#upGo').disabled = true; $('#upMsg').textContent = '⏬ …'; const r = await api('/api/update', { go: true }); $('#upMsg').textContent = r.error || '✓'; };
}

(async () => {
  S = await api('/api/state');
  ACC = await api('/api/account');
  packs = await fetch('/ui/sfx/keys/packs.json').then((r) => r.json()).catch(() => []);
  I18N.set(S.cfg.lang || I18N.detect()); I18N.apply();
  SFX.configure(S.cfg.sound);
  route();
  loadGifts().then(() => ACC && ACC.logged && renderRules());
  poll(); setInterval(poll, 1000);
  setInterval(pollAccount, 30000);
  setTimeout(checkUpdate, 2500);
})();
