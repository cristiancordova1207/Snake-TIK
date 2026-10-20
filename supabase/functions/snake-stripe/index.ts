// Snake Tik · webhook de Stripe (--no-verify-jwt). No hace falta secreto de firma:
// cada evento se vuelve a pedir a la API de Stripe por su id, así solo se aceptan eventos reales.
// Solo trata lo que lleva metadata.app = "snaketik"; lo de FLUX lo ignora.
const env = Deno.env.toObject();
const DB = `${env.SUPABASE_URL}/rest/v1`;
const SR = env.SUPABASE_SERVICE_ROLE_KEY;

async function db(method: string, path: string, body?: unknown) {
  const r = await fetch(`${DB}/${path}`, { method, headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=ignore-duplicates' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error('db ' + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
}
async function stripe(path: string) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  if (!r.ok) throw new Error('stripe ' + r.status);
  return r.json();
}
const iso = (s?: number) => (s ? new Date(s * 1000).toISOString() : null);

async function payment(userId: string, kind: string, amount: number, currency: string, stripeId: string) {
  const u = (await db('GET', `snake_users?id=eq.${userId}&select=username`))[0];
  await db('POST', 'snake_payments?on_conflict=stripe_id', { user_id: userId, username: u?.username, kind, amount_cents: amount, currency, stripe_id: stripeId });
}

async function syncSub(subId: string) {
  const sub = await stripe(`subscriptions/${subId}`);
  if (sub.metadata?.app !== 'snaketik') return 'ignored';
  const userId = sub.metadata.snaketik_user;
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  const active = ['active', 'trialing', 'past_due'].includes(sub.status);
  const u = (await db('GET', `snake_users?id=eq.${userId}&select=plan`))[0];
  if (!u) return 'no_user';
  if (u.plan === 'lifetime') return 'lifetime';
  await db('PATCH', `snake_users?id=eq.${userId}`, active ? { plan: 'monthly', plan_until: iso(end), stripe_sub: sub.id } : { plan: 'none', stripe_sub: null });
  return active ? 'monthly' : 'ended';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  try {
    const { id } = await req.json();
    const ev = await stripe(`events/${encodeURIComponent(id)}`); // verificación: el evento existe en Stripe
    const o = ev.data.object;
    let r = 'ignored';
    if (ev.type === 'checkout.session.completed' && o.metadata?.app === 'snaketik') {
      const userId = o.metadata.snaketik_user;
      if (o.mode === 'payment' && o.payment_status === 'paid') {
        await db('PATCH', `snake_users?id=eq.${userId}`, { plan: 'lifetime', plan_until: null });
        await payment(userId, 'lifetime', o.amount_total, o.currency, o.payment_intent || o.id);
        r = 'lifetime';
      } else if (o.mode === 'subscription' && o.subscription) r = await syncSub(o.subscription);
    } else if (ev.type.startsWith('customer.subscription.') && o.metadata?.app === 'snaketik') {
      r = await syncSub(o.id);
    } else if ((ev.type === 'invoice.paid' || ev.type === 'invoice.payment_succeeded')) {
      const subId = o.subscription || o.parent?.subscription_details?.subscription;
      if (subId) {
        const sub = await stripe(`subscriptions/${subId}`);
        if (sub.metadata?.app === 'snaketik' && o.amount_paid > 0) {
          await payment(sub.metadata.snaketik_user, 'monthly', o.amount_paid, o.currency, o.id);
          r = await syncSub(subId);
        }
      }
    }
    console.log('[snake-stripe]', ev.type, ev.id, r);
    return new Response(JSON.stringify({ received: true, r }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[snake-stripe]', (e as Error).message);
    return new Response(JSON.stringify({ error: 'failed' }), { status: 500 });
  }
});
