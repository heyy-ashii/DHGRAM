-- User suspensions and content reports. Safe to re-run.

-- A suspension is stored as status = 'disabled' with a future suspended_until;
-- once that time passes the account is treated as active again. A permanent
-- disable (a "dismiss") leaves suspended_until null.
alter table app_users add column if not exists suspended_until timestamptz;

create table if not exists app_reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references app_users (id) on delete cascade,
  -- Denormalised so the queue stays readable after the content is removed.
  reporter_name text not null default '',
  kind          text not null check (kind in ('post', 'story', 'user')),
  target_id     uuid not null,
  target_label  text not null default '',
  reason        text not null default 'other'
                  check (reason in ('spam', 'harassment', 'hate', 'nudity', 'misinformation', 'other')),
  details       text not null default '',
  status        text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  handled_by    uuid references app_users (id) on delete set null,
  handled_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists app_reports_status_idx on app_reports (status, created_at desc);
create index if not exists app_reports_target_idx on app_reports (kind, target_id);

do $$
begin
  execute 'drop trigger if exists app_reports_touch on app_reports';
  execute 'create trigger app_reports_touch before update on app_reports for each row execute function app_touch_updated_at()';
end $$;

-- Same lockdown as the other tables: RLS on with no policies, so the
-- publishable key cannot read anything; the backend bypasses it.
alter table app_reports enable row level security;
