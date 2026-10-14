-- A student may sign in with their username or their roster registration number,
-- so the number is cached on the user row (filled from the roster when the
-- account is provisioned). Not unique: the roster stays the source of truth.
alter table app_users add column if not exists reg_no text;

create index if not exists app_users_reg_no_idx on app_users (reg_no);
