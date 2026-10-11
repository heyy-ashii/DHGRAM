-- Profile avatars and Instagram-style stories. Safe to re-run.

-- A profile picture is stored inline as a data URL, so there is no object
-- storage to configure. Keep it small: the client downscales before sending.
alter table app_users add column if not exists avatar text not null default '';

create table if not exists app_stories (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references app_users (id) on delete cascade,
  -- Data URL for the story image, same rationale as app_users.avatar.
  image_url  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_story_views (
  id         uuid primary key default gen_random_uuid(),
  story_id   uuid not null references app_stories (id) on delete cascade,
  viewer_id  uuid not null references app_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_id, viewer_id)
);

create index if not exists app_stories_created_at_idx on app_stories (created_at desc);
create index if not exists app_stories_author_idx on app_stories (author_id, created_at desc);
create index if not exists app_story_views_story_idx on app_story_views (story_id);

do $$
declare t text;
begin
  foreach t in array array['app_stories', 'app_story_views']
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
alter table app_stories     enable row level security;
alter table app_story_views enable row level security;
