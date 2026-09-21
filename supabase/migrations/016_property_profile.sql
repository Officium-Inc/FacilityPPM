-- Company profile fields on properties
alter table properties add column if not exists address text;
alter table properties add column if not exists city text;
alter table properties add column if not exists country text;
alter table properties add column if not exists contact_email text;
alter table properties add column if not exists contact_phone text;
alter table properties add column if not exists website text;
