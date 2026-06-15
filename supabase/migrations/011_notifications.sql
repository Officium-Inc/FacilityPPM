-- In-app notifications for @mentions and other events
create table notifications (
  id            uuid        primary key default gen_random_uuid(),
  property_id   uuid        not null references properties(id) on delete cascade,
  engineer_id   uuid        not null references engineers(id) on delete cascade,
  type          text        not null default 'mention',   -- 'mention' | 'assignment' | 'system'
  title         text        not null,
  message       text        not null,
  link          text,
  read          boolean     not null default false,
  created_at    timestamptz not null default now()
);

create index on notifications (engineer_id, read, created_at desc);
create index on notifications (property_id);

alter table notifications enable row level security;

create policy "Own notifications read" on notifications
  for select using (
    engineer_id in (
      select id from engineers
      where user_id = auth.uid()
    )
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
  );

create policy "Service can insert notifications" on notifications
  for insert with check (true);

create policy "Own notifications update" on notifications
  for update using (
    engineer_id in (
      select id from engineers
      where user_id = auth.uid()
    )
  );
