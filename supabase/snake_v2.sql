-- Snake Tik v2: límite de cuentas por equipo/IP, pruebas regaladas a cuentas existentes y tickets de Discord.
alter table public.snake_users add column if not exists hwid text;          -- huella del PC (sha256 del MachineGuid), nunca el valor en claro
alter table public.snake_users add column if not exists signup_ip text;
create index if not exists snake_users_hwid on public.snake_users (hwid);
create index if not exists snake_users_ip on public.snake_users (signup_ip);

-- tickets del bot de Discord: número correlativo (SnakeTikTok#222) y a quién pertenece cada canal
create sequence if not exists public.snake_ticket_seq start 100;
create table if not exists public.snake_tickets (
  id bigint primary key default nextval('public.snake_ticket_seq'),
  kind text not null check (kind in ('buy', 'support', 'trial')),
  product text,
  discord_user text not null,
  discord_name text,
  channel_id text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
alter table public.snake_tickets enable row level security;
revoke all on public.snake_tickets from anon, authenticated;
revoke all on sequence public.snake_ticket_seq from anon, authenticated;
