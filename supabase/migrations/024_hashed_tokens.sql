-- 024_hashed_tokens.sql
-- Public link tokens (tenant sign-off, cost approval, member invitation) are stored only as SHA-256 hashes.
-- The raw token exists only in the emailed link; a database leak no longer exposes working links.
--
-- Existing raw tokens are hashed in place, so links already sent keep working. After this migration the app
-- writes `*_hash` columns only; CHECK constraints make sure a raw token can never be stored again.
-- Deploy the matching app version right after running this migration (older code still writes raw tokens).
-- Safe to re-run.

alter table work_orders add column if not exists sign_off_token_hash text;
alter table work_orders add column if not exists costing_token_hash text;
alter table invitations add column if not exists token_hash text;

-- sha256(text) matches lib/token.ts hashToken(): hex SHA-256 of the UTF-8 token
update work_orders
set sign_off_token_hash = encode(sha256(convert_to(sign_off_token, 'UTF8')), 'hex'),
    sign_off_token = null
where sign_off_token is not null;

update work_orders
set costing_token_hash = encode(sha256(convert_to(costing_token, 'UTF8')), 'hex'),
    costing_token = null
where costing_token is not null;

alter table invitations alter column token drop default;
alter table invitations alter column token drop not null;

update invitations
set token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex'),
    token = null
where token is not null;

create unique index if not exists work_orders_sign_off_token_hash_key
  on work_orders (sign_off_token_hash) where sign_off_token_hash is not null;
create unique index if not exists work_orders_costing_token_hash_key
  on work_orders (costing_token_hash) where costing_token_hash is not null;
create unique index if not exists invitations_token_hash_key
  on invitations (token_hash) where token_hash is not null;

-- Raw tokens are never stored again
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'work_orders_no_raw_sign_off_token') then
    alter table work_orders add constraint work_orders_no_raw_sign_off_token check (sign_off_token is null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'work_orders_no_raw_costing_token') then
    alter table work_orders add constraint work_orders_no_raw_costing_token check (costing_token is null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invitations_no_raw_token') then
    alter table invitations add constraint invitations_no_raw_token check (token is null);
  end if;
end $$;

-- The plaintext lookup indexes are no longer used
drop index if exists work_orders_sign_off_token_idx;
drop index if exists idx_work_orders_costing_token;
