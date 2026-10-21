// Snake Tik · API (Supabase Edge Function, --no-verify-jwt: usa sus propias sesiones).
// POST { action, token?, ...datos }  ->  JSON
// Secrets: STRIPE_SECRET_KEY (compartido con FLUX), SNAKE_ASSET_KEY. SUPABASE_URL y SERVICE_ROLE_KEY vienen de serie.
const env = Deno.env.toObject();
const DB = `${env.SUPABASE_URL}/rest/v1`;
const SR = env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = 'https://snaketik.pages.dev';
const TRIAL_SECONDS = 30 * 60;
const MAX_TIKTOK = 3;
const MAX_ACCOUNTS_PER_DEVICE = 2; // por PC (hwid) y por IP
// Discord (bot de tickets): servidor y canales de Wylo. El token del bot vive solo en el secreto DISCORD_BOT_TOKEN.
const GUILD = '1506294281801957406';
const TICKET_CHANNEL = '1506987667408031845';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

class ApiError extends Error { constructor(public code: string, public status = 400) { super(code); } }

async function db(method: string, path: string, body?: unknown, prefer = 'return=representation') {
  const r = await fetch(`${DB}/${path}`, {
    method,
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new ApiError('db_error:' + txt.slice(0, 200), 500);
  return txt ? JSON.parse(txt) : null;
}
const rpc = (fn: string, args: unknown) => db('POST', `rpc/${fn}`, args);

async function stripe(method: string, path: string, params: Record<string, string> = {}) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : new URLSearchParams(params).toString(),
  });
  const d = await r.json();
  if (!r.ok) throw new ApiError('stripe:' + (d.error?.message || r.status), 502);
  return d;
}

async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, '0')).join('');

async function setting(key: string) {
  const r = await db('GET', `snake_settings?key=eq.${key}&select=value`);
  return r[0]?.value;
}

// ---------- precios ----------
async function prices() {
  const d = await stripe('GET', 'prices?active=true&limit=10&lookup_keys[]=snaketik_monthly_launch&lookup_keys[]=snaketik_monthly&lookup_keys[]=snaketik_lifetime');
  const by: Record<string, any> = {};
  for (const p of d.data) by[p.lookup_key] = p;
  const slots = Number(await setting('launch_slots') ?? 10);
  const buyers = (await db('GET', 'snake_payments?select=user_id')).map((x: any) => x.user_id);
  const left = Math.max(0, slots - new Set(buyers).size);
  const monthly = left > 0 ? by.snaketik_monthly_launch : by.snaketik_monthly;
  return {
    monthly: { id: monthly?.id, amount: (monthly?.unit_amount ?? 0) / 100, launch: left > 0, launchLeft: left, regular: (by.snaketik_monthly?.unit_amount ?? 0) / 100 },
    lifetime: { id: by.snaketik_lifetime?.id, amount: (by.snaketik_lifetime?.unit_amount ?? 0) / 100 },
  };
}

// ---------- sesión / perfil ----------
async function cleanup() { // las cuentas de prueba duran 1 día
  await db('DELETE', `snake_users?role=eq.trial&expires_at=lt.${new Date().toISOString()}`, undefined, 'return=minimal');
}

function paid(u: any) {
  if (u.role === 'admin' || u.plan === 'lifetime') return true;
  return u.plan === 'monthly' && !!u.plan_until && new Date(u.plan_until) > new Date();
}
// prueba activa: cuentas de prueba (caducan al día) o prueba regalada a una cuenta normal (no caduca, solo gasta minutos)
function onTrial(u: any) {
  if (paid(u) || !(u.trial_seconds > 0)) return false;
  return u.role !== 'trial' || (!!u.expires_at && new Date(u.expires_at) > new Date());
}
function allowed(u: any) {
  if (u.banned) return false;
  return paid(u) || onTrial(u);
}

async function userFromToken(token?: string) {
  if (!token) throw new ApiError('no_session', 401);
  const h = await sha256(token);
  const s = await db('GET', `snake_sessions?token_hash=eq.${h}&select=user_id`);
  if (!s[0]) throw new ApiError('no_session', 401);
  const u = (await db('GET', `snake_users?id=eq.${s[0].user_id}&select=*`))[0];
  if (!u) throw new ApiError('no_session', 401);
  return u;
}

async function profile(u: any) {
  const tiktoks = (await db('GET', `snake_tiktok?user_id=eq.${u.id}&select=username&order=created_at`)).map((x: any) => x.username);
  const ok = allowed(u);
  return {
    username: u.username, role: u.role, plan: u.plan, planUntil: u.plan_until, trialSeconds: u.trial_seconds,
    onTrial: onTrial(u), trialEnded: !ok && !paid(u) && u.trial_seconds === 0 && (u.role === 'trial' || u.plan === 'trial'),
    expiresAt: u.expires_at, banned: u.banned, allowed: ok, tiktoks, maxTiktok: MAX_TIKTOK,
    discord: await setting('discord'), assetKey: ok ? env.SNAKE_ASSET_KEY : null,
  };
}

async function newSession(userId: string) {
  const token = randomToken();
  await db('POST', 'snake_sessions', { token_hash: await sha256(token), user_id: userId }, 'return=minimal');
  return token;
}

// aviso en Discord cuando alguien empieza un directo con Snake Tik (el webhook vive solo en el servidor)
async function announceLive(tiktok: string) {
  if (!env.DISCORD_WEBHOOK || !/^[\w.]{2,24}$/.test(tiktok)) return;
  try {
    await fetch(env.DISCORD_WEBHOOK, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Lives', allowed_mentions: { parse: ['everyone'] },
        content: `@everyone
🔴 **The user ${tiktok} is currently live!**
🔗 https://www.tiktok.com/@${tiktok}` }),
    });
  } catch (_) { /* el aviso no debe romper el pulso */ }
}

const USER_RE = /^[A-Za-z0-9_.]{3,20}$/;

// ---------- acciones ----------
const actions: Record<string, (b: any, req: Request) => Promise<unknown>> = {
  async register(b, req) {
    const username = String(b.username || '').trim(), password = String(b.password || '');
    if (!USER_RE.test(username)) throw new ApiError('bad_username');
    if (password.length < 6) throw new ApiError('short_password');
    if (password !== b.confirm) throw new ApiError('password_mismatch');
    const exists = await db('GET', `snake_users?username_lc=eq.${encodeURIComponent(username.toLowerCase())}&select=id`);
    if (exists[0]) throw new ApiError('username_taken');
    // máximo 2 cuentas por PC (huella del equipo) y por IP
    const hwid = /^[0-9a-f]{64}$/.test(String(b.hwid || '')) ? String(b.hwid) : null;
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
    const or = [hwid && `hwid.eq.${hwid}`, ip && `signup_ip.eq.${encodeURIComponent(ip)}`].filter(Boolean).join(',');
    if (or) {
      const same = await db('GET', `snake_users?select=id&or=(${or})`);
      if (same.length >= MAX_ACCOUNTS_PER_DEVICE) throw new ApiError('too_many_accounts', 403);
    }
    const hash = await rpc('snake_hash', { p: password });
    const u = (await db('POST', 'snake_users', { username, pass_hash: hash, app_version: b.version || null, hwid, signup_ip: ip }))[0];
    return { token: await newSession(u.id), profile: await profile(u) };
  },
  async login(b) {
    const id = await rpc('snake_check', { u: String(b.username || ''), p: String(b.password || '') });
    if (!id) throw new ApiError('bad_login', 401);
    const u = (await db('GET', `snake_users?id=eq.${id}&select=*`))[0];
    if (u.banned) throw new ApiError('banned', 403);
    return { token: await newSession(u.id), profile: await profile(u) };
  },
  async logout(b) {
    await db('DELETE', `snake_sessions?token_hash=eq.${await sha256(b.token || '')}`, undefined, 'return=minimal');
    return { ok: true };
  },
  async me(b) { return { profile: await profile(await userFromToken(b.token)), prices: await prices() }; },

  // pulso cada ~60 s: mantiene la licencia viva y gasta los minutos de prueba SOLO mientras hay directo
  async beat(b) {
    let u = await userFromToken(b.token);
    const now = new Date();
    const patch: Record<string, unknown> = { last_seen: now.toISOString(), app_version: b.version || u.app_version };
    if (b.live && b.tiktok) {
      const open = (await db('GET', `snake_lives?user_id=eq.${u.id}&last_beat=gt.${new Date(now.getTime() - 3 * 60e3).toISOString()}&order=last_beat.desc&limit=1`))[0];
      const elapsed = open ? Math.min(90, Math.max(0, (now.getTime() - new Date(open.last_beat).getTime()) / 1000)) : 0;
      if (open) await db('PATCH', `snake_lives?id=eq.${open.id}`, { last_beat: now.toISOString(), seconds: open.seconds + Math.round(elapsed) }, 'return=minimal');
      else {
        await db('POST', 'snake_lives', { user_id: u.id, tiktok: b.tiktok }, 'return=minimal');
        await announceLive(String(b.tiktok));
      }
      if (onTrial(u)) patch.trial_seconds = Math.max(0, u.trial_seconds - Math.round(elapsed)); // nunca a quien ya paga
    }
    u = (await db('PATCH', `snake_users?id=eq.${u.id}`, patch))[0];
    return { profile: await profile(u) };
  },

  async tiktok_add(b) {
    const u = await userFromToken(b.token);
    const name = String(b.username || '').trim().replace(/^@/, '').toLowerCase();
    if (!/^[\w.]{2,24}$/.test(name)) throw new ApiError('bad_tiktok');
    const list = (await db('GET', `snake_tiktok?user_id=eq.${u.id}&select=username`)).map((x: any) => x.username);
    if (!list.includes(name)) {
      if (list.length >= MAX_TIKTOK) throw new ApiError('tiktok_limit', 403);
      await db('POST', 'snake_tiktok', { user_id: u.id, username: name }, 'return=minimal');
    }
    return { profile: await profile(u) };
  },

  async checkout(b) {
    const u = await userFromToken(b.token);
    const p = await prices();
    const plan = b.plan === 'lifetime' ? 'lifetime' : 'monthly';
    let customer = u.stripe_customer;
    if (!customer) {
      // cliente propio de Snake Tik (sin supabase_user_id para que el webhook de FLUX no lo toque)
      customer = (await stripe('POST', 'customers', { name: u.username, 'metadata[snaketik_user]': u.id, 'metadata[app]': 'snaketik' })).id;
      await db('PATCH', `snake_users?id=eq.${u.id}`, { stripe_customer: customer }, 'return=minimal');
    }
    const params: Record<string, string> = {
      customer, mode: plan === 'lifetime' ? 'payment' : 'subscription',
      'line_items[0][price]': plan === 'lifetime' ? p.lifetime.id : p.monthly.id, 'line_items[0][quantity]': '1',
      success_url: `${SITE}/gracias.html`, cancel_url: `${SITE}/`,
      'metadata[app]': 'snaketik', 'metadata[snaketik_user]': u.id, 'metadata[plan]': plan,
    };
    if (plan === 'monthly') { params['subscription_data[metadata][app]'] = 'snaketik'; params['subscription_data[metadata][snaketik_user]'] = u.id; }
    else { params['payment_intent_data[metadata][app]'] = 'snaketik'; params['payment_intent_data[metadata][snaketik_user]'] = u.id; }
    const s = await stripe('POST', 'checkout/sessions', params);
    return { url: s.url };
  },
  async portal(b) {
    const u = await userFromToken(b.token);
    if (!u.stripe_customer) throw new ApiError('no_customer');
    const s = await stripe('POST', 'billing_portal/sessions', { customer: u.stripe_customer, return_url: SITE });
    return { url: s.url };
  },

  // ---------- administrador (Wylo / Stats Fluxy) ----------
  async admin_users(b) {
    await admin(b);
    const users = await db('GET', 'snake_users?select=id,username,role,plan,plan_until,trial_seconds,expires_at,banned,created_at,last_seen,app_version,stripe_sub,signup_ip,hwid&order=created_at.desc');
    const tk = await db('GET', 'snake_tiktok?select=user_id,username');
    const pays = await db('GET', 'snake_payments?select=user_id,amount_cents');
    const lives = await db('GET', 'snake_lives?select=user_id,seconds');
    return {
      users: users.map((u: any) => ({
        ...u, hwid: u.hwid ? u.hwid.slice(0, 10) : null, allowed: allowed(u), onTrial: onTrial(u),
        tiktoks: tk.filter((t: any) => t.user_id === u.id).map((t: any) => t.username),
        paid: pays.filter((p: any) => p.user_id === u.id).reduce((a: number, p: any) => a + p.amount_cents, 0) / 100,
        liveSeconds: lives.filter((l: any) => l.user_id === u.id).reduce((a: number, l: any) => a + l.seconds, 0),
      })),
    };
  },
  async admin_trial_create(b) {
    await admin(b);
    const username = String(b.username || '').trim(), password = String(b.password || '');
    if (!USER_RE.test(username) || password.length < 6) throw new ApiError('bad_input');
    const exists = await db('GET', `snake_users?username_lc=eq.${encodeURIComponent(username.toLowerCase())}&select=id`);
    if (exists[0]) throw new ApiError('username_taken');
    const u = (await db('POST', 'snake_users', {
      username, pass_hash: await rpc('snake_hash', { p: password }), role: 'trial', plan: 'trial',
      trial_seconds: Number(b.minutes || 30) * 60, expires_at: new Date(Date.now() + 24 * 3600e3).toISOString(),
    }))[0];
    return { user: { id: u.id, username: u.username, expires_at: u.expires_at, trial_seconds: u.trial_seconds } };
  },
  // prueba gratuita para una cuenta que ya existe (por nombre o id) o cambiar sus minutos. La cuenta no se borra nunca.
  async admin_trial_set(b) {
    await admin(b);
    const minutes = Math.max(0, Math.min(100000, Math.round(Number(b.minutes))));
    if (!Number.isFinite(minutes)) throw new ApiError('bad_input');
    const q = b.user_id ? `id=eq.${encodeURIComponent(b.user_id)}` : `username_lc=eq.${encodeURIComponent(String(b.username || '').trim().toLowerCase())}`;
    const u = (await db('GET', `snake_users?${q}&select=id,username,role,plan`))[0];
    if (!u) throw new ApiError('user_not_found', 404);
    const patch: Record<string, unknown> = { trial_seconds: minutes * 60 };
    if (u.role !== 'trial' && u.plan === 'none' && minutes > 0) patch.plan = 'trial'; // para avisarle cuando termine
    const out = (await db('PATCH', `snake_users?id=eq.${u.id}`, patch))[0];
    return { user: { id: out.id, username: out.username, trial_seconds: out.trial_seconds } };
  },

  // estadísticas de descargas de los programas (antes públicas con la clave anon; ahora solo el administrador)
  async admin_fluxy_stats(b) {
    await admin(b);
    return await rpc('fluxy_stats', { p_app: b.p_app || null, p_days: Math.max(1, Math.min(3650, Number(b.p_days) || 30)) });
  },

  // ---------- Discord (bot de tickets) ----------
  async admin_discord_channels(b) {
    await admin(b);
    const ch = await discord('GET', `guilds/${GUILD}/channels`);
    const cats = Object.fromEntries(ch.filter((c: any) => c.type === 4).map((c: any) => [c.id, c.name]));
    return { channels: ch.filter((c: any) => c.type === 0).sort((a: any, z: any) => a.position - z.position).map((c: any) => ({ id: c.id, name: c.name, category: cats[c.parent_id] || '' })) };
  },
  async admin_discord_send(b) {
    await admin(b);
    const content = String(b.content || '').slice(0, 2000);
    if (!/^\d{5,25}$/.test(String(b.channel_id || '')) || !content.trim()) throw new ApiError('bad_input');
    const m = await discord('POST', `channels/${b.channel_id}/messages`, { content, allowed_mentions: { parse: b.mentions ? ['everyone', 'roles', 'users'] : [] } });
    return { ok: true, id: m.id };
  },
  // registra /ticket-panel y publica el panel "Create ticket" en el canal de tickets
  async admin_discord_setup(b) {
    await admin(b);
    const app = await discord('GET', 'oauth2/applications/@me');
    await discord('PUT', `applications/${app.id}/guilds/${GUILD}/commands`, [
      { name: 'ticket-panel', description: 'Publica el panel de tickets en este canal', default_member_permissions: '8' },
    ]);
    const m = await discord('POST', `channels/${b.channel_id || TICKET_CHANNEL}/messages`, ticketPanel());
    return { ok: true, message: m.id, application: app.id };
  },

  async admin_reset_tiktok(b) { await admin(b); await db('DELETE', `snake_tiktok?user_id=eq.${b.user_id}`, undefined, 'return=minimal'); return { ok: true }; },
  async admin_cancel(b) {
    await admin(b);
    const u = (await db('GET', `snake_users?id=eq.${b.user_id}&select=*`))[0];
    if (u?.stripe_sub) { try { await stripe('DELETE', `subscriptions/${u.stripe_sub}`); } catch (_) { /* ya cancelada */ } }
    await db('PATCH', `snake_users?id=eq.${b.user_id}`, { plan: 'none', plan_until: null, stripe_sub: null }, 'return=minimal');
    return { ok: true };
  },
  async admin_ban(b) { await admin(b); await db('PATCH', `snake_users?id=eq.${b.user_id}`, { banned: !!b.banned }, 'return=minimal'); if (b.banned) await db('DELETE', `snake_sessions?user_id=eq.${b.user_id}`, undefined, 'return=minimal'); return { ok: true }; },
  async admin_delete(b) {
    await admin(b);
    const u = (await db('GET', `snake_users?id=eq.${b.user_id}&select=*`))[0];
    if (u?.role === 'admin') throw new ApiError('cannot_delete_admin');
    if (u?.stripe_sub) { try { await stripe('DELETE', `subscriptions/${u.stripe_sub}`); } catch (_) { /* nada */ } }
    await db('DELETE', `snake_users?id=eq.${b.user_id}`, undefined, 'return=minimal');
    return { ok: true };
  },
  async admin_grant(b) { // dar plan a mano (lifetime o N días de mensual)
    await admin(b);
    const patch = b.plan === 'lifetime' ? { plan: 'lifetime', plan_until: null } : { plan: 'monthly', plan_until: new Date(Date.now() + Number(b.days || 30) * 86400e3).toISOString() };
    await db('PATCH', `snake_users?id=eq.${b.user_id}`, patch, 'return=minimal');
    return { ok: true };
  },
  async admin_set_discord(b) {
    await admin(b);
    const link = String(b.discord || '').trim().slice(0, 120);
    await db('POST', 'snake_settings', { key: 'discord', value: link }, 'resolution=merge-duplicates,return=minimal');
    return { ok: true, discord: link };
  },
  // crea en Stripe (cuenta real) el producto, los 3 precios y el webhook si aún no existen. Idempotente.
  async admin_setup_stripe(b) {
    await admin(b);
    const have = await stripe('GET', 'prices?limit=10&lookup_keys[]=snaketik_monthly_launch&lookup_keys[]=snaketik_monthly&lookup_keys[]=snaketik_lifetime');
    const keys = new Set(have.data.map((p: any) => p.lookup_key));
    let product = have.data[0]?.product;
    if (!product) product = (await stripe('POST', 'products', { name: 'Snake Tik', description: 'Snake Tik: la serpiente que juega sola en tu directo de TikTok', 'metadata[app]': 'snaketik' })).id;
    const want: [string, string, number, boolean][] = [['snaketik_monthly_launch', 'Mensual (lanzamiento, 10 primeros)', 500, true], ['snaketik_monthly', 'Mensual', 800, true], ['snaketik_lifetime', 'Lifetime', 3000, false]];
    const created: string[] = [];
    for (const [key, nick, amount, recurring] of want) {
      if (keys.has(key)) continue;
      const p: Record<string, string> = { product, unit_amount: String(amount), currency: 'usd', lookup_key: key, nickname: nick, 'metadata[app]': 'snaketik' };
      if (recurring) p['recurring[interval]'] = 'month';
      await stripe('POST', 'prices', p); created.push(key);
    }
    const url = `${env.SUPABASE_URL}/functions/v1/snake-stripe`;
    const hooks = await stripe('GET', 'webhook_endpoints?limit=100');
    let hook = hooks.data.find((h: any) => h.url === url);
    if (!hook) {
      const ev = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid'];
      const p: Record<string, string> = { url, description: 'Snake Tik' };
      ev.forEach((e, i) => (p[`enabled_events[${i}]`] = e));
      hook = await stripe('POST', 'webhook_endpoints', p); created.push('webhook');
    }
    return { product, created, webhook: hook.id };
  },
  async admin_stats(b) {
    await admin(b);
    const pays = await db('GET', 'snake_payments?select=amount_cents,kind,created_at,username,currency&order=created_at.desc');
    const users = await db('GET', 'snake_users?select=role,plan,plan_until,created_at,last_seen,banned');
    const lives = await db('GET', 'snake_lives?select=seconds,started_at,tiktok');
    const now = Date.now(), day = 86400e3;
    const sum = (arr: any[]) => arr.reduce((a, p) => a + p.amount_cents, 0) / 100;
    return {
      revenue: { total: sum(pays), last30: sum(pays.filter((p: any) => now - new Date(p.created_at).getTime() < 30 * day)), monthly: sum(pays.filter((p: any) => p.kind === 'monthly')), lifetime: sum(pays.filter((p: any) => p.kind === 'lifetime')) },
      payments: pays.slice(0, 100),
      users: {
        total: users.length,
        monthly: users.filter((u: any) => u.plan === 'monthly' && u.plan_until && new Date(u.plan_until).getTime() > now).length,
        lifetime: users.filter((u: any) => u.plan === 'lifetime' && u.role !== 'admin').length,
        trial: users.filter((u: any) => u.role === 'trial').length,
        free: users.filter((u: any) => u.plan === 'none').length,
        active7: users.filter((u: any) => u.last_seen && now - new Date(u.last_seen).getTime() < 7 * day).length,
        online: users.filter((u: any) => u.last_seen && now - new Date(u.last_seen).getTime() < 3 * 60e3).length,
      },
      lives: { count: lives.length, hours: Math.round(lives.reduce((a: number, l: any) => a + l.seconds, 0) / 36) / 100 },
      signups: users.map((u: any) => u.created_at),
      prices: await prices(),
    };
  },
};

async function discord(method: string, path: string, body?: unknown) {
  if (!env.DISCORD_BOT_TOKEN) throw new ApiError('discord_not_configured', 500);
  const r = await fetch(`https://discord.com/api/v10/${path}`, {
    method, headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new ApiError('discord:' + txt.slice(0, 160), 502);
  return txt ? JSON.parse(txt) : null;
}
// el mismo panel que publica /ticket-panel desde el bot
function ticketPanel() {
  return {
    embeds: [{ title: 'TICKET', color: 0x2ecc71,
      description: 'To create a ticket, use the Create Ticket button\nPara crear un ticket, utilice el botón Create Ticket',
      footer: { text: 'Coreus Ticket · Compras · Support · Pruebas' } }],
    components: [{ type: 1, components: [{ type: 2, style: 3, label: 'Create ticket', emoji: { name: '📩' }, custom_id: 'tk_open' }] }],
  };
}

async function admin(b: any) {
  const u = await userFromToken(b.token);
  if (u.role !== 'admin') throw new ApiError('forbidden', 403);
  return u;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });
  try {
    const body = await req.json();
    const fn = actions[body.action];
    if (!fn) throw new ApiError('unknown_action', 404);
    if (Math.random() < 0.2) await cleanup();
    const out = await fn(body, req);
    return new Response(JSON.stringify(out), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('server_error', 500);
    if (!(e instanceof ApiError)) console.error('[snake-api]', (e as Error).message);
    return new Response(JSON.stringify({ error: err.code }), { status: err.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
