-- One-to-one chess games. Safe to re-run.
--
-- A row is created as an invite (`pending`) by `invited_by`; the opponent either
-- accepts (row becomes `active`) or declines (row is deleted). Moves are stored
-- as a list of SAN strings and replayed with chess.js on the server, which is the
-- single source of truth for legality, so the client can never submit a move that
-- the rules do not allow.

create table if not exists app_games (
  id              uuid primary key default gen_random_uuid(),
  white_id        uuid not null references app_users (id) on delete cascade,
  black_id        uuid not null references app_users (id) on delete cascade,
  invited_by      uuid not null references app_users (id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'active', 'finished')),
  -- Winner side once finished: 'w', 'b' or 'draw'. Null while the game is live.
  result          text check (result in ('w', 'b', 'draw')),
  result_reason   text,
  moves           text[] not null default '{}',
  fen             text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  -- The side that has an open draw offer, cleared when it is accepted or declined.
  draw_offered_by uuid references app_users (id) on delete set null,
  accepted_at     timestamptz,
  finished_at     timestamptz,
  last_move_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists app_games_white_idx on app_games (white_id, last_move_at desc);
create index if not exists app_games_black_idx on app_games (black_id, last_move_at desc);
create index if not exists app_games_status_idx on app_games (status, last_move_at desc);

do $$
begin
  execute 'drop trigger if exists app_games_touch on app_games';
  execute 'create trigger app_games_touch before update on app_games for each row execute function app_touch_updated_at()';
end $$;

-- Same lockdown as the other tables: RLS on with no policies, so the
-- publishable key cannot read anything; the backend bypasses it.
alter table app_games enable row level security;
