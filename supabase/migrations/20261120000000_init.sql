-- Netravex Technologies: Supabase (Postgres) schema
-- Run once in the Supabase SQL editor, or with `supabase db push`.
--
-- Design:
--   * Visitors never touch the table directly. The `submit-enquiry` Edge Function
--     validates the form and inserts with the service role key.
--   * Staff sign in with Supabase Auth. Only users listed in `admin_users` can
--     read, update (status and notes only) or delete enquiries.

create sequence if not exists public.inquiry_ref_seq start 10001;

-- ---------------------------------------------------------------- admins
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
-- No policies on purpose: nobody can read or edit this table through the API.
-- Add admins from the SQL editor (see README).

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ------------------------------------------------------------- enquiries
create table if not exists public.scoping_inquiries (
  id                 uuid primary key default gen_random_uuid(),
  reference_id       text not null unique
                       default ('NVX-' || nextval('public.inquiry_ref_seq')),

  full_name          text not null check (char_length(full_name) between 2 and 120),
  organization_name  text not null check (char_length(organization_name) between 2 and 150),
  org_type           text not null default 'Co-operative bank'
                       check (org_type in ('Co-operative bank', 'Growing enterprise', 'Other')),
  role_title         text check (char_length(role_title) <= 100),
  work_email         text not null
                       check (char_length(work_email) <= 150
                              and work_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone_number       text check (char_length(phone_number) <= 20),
  focus_area         text check (char_length(focus_area) <= 120),
  message            text check (char_length(message) <= 2000),

  -- 10-point readiness scorecard: array of 10 values, each null (not answered),
  -- 0 (No), 1 (Partly) or 2 (Yes). The score is computed by the Edge Function.
  answers            jsonb check (answers is null
                                  or (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) = 10)),
  readiness_score    numeric(3, 1) check (readiness_score between 0 and 10),
  readiness_percent  smallint check (readiness_percent between 0 and 100),

  -- DPDP consent trail
  consent_given      boolean not null check (consent_given),
  consent_at         timestamptz not null default now(),
  notice_version     text not null,

  status             text not null default 'NEW'
                       check (status in ('NEW', 'CONTACTED', 'SCHEDULED', 'CLOSED')),
  auto_reply_status  text not null default 'PENDING'
                       check (auto_reply_status in ('PENDING', 'SENT', 'FAILED')),
  auto_reply_error   text,
  admin_notes        text check (char_length(admin_notes) <= 4000),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists scoping_inquiries_created_idx on public.scoping_inquiries (created_at desc);
create index if not exists scoping_inquiries_status_idx  on public.scoping_inquiries (status);
create index if not exists scoping_inquiries_email_idx   on public.scoping_inquiries (lower(work_email), created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists scoping_inquiries_touch on public.scoping_inquiries;
create trigger scoping_inquiries_touch
  before update on public.scoping_inquiries
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------- security
alter table public.scoping_inquiries enable row level security;

revoke all on table public.scoping_inquiries from anon, authenticated;
grant select, delete on table public.scoping_inquiries to authenticated;
grant update (status, admin_notes) on table public.scoping_inquiries to authenticated;

drop policy if exists "admins read enquiries"   on public.scoping_inquiries;
drop policy if exists "admins update enquiries" on public.scoping_inquiries;
drop policy if exists "admins delete enquiries" on public.scoping_inquiries;

create policy "admins read enquiries"   on public.scoping_inquiries
  for select to authenticated using (public.is_admin());
create policy "admins update enquiries" on public.scoping_inquiries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete enquiries" on public.scoping_inquiries
  for delete to authenticated using (public.is_admin());

-- The service role (used only inside the Edge Function) bypasses RLS and can insert.
