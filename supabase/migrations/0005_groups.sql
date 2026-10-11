-- Student group chats. Any member can add others; there is no admin role.
-- Safe to re-run.

create table if not exists app_groups (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  created_by      uuid not null references app_users (id) on delete cascade,
  -- Membership is a plain id list so a read is a single query; app_group_members
  -- mirrors it for referential integrity.
  members         uuid[] not null default '{}',
  last_message    text not null default '',
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists app_group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references app_groups (id) on delete cascade,
  user_id    uuid not null references app_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists app_group_messages (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references app_groups (id) on delete cascade,
  sender_id  uuid not null references app_users (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_groups_members_idx on app_groups using gin (members);
create index if not exists app_groups_last_message_idx on app_groups (last_message_at desc);
create index if not exists app_group_members_user_idx on app_group_members (user_id);
create index if not exists app_group_messages_group_idx on app_group_messages (group_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['app_groups', 'app_group_members', 'app_group_messages']
  loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format(
      'create trigger %I_touch before update on %I for each row execute function app_touch_updated_at()',
      t, t
    );
  end loop;
end $$;

-- Same lockdown as the other tables: RLS on with no policies, so the
-- publishable key cannot read anything; the backend bypasses it.
alter table app_groups         enable row level security;
alter table app_group_members  enable row level security;
alter table app_group_messages enable row level security;
