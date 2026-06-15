-- Work order comments for tenant / head engineer / service group communication
create table work_order_comments (
  id            uuid        primary key default gen_random_uuid(),
  work_order_id uuid        not null references work_orders(id) on delete cascade,
  property_id   uuid        not null references properties(id) on delete cascade,
  author_name   text        not null,
  author_role   text        not null default 'admin',
  message       text        not null,
  created_at    timestamptz not null default now()
);

create index on work_order_comments (work_order_id, created_at);
create index on work_order_comments (property_id);

alter table work_order_comments enable row level security;

create policy "Property-scoped read wo_comments" on work_order_comments
  for select using (
    (auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid = property_id
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
  );

create policy "Property-scoped insert wo_comments" on work_order_comments
  for insert with check (
    (auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid = property_id
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
  );
