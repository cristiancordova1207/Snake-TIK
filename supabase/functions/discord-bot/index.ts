// Bot de tickets de Discord de Wylo (Supabase Edge Function, --no-verify-jwt).
// Discord llama a esta URL en cada botón/menú (Interactions Endpoint), así que no hace falta un servidor encendido: gratis.
// Secrets: DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY (la clave pública con la que Discord firma las peticiones).
const env = Deno.env.toObject();
const DB = `${env.SUPABASE_URL}/rest/v1`;
const SR = env.SUPABASE_SERVICE_ROLE_KEY;
const GUILD = '1506294281801957406';
const VOUCH_CHANNEL = '1506296971453923399';
const SITE = 'https://snaketik.pages.dev';

// productos del canal "Scripts / Games" (valor, nombre visible, prefijo del ticket)
const PRODUCTS: [string, string, string, string][] = [
  ['snake-tiktok-afk', 'Snake TikTok AFK', 'SnakeTikTok', '🐍'],
  ['farm-followers-tiktok', 'Farm Followers TikTok', 'FarmFollowers', '💫'],
  ['fake-robux-sender', 'Fake Robux Sender', 'FakeRobux', '💸'],
  ['dice-rigger', 'Dice Rigger', 'DiceRigger', '🎲'],
  ['visual-gift', 'Visual Gift', 'VisualGift', '✨'],
  ['auction-board', 'Auction Board', 'AuctionBoard', '🎬'],
];
const TRIALS = ['snake-tiktok-afk']; // juegos con prueba gratuita
// categorías del servidor (se buscan por nombre sin emojis; la primera de la lista es la que se crea si no existe ninguna)
const CATEGORIES = { buy: ['Ticket Buy', 'Tickets Compras'], support: ['Ticket Support', 'Tickets Support'], trial: ['Ticket Trial', 'Tickets Pruebas'] } as const;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// permisos: ver canal 1024 · enviar 2048 · insertar enlaces 16384 · adjuntar 32768 · historial 65536 · gestionar canales 16
const P_USER = String(1024 + 2048 + 16384 + 32768 + 65536);
const P_BOT = String(1024 + 2048 + 16384 + 32768 + 65536 + 16);

async function db(method: string, path: string, body?: unknown) {
  const r = await fetch(`${DB}/${path}`, {
    method, headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error('db ' + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
}
async function discord(method: string, path: string, body?: unknown) {
  const r = await fetch(`https://discord.com/api/v10/${path}`, {
    method, headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`discord ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

// ---------- firma de Discord (Ed25519) ----------
const hex = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));
let pubKey: CryptoKey | null = null;
async function verified(req: Request, body: string) {
  const sig = req.headers.get('x-signature-ed25519'), ts = req.headers.get('x-signature-timestamp');
  if (!sig || !ts || !env.DISCORD_PUBLIC_KEY) return false;
  pubKey ??= await crypto.subtle.importKey('raw', hex(env.DISCORD_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify('Ed25519', pubKey, hex(sig), new TextEncoder().encode(ts + body));
}

const json = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
const EPHEMERAL = 64;
const btn = (custom_id: string, label: string, emoji: string, style = 2) => ({ type: 2, style, label, emoji: { name: emoji }, custom_id });
const row = (...components: unknown[]) => ({ type: 1, components });

export function ticketPanel() {
  return {
    embeds: [{ title: 'TICKET', color: 0x2ecc71,
      description: 'To create a ticket, use the Create Ticket button\nPara crear un ticket, utilice el botón Create Ticket',
      footer: { text: 'Coreus Ticket · Compras · Support · Pruebas' } }],
    components: [row(btn('tk_open', 'Create ticket', '📩', 3))],
  };
}

// ---------- crear el ticket ----------
async function category(kind: keyof typeof CATEGORIES, channels: any[], appId: string) {
  for (const name of CATEGORIES[kind]) {
    const found = channels.find((c) => c.type === 4 && norm(c.name) === norm(name));
    if (found) return found.id;
  }
  const c = await discord('POST', `guilds/${GUILD}/channels`, { // el bot se deja ver a sí mismo para poder crear canales dentro
    name: `🎫 ${CATEGORIES[kind][0]}`, type: 4, permission_overwrites: [{ id: GUILD, type: 0, deny: '1024' }, { id: appId, type: 1, allow: P_BOT }],
  });
  return c.id;
}

function welcome(kind: string, product: string | null, user: string) {
  const p = PRODUCTS.find((x) => x[0] === product);
  if (kind === 'trial') {
    return `👋 <@${user}>\n🎁 **Free trial · ${p?.[1] ?? product}**\n\n` +
      `🇬🇧 To get a free trial you must send a **Vouch** message in <#${VOUCH_CHANNEL}>. Then tell us your **Snake Tik username** here and we will activate it.\n` +
      `🇪🇸 Para acceder a una prueba gratuita debes enviar un mensaje de **Vouch** en <#${VOUCH_CHANNEL}>. Después dinos aquí tu **usuario de Snake Tik** y te la activamos.`;
  }
  if (kind === 'support') {
    return `👋 <@${user}>\n🛟 **Support**\n\n🇬🇧 Tell us what happened (program, version, a screenshot helps). A staff member will reply soon.\n🇪🇸 Cuéntanos qué pasa (programa, versión, una captura ayuda). Alguien del equipo te responderá pronto.`;
  }
  if (product === 'snake-tiktok-afk') {
    return `👋 <@${user}>\n🐍 **Snake TikTok AFK**\n\n` +
      `🇬🇧 Download the program here: ${SITE}\nInside the program there is an option to **choose the plan you want** (Monthly or Lifetime) and pay by card.\n` +
      `🇪🇸 Descarga el programa aquí: ${SITE}\nDentro del programa hay una opción para **elegir el plan que quieras** (Mensual o Lifetime) y pagar con tarjeta.`;
  }
  return `👋 <@${user}>\n${p?.[3] ?? '🛒'} **${p?.[1] ?? product}**\n\n🇬🇧 Thanks! A staff member will reply soon with the price and payment options.\n🇪🇸 ¡Gracias! Alguien del equipo te responderá pronto con el precio y las formas de pago.`;
}

async function createTicket(i: any, kind: 'buy' | 'support' | 'trial', product: string | null) {
  const user = i.member?.user?.id ?? i.user?.id, uname = i.member?.user?.username ?? i.user?.username ?? 'user';
  const followUp = (content: string) => discord('PATCH', `webhooks/${i.application_id}/${i.token}/messages/@original`, { content, components: [] });
  try {
    const channels = await discord('GET', `guilds/${GUILD}/channels`);
    // un ticket abierto por persona y tipo/producto
    const open = await db('GET', `snake_tickets?discord_user=eq.${user}&kind=eq.${kind}&closed_at=is.null&select=id,channel_id,product`);
    const same = open.find((t: any) => (t.product ?? null) === product && channels.some((c: any) => c.id === t.channel_id));
    if (same) return followUp(`🎫 You already have this ticket open / Ya tienes este ticket abierto: <#${same.channel_id}>`);
    const parent = await category(kind, channels, i.application_id);
    const t = (await db('POST', 'snake_tickets', { kind, product, discord_user: user, discord_name: uname }))[0];
    const p = PRODUCTS.find((x) => x[0] === product);
    const label = kind === 'support' ? 'Support' : kind === 'trial' ? `Trial · ${p?.[1] ?? product}` : (p?.[1] ?? 'Ticket');
    const ch = await discord('POST', `guilds/${GUILD}/channels`, {
      name: `ticket-${t.id}`, type: 0, parent_id: parent, topic: `Ticket #${t.id} · ${label} · @${uname}`,
      permission_overwrites: [
        { id: GUILD, type: 0, deny: '1024' },
        { id: user, type: 1, allow: P_USER },
        { id: i.application_id, type: 1, allow: P_BOT },
      ],
    });
    await db('PATCH', `snake_tickets?id=eq.${t.id}`, { channel_id: ch.id });
    await discord('POST', `channels/${ch.id}/messages`, {
      embeds: [{ title: `🎫 Ticket #${t.id} · ${label}`, color: kind === 'support' ? 0x25f4ee : kind === 'trial' ? 0xd9ff6b : 0xfe2c55,
        description: welcome(kind, product, user) }],
      components: [row(btn('tk_close', 'Close ticket', '🔒', 4))],
      allowed_mentions: { users: [user] },
    });
    await followUp(`✅ Ticket created / Ticket creado: <#${ch.id}>`);
  } catch (e) {
    console.error('[discord-bot]', (e as Error).message);
    await followUp('❌ Could not create the ticket. Try again later. / No se pudo crear el ticket.').catch(() => {});
  }
}

async function closeTicket(i: any) {
  try {
    await new Promise((r) => setTimeout(r, 4000));
    await db('PATCH', `snake_tickets?channel_id=eq.${i.channel_id}`, { closed_at: new Date().toISOString() });
    await discord('DELETE', `channels/${i.channel_id}`);
  } catch (e) { console.error('[discord-bot] close', (e as Error).message); }
}

// ---------- interacciones ----------
function handle(i: any): Response {
  if (i.type === 1) return json({ type: 1 }); // PING de verificación
  if (i.type === 2 && i.data?.name === 'ticket-panel') return json({ type: 4, data: ticketPanel() });
  if (i.type !== 3) return json({ type: 4, data: { content: '🤔', flags: EPHEMERAL } });
  const id = i.data.custom_id;
  if (id === 'tk_open') {
    return json({ type: 4, data: { flags: EPHEMERAL, content: '**What do you need? · ¿Qué necesitas?**',
      components: [row(btn('tk_buy', 'Buy product · Comprar', '🛒', 1), btn('tk_support', 'Support', '🛟'), btn('tk_trial', 'Free trial · Prueba', '🎁', 3))] } });
  }
  if (id === 'tk_buy') {
    return json({ type: 7, data: { content: '🛒 **Choose a product · Elige un producto**', components: [row({
      type: 3, custom_id: 'tk_buy_sel', placeholder: 'Product / Producto',
      options: PRODUCTS.map(([value, label, , emoji]) => ({ value, label, emoji: { name: emoji } })) })] } });
  }
  if (id === 'tk_trial') {
    return json({ type: 7, data: { content: '🎁 **Free trial · Prueba de acceso**', components: [row({
      type: 3, custom_id: 'tk_trial_sel', placeholder: 'Game / Juego',
      options: PRODUCTS.filter((p) => TRIALS.includes(p[0])).map(([value, label, , emoji]) => ({ value, label, emoji: { name: emoji } })) })] } });
  }
  const start = (kind: 'buy' | 'support' | 'trial', product: string | null) => {
    // responder ya (Discord da 3 s) y crear el canal en segundo plano
    // @ts-ignore EdgeRuntime existe en Supabase
    EdgeRuntime.waitUntil(createTicket(i, kind, product));
    return json({ type: 7, data: { content: '⏳ Creating your ticket… · Creando tu ticket…', components: [] } });
  };
  if (id === 'tk_support') return start('support', null);
  if (id === 'tk_buy_sel' && PRODUCTS.some((p) => p[0] === i.data.values?.[0])) return start('buy', i.data.values[0]);
  if (id === 'tk_trial_sel' && TRIALS.includes(i.data.values?.[0])) return start('trial', i.data.values[0]);
  if (id === 'tk_close') {
    // @ts-ignore EdgeRuntime existe en Supabase
    EdgeRuntime.waitUntil(closeTicket(i));
    return json({ type: 4, data: { content: `🔒 Closing ticket in a few seconds… · Cerrando el ticket… (<@${i.member?.user?.id ?? ''}>)` } });
  }
  return json({ type: 4, data: { content: '🤔', flags: EPHEMERAL } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const body = await req.text();
  if (!(await verified(req, body))) return new Response('invalid request signature', { status: 401 });
  return handle(JSON.parse(body));
});
