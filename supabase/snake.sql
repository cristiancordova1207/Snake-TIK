-- Snake Tik · cuentas, licencias, pagos y estadísticas (proyecto Supabase "FLUX Project").
-- Nada se lee con la clave anónima: todo pasa por la función Edge `snake-api` (service role).
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.snake_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_lc text generated always as (lower(username)) stored unique,
  pass_hash text not null,
  role text not null default 'user' check (role in ('user', 'admin', 'trial')),
  plan text not null default 'none' check (plan in ('none', 'monthly', 'lifetime', 'trial')),
  plan_until timestamptz,                 -- mensual: fin del periodo pagado
  stripe_customer text,
  stripe_sub text,
  trial_seconds int not null default 0,   -- prueba: segundos de directo que le quedan
  expires_at timestamptz,                 -- prueba: la cuenta se borra al pasar esta fecha
  banned boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen timestamptz,
  app_version text,
  country text
);

create table if not exists public.snake_sessions (
  token_hash text primary key,
  user_id uuid not null references public.snake_users on delete cascade,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.snake_tiktok (
  user_id uuid not null references public.snake_users on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, username)
);

create table if not exists public.snake_payments (
  id bigint generated always as identity primary key,
  user_id uuid references public.snake_users on delete set null,
  username text,
  kind text not null check (kind in ('monthly', 'lifetime')),
  amount_cents int not null,
  currency text not null default 'usd',
  stripe_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.snake_lives (
  id bigint generated always as identity primary key,
  user_id uuid references public.snake_users on delete cascade,
  tiktok text,
  started_at timestamptz not null default now(),
  last_beat timestamptz not null default now(),
  seconds int not null default 0
);
create index if not exists snake_lives_user on public.snake_lives (user_id, last_beat);

create table if not exists public.snake_settings (key text primary key, value jsonb not null);
insert into public.snake_settings (key, value) values
  ('discord', '"discord.gg/K6TCjKAyds"'),
  ('launch_slots', '10')                  -- los 10 primeros compradores pagan el precio de lanzamiento
on conflict (key) do nothing;

do $$ declare t text; begin
  foreach t in array array['snake_users', 'snake_sessions', 'snake_tiktok', 'snake_payments', 'snake_lives', 'snake_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- contraseñas con bcrypt (pgcrypto); solo las usa la función Edge
create or replace function public.snake_hash(p text) returns text
language sql security definer set search_path = public, extensions as $$ select extensions.crypt(p, extensions.gen_salt('bf', 10)) $$;
create or replace function public.snake_check(u text, p text) returns uuid
language sql security definer set search_path = public, extensions as $$
  select id from public.snake_users where username_lc = lower(u) and pass_hash = extensions.crypt(p, pass_hash) limit 1 $$;
revoke all on function public.snake_hash(text), public.snake_check(text, text) from public, anon, authenticated;
grant execute on function public.snake_hash(text), public.snake_check(text, text) to service_role;

-- cuenta de administrador: se crea a mano una sola vez (la contraseña NO va en este archivo):
--   insert into public.snake_users (username, pass_hash, role, plan)
--   values ('Wylo', extensions.crypt('<contraseña>', extensions.gen_salt('bf', 10)), 'admin', 'lifetime');
