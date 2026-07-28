-- 0004_office_jobs.sql
-- 真·虚拟机办公：异步任务表 + 成品存储桶。
-- 注意：本文件需由用户在 Supabase Dashboard → SQL Editor 中粘贴执行
-- （项目 sbp_ token 无数据库写权限，无法经 API 自动建表）。
--
-- 访问模型（无登录）：所有读写都通过 Edge Function `office` 用 service_role 完成，
-- 直接 anon / authenticated 访问被 RLS 阻断，保证 device_id 隔离由服务端强制。

create table if not exists public.office_jobs (
  id          uuid primary key default gen_random_uuid(),
  device_id   uuid not null,
  status      text not null default 'pending',  -- pending|planning|running|generating|done|error
  task        text not null,
  model       text,
  plan        jsonb default '[]'::jsonb,        -- [{title, done}]
  logs        text  default '',
  artifacts   jsonb default '[]'::jsonb,        -- [{name, path, size, kind}]
  error       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists office_jobs_device_idx
  on public.office_jobs (device_id, created_at desc);

-- 自动刷新 updated_at
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists office_jobs_touch on public.office_jobs;
create trigger office_jobs_touch before update on public.office_jobs
  for each row execute function public.touch_updated_at();

alter table public.office_jobs enable row level security;

-- 直接访问全部拒绝：写入/读取只能走 office 函数的 service_role（绕过 RLS）。
drop policy if exists office_jobs_no_direct on public.office_jobs;
create policy office_jobs_no_direct
  on public.office_jobs
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- 成品存储桶（private，只允许经函数签名的 URL 访问）
insert into storage.buckets (id, name, public)
values ('office-artifacts', 'office-artifacts', false)
on conflict (id) do nothing;

drop policy if exists office_artifacts_no_direct on storage.objects;
create policy office_artifacts_no_direct
  on storage.objects
  for all
  to anon, authenticated
  using (bucket_id = 'office-artifacts' and false)
  with check (bucket_id = 'office-artifacts' and false);
