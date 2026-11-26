-- 025_organizations.sql
-- Phase A of the Organization → Property → Floors/Units rebuild: an Organization layer above properties.
--
--   organizations             the client account: profile and the license (D29)
--   organization_members      Org Admins (`owner` / `admin`); each one is an Administrator in every property
--                             of the organization (D30)
--   organization_invitations  invitations to become an Org Admin (token stored only as a SHA-256 hash, D27)
--   properties.organization_id / property_type
--   engineers.org_member_id   set on Administrator rows that exist because of an org membership;
--   engineers.org_restore     the row's own state before the organization took it over (null when the
--                             organization created the row). Removing the Org Admin restores or deletes it.
--   audit_log.organization_id organization-level audit entries (license, termination, Org Admins)
--
-- Backfill: one organization per existing property, with the property's name, profile and license. A property
-- whose account is currently terminated gets an `organization.terminated` entry so it can be reactivated from
-- the organization. A TEMPORARY trigger creates an organization when the old app inserts a property without
-- one; 030_cleanup.sql drops it.
--
-- RLS (read-only, D25): Org Admins read their organization and its members; private.my_memberships() also
-- requires a usable organization license and accepts properties reached through app_metadata.org_ids.
-- organization_invitations has no policies (service role only).
--
-- Run BEFORE deploying the Phase A app. Safe to re-run. Never re-run 022 after 029.
-- Requires 021, 022 and 024 (checked below: the script stops before changing anything if one is missing).

-- ── Preconditions ──────────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.tenant_companies') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'properties' and column_name = 'license_expires_at'
     ) then
    raise exception 'Migration 021_floors_companies.sql has not been applied. Apply 019–024 in order, then re-run 025.';
  end if;
  if to_regprocedure('private.is_provider()') is null or to_regprocedure('private.my_memberships()') is null then
    raise exception 'Migration 022_role_aware_rls.sql has not been applied (private.is_provider / private.my_memberships are missing). Apply 022–024 in order, then re-run 025.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invitations' and column_name = 'token_hash'
  ) then
    raise exception 'Migration 024_hashed_tokens.sql has not been applied. Apply it, then re-run 025.';
  end if;
end $$;

-- ── Organizations ──────────────────────────────────────────────────────────

create table if not exists organizations (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  name                text not null check (length(trim(name)) between 1 and 120),
  legal_name          text,
  contact_email       text,
  contact_phone       text,
  address             text,
  city                text,
  country             text,
  website             text,
  license_status      text not null default 'trial' check (license_status in ('active', 'trial', 'suspended')),
  license_expires_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table organizations enable row level security;

create table if not exists organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_id          uuid not null,
  email            text not null,
  full_name        text not null default '',
  org_role         text not null default 'admin' check (org_role in ('owner', 'admin')),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_organization_members_user on organization_members (user_id);

alter table organization_members enable row level security;

create table if not exists organization_invitations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  email            text not null,
  invited_name     text,
  org_role         text not null default 'admin' check (org_role in ('owner', 'admin')),
  token_hash       text not null,
  invited_by       text,
  expires_at       timestamptz not null default (now() + interval '7 days'),
  used_at          timestamptz,
  created_at       timestamptz not null default now()
);

create unique index if not exists organization_invitations_token_hash_key on organization_invitations (token_hash);
create index if not exists idx_organization_invitations_org on organization_invitations (organization_id);

alter table organization_invitations enable row level security;

-- ── Properties, members and the audit log reference organizations ──────────

alter table properties add column if not exists organization_id uuid;
alter table properties add column if not exists property_type text not null default 'commercial';
alter table engineers add column if not exists org_member_id uuid;
alter table engineers add column if not exists org_restore jsonb;
alter table audit_log add column if not exists organization_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'properties_organization_id_fkey') then
    -- An organization cannot be deleted while it still has properties
    alter table properties
      add constraint properties_organization_id_fkey
      foreign key (organization_id) references organizations(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'properties_property_type_check') then
    alter table properties
      add constraint properties_property_type_check
      check (property_type in ('commercial', 'corporate', 'residential'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'engineers_org_member_id_fkey') then
    -- The app removes org-managed rows before it deletes an org member; set null is only a safety net
    alter table engineers
      add constraint engineers_org_member_id_fkey
      foreign key (org_member_id) references organization_members(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'audit_log_organization_id_fkey') then
    alter table audit_log
      add constraint audit_log_organization_id_fkey
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
end $$;

create index if not exists idx_properties_organization on properties (organization_id);
create index if not exists idx_engineers_org_member on engineers (org_member_id) where org_member_id is not null;
create index if not exists idx_audit_log_organization on audit_log (organization_id, created_at) where organization_id is not null;

-- ── Helpers for the backfill and the temporary trigger ──────────────────────

create schema if not exists private;

-- An organization slug derived from a property slug: lowercase letters, numbers and single hyphens, made unique
-- with a suffix from the property id. Older property slugs may not match the organization slug format.
create or replace function private.organization_slug_for(property_slug text, property_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  base text;
  candidate text;
begin
  base := trim(both '-' from regexp_replace(lower(coalesce(property_slug, '')), '[^a-z0-9]+', '-', 'g'));
  base := trim(both '-' from left(base, 50));
  if base = '' then
    base := 'org';
  end if;
  candidate := base;
  if exists (select 1 from public.organizations o where o.slug = candidate) then
    candidate := base || '-' || substr(md5(coalesce(property_id, gen_random_uuid())::text), 1, 6);
  end if;
  return candidate;
end $$;

revoke all on function private.organization_slug_for(text, uuid) from public, anon, authenticated;
-- The temporary trigger below runs as the inserting role (the app's service role)
grant execute on function private.organization_slug_for(text, uuid) to service_role;

-- ── Backfill: one organization per property ─────────────────────────────────

do $$
declare
  p record;
  new_org_id uuid;
  new_slug text;
  last_account record;
  created integer := 0;
begin
  for p in select * from public.properties where organization_id is null order by created_at loop
    new_slug := private.organization_slug_for(p.slug, p.id);

    insert into public.organizations (
      slug, name, legal_name, contact_email, contact_phone, address, city, country, website,
      license_status, license_expires_at, created_at
    )
    values (
      new_slug,
      left(coalesce(nullif(trim(p.name), ''), p.slug), 120),
      p.legal_name, p.contact_email, p.contact_phone, p.address, p.city, p.country, p.website,
      case when p.license_status in ('active', 'trial', 'suspended') then p.license_status else 'suspended' end,
      p.license_expires_at,
      coalesce(p.created_at, now())
    )
    returning id into new_org_id;

    update public.properties set organization_id = new_org_id where id = p.id;
    created := created + 1;

    -- A terminated property account becomes a terminated organization (reactivated from the organization)
    select a.action, a.metadata into last_account
    from public.audit_log a
    where a.property_id = p.id and a.action in ('account.terminated', 'account.reactivated')
    order by a.created_at desc
    limit 1;

    if found and last_account.action = 'account.terminated' then
      insert into public.audit_log (organization_id, property_id, action, entity_type, entity_id, metadata)
      values (
        new_org_id, null, 'organization.terminated', 'organization', new_org_id,
        jsonb_build_object(
          'reason', last_account.metadata ->> 'reason',
          'previous_license_status', last_account.metadata ->> 'previous_license_status',
          'property_ids', jsonb_build_array(p.id),
          'backfilled', true,
          'actor_role', 'provider'
        )
      );
    end if;
  end loop;

  if created > 0 then
    raise notice 'Created % organization(s), one per existing property.', created;
  end if;
end $$;

-- ── TEMPORARY: the old app inserts properties without an organization ──────
-- Dropped by 030_cleanup.sql (with private.organization_slug_for) once organization_id is NOT NULL.

create or replace function private.ensure_property_organization()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  new_org_id uuid;
begin
  if new.organization_id is null then
    insert into public.organizations (slug, name, license_status, license_expires_at)
    values (
      private.organization_slug_for(new.slug, new.id),
      left(coalesce(nullif(trim(new.name), ''), new.slug), 120),
      case when new.license_status in ('active', 'trial', 'suspended') then new.license_status else 'trial' end,
      new.license_expires_at
    )
    returning id into new_org_id;
    new.organization_id := new_org_id;
  end if;
  return new;
end $$;

revoke all on function private.ensure_property_organization() from public, anon, authenticated;

drop trigger if exists properties_ensure_organization on properties;
create trigger properties_ensure_organization
  before insert on properties
  for each row execute function private.ensure_property_organization();

-- ── RLS helpers ────────────────────────────────────────────────────────────

-- Organizations where the caller is an active Org Admin, the organization is in app_metadata.org_ids and its
-- license is usable. Mirrors resolveOrgMembership() in lib/authz/guard.ts.
create or replace function private.my_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and m.is_active
    and o.license_status <> 'suspended'
    and (o.license_expires_at is null or o.license_expires_at > now())
    and jsonb_typeof((select auth.jwt()) -> 'app_metadata' -> 'org_ids') = 'array'
    and ((select auth.jwt()) -> 'app_metadata' -> 'org_ids') ? m.organization_id::text
$$;

-- Same contract as 022, plus: the organization's license must be usable too (the most restrictive wins), and a
-- property is reachable through app_metadata.property_ids or through its organization in app_metadata.org_ids.
create or replace function private.my_memberships()
returns table (property_id uuid, engineer_id uuid, role text, company_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with claims as (
    select (select auth.uid()) as uid, (select auth.jwt()) -> 'app_metadata' as app_metadata
  ),
  memberships as (
    select
      e.property_id,
      e.id as engineer_id,
      -- Same normalization as lib/roles.ts roleKey(): runs of spaces, `_` and `-` become one `_`
      case regexp_replace(lower(trim(r.name)), '[[:space:]_-]+', '_', 'g')
        when 'administrator' then 'admin'
        when 'engineer' then 'head_engineer'
        else regexp_replace(lower(trim(r.name)), '[[:space:]_-]+', '_', 'g')
      end as role,
      case when c.is_active then e.company_id end as company_id
    from claims
    join public.engineers e on e.user_id = claims.uid
    join public.roles r on r.id = e.role_id
    join public.properties p on p.id = e.property_id
    left join public.organizations o on o.id = p.organization_id
    left join public.tenant_companies c on c.id = e.company_id and c.property_id = e.property_id
    where claims.uid is not null
      and e.is_active
      and p.license_status <> 'suspended'
      and (p.license_expires_at is null or p.license_expires_at > now())
      and (o.id is null or (o.license_status <> 'suspended' and (o.license_expires_at is null or o.license_expires_at > now())))
      and (
        case
          when jsonb_typeof(claims.app_metadata -> 'property_ids') = 'array'
            then (claims.app_metadata -> 'property_ids') ? e.property_id::text
          else (claims.app_metadata ->> 'property_id') = e.property_id::text
        end
        or (
          p.organization_id is not null
          and jsonb_typeof(claims.app_metadata -> 'org_ids') = 'array'
          and (claims.app_metadata -> 'org_ids') ? p.organization_id::text
        )
      )
  )
  select property_id, engineer_id, role, company_id
  from memberships
  where role in ('admin', 'property_manager', 'head_engineer', 'service_group', 'tenant')
$$;

revoke all on function private.my_org_ids() from public, anon;
revoke all on function private.my_memberships() from public, anon;
grant execute on function private.my_org_ids() to authenticated, service_role;
grant execute on function private.my_memberships() to authenticated, service_role;

-- ── Read policies (no write policies, D25) ─────────────────────────────────

revoke all on organizations, organization_members, organization_invitations from anon;
revoke insert, update, delete, truncate, references, trigger
  on organizations, organization_members, organization_invitations from authenticated;

drop policy if exists "Org admins read their organization" on organizations;
create policy "Org admins read their organization" on organizations
  for select to authenticated
  using ((select private.is_provider()) or id in (select private.my_org_ids()));

drop policy if exists "Org admins read org members" on organization_members;
create policy "Org admins read org members" on organization_members
  for select to authenticated
  using (
    (select private.is_provider())
    or user_id = (select auth.uid())
    or organization_id in (select private.my_org_ids())
  );

-- organization_invitations: no policies (service role only).

-- ── Report slugs that are now reserved ──────────────────────────────────────

do $$
declare
  clashes text;
begin
  select string_agg(slug, ', ') into clashes from public.properties where slug in ('org', 'new');
  if clashes is not null then
    raise notice 'Property slug(s) % are now reserved and cannot be opened; rename them before deploying.', clashes;
  end if;
end $$;
